import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: { resolveDir: fileURLToPath(new URL("../", import.meta.url)), contents: `
    import * as card from "./src/word-card/card.ts";
    import { apiHost } from "./src/word-card/api-host.ts";
    window.copies = [];
    window.proposals = [];
    window.reviewKeys = [];
    window.parses = 0;
    const candidate = {
      id: "食べる", dictionary: "jmdict", sourceId: "1", headword: "食べる", reading: "タベル", common: true,
      pitch: [], forms: [], entries: [{ dictionary: "jmdict", type: "word", sourceId: "1",
        senses: [{ position: 0, definitions: [{ lang: "en", text: "to eat" }], tags: [] }] }],
    };
    const host = apiHost({ apiBase: "https://review.test", fetch: async (url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/parse")) {
        if (++window.parses === 1) return new Response(JSON.stringify({ detail: "Connection interrupted. Check your connection and retry." }), { status: 503 });
        return new Response(JSON.stringify({ stackFingerprint: "test", results: [{ tokens: [{
          surface: "食べました", lemma: "食べる", reading: "タベマシタ", startOffset: 0, endOffset: 5,
          kind: "inflected", inflection: { forms: [{ code: "past", label: "past" }, { code: "polite", label: "polite" }], base: "食べる" },
        }] }] }));
      }
      if (path.endsWith("/sentences")) return new Response(JSON.stringify({
        sentences: [{ id: "tatoeba:7", japanese: "パンを食べる。", translations: [{ lang: "en", text: "I eat bread." }] }],
        pagination: { hasMore: false, cursor: null },
      }));
      return new Response(JSON.stringify(path.endsWith("/identify") ? { words: [{ candidates: [candidate] }] } : candidate));
    } });
    window.openFixture = (native, theme) => {
      if (native) host.authoring = { addNote: selection => { window.proposals.push(selection); } };
      card.setCardHost(host);
      card.setWriteState({ canWrite: false, connected: false, readOnly: true });
      card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, lookupDelay: 0, hideAutomatically: false, audioAutoplay: false, theme });
      const anchor = document.getElementById("scan");
      card.scheduleTextLookup("食べました。次の文。", anchor.getBoundingClientRect(), "昨日、食べました。", 3,
        { node: anchor.firstChild, offset: 0 });
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.copies.push(text); } } });
    document.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) window.reviewKeys.push(event.key); });
  ` },
  bundle: true, write: false, format: "iife", logLevel: "silent",
});
const browser = await chromium.launch({ headless: true });
const screenshots = mkdtempSync(join(tmpdir(), "shirabe-authoring-review-"));
let page;
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1100, height: 800 }, isMobile: mobile, hasTouch: mobile });
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.route("https://review.test/**", route => route.fulfill({ contentType: "text/html; charset=utf-8",
      body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><button id="opener">Look up</button><p lang="ja">昨日、<span id="scan">食べました</span>。次の文。<span hidden>秘密の答え</span></p>',
    }));
    await page.goto("https://review.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("button", { name: "Look up", exact: true }).focus();
    await page.evaluate(mobile => window.openFixture(!mobile, mobile ? "dark" : "light"), mobile);
    const dialog = page.getByRole("dialog", { name: "Shirabe dictionary" });
    const retry = dialog.getByRole("button", { name: "Retry lookup", exact: true });
    await retry.waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".sb-host").shadowRoot.querySelector(".sb-popup")).opacity === "1");
    assert.match(await dialog.getByRole("status").textContent(), /Check your connection and retry/);
    assert.ok((await retry.boundingBox()).height >= 44);
    const prefix = mobile ? "mobile-dark" : "desktop-light";
    await page.screenshot({ path: join(screenshots, prefix + "-retry.png") });
    if (mobile) await retry.tap();
    else { await retry.focus(); await retry.press("Enter"); }
    await dialog.locator(".sb-inflection").waitFor();
    assert.equal(await dialog.locator(".sb-inflection").textContent(), "食べました → 食べる · past · polite");
    assert.equal(await page.evaluate(() => window.parses), 2);
    assert.equal(await dialog.getByRole("button", { name: "Previous lookup", exact: true }).isDisabled(), true);
    assert.equal(await dialog.evaluate(box => box.getRootNode().activeElement === box), true);
    assert.equal(await page.evaluate(() => [...CSS.highlights.get("sb-scan")][0].toString()), "食べました");
    await page.screenshot({ path: join(screenshots, prefix + "-matched-surface.png") });
    const summary = dialog.locator(".sb-authoring summary");
    if (mobile) await summary.tap();
    else { await summary.focus(); await summary.press("Enter"); }
    const current = dialog.getByRole("group", { name: "Current sentence", exact: true });
    const currentChoice = current.getByRole("checkbox", { name: "昨日、食べました。", exact: true });
    assert.equal(await currentChoice.isChecked(), false);
    if (mobile) await currentChoice.tap();
    else { await currentChoice.focus(); await currentChoice.press("Space"); }
    await current.getByRole("button", { name: "Copy current sentence", exact: true }).click();
    assert.equal(await dialog.getByRole("button", { name: "Copy selected translations", exact: true }).isDisabled(), true);
    await page.screenshot({ path: join(screenshots, prefix + "-current-sentence.png") });
    await dialog.getByRole("button", { name: "Find examples", exact: true }).click();
    const example = dialog.getByRole("checkbox", { name: /パンを食べる。 I eat bread/ });
    await example.check();
    for (const name of ["Copy selected sentences", "Copy selected translations"]) {
      const copy = dialog.getByRole("button", { name, exact: true });
      if (mobile) await copy.tap();
      else { await copy.focus(); await copy.press("Enter"); }
      assert.equal(await copy.evaluate(button => button.getRootNode().activeElement === button), true);
    }
    assert.deepEqual(await page.evaluate(() => window.copies), ["昨日、食べました。", "昨日、食べました。\n\nパンを食べる。", "I eat bread."]);
    const layout = await dialog.evaluate(box => ({ width: box.clientWidth, scroll: box.scrollWidth, right: box.getBoundingClientRect().right, viewport: innerWidth }));
    assert.equal(layout.scroll, layout.width);
    assert.ok(layout.right <= layout.viewport);
    assert.equal(await dialog.getByRole("checkbox", { name: /Pronunciation audio/ }).count(), 0);
    await page.screenshot({ path: join(screenshots, prefix + "-independent-copy.png") });
    if (!mobile) {
      await dialog.getByRole("button", { name: "Add Anki note", exact: true }).click();
      const selection = await page.evaluate(() => window.proposals[0]);
      assert.equal(selection.surface, "食べました");
      assert.deepEqual(selection.examples, [
        { japanese: "昨日、食べました。", translation: null, source: "Current card" },
        { japanese: "パンを食べる。", translation: "I eat bread.", source: "Tatoeba", reference: "tatoeba:7", translationLanguage: "en" },
      ]);
    }
    assert.deepEqual(await page.evaluate(() => window.reviewKeys), []);
    await dialog.getByRole("button", { name: "Copy selected translations", exact: true }).press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement.id), "opener");
    console.log(prefix + ": Retry, exact API highlight, current sentence, independent copy, focus, and review-key isolation passed");
    await context.close();
  }
  console.log(screenshots);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: join(screenshots, "failure.png") });
  console.log(screenshots);
  throw error;
} finally { await browser.close(); }
