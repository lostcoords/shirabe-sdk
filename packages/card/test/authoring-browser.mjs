import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: {
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    contents: `
      import * as card from "./src/word-card/card.ts";
      import { fakeHost } from "./test/fake-host.ts";
      import { taberu, kimi } from "./test/fixtures.ts";
      import { apiExampleSearch } from "./src/word-card/api-example-search.ts";
      window.proposals = [];
      window.copied = [];
      window.reviewGestures = [];
      window.exampleRequests = 0;
      window.signOuts = 0;
      window.nativeError = null;
      window.signOutError = null;
      document.addEventListener("keydown", event => {
        if ([" ", "Enter"].includes(event.key)) window.reviewGestures.push(event.key);
      });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async text => { window.copied.push(text); }
      }});
      window.openFixture = (native, theme) => {
        const definition = {...taberu, offline: true, preparedAt: Date.UTC(2026, 8, 12, 12), examples: []};
        const host = fakeHost({study: native, definitions: {"食べる": definition, "君": kimi}, details: {"食べる": {state: "due", decks: []}}});
        if (host.study) {
          host.study.source = "Anki collection";
          host.study.urlForWord = async () => undefined;
        }
        if (!native) host.account = { signOut: async () => {
          if (window.signOutError) throw new Error(window.signOutError);
          window.signOuts += 1;
        } };
        host.exampleSearch = apiExampleSearch(async path => {
          window.exampleRequests += 1;
          const more = new URL(path, "https://authoring.test").searchParams.has("cursor");
          return {
            sentences: [{id: more ? "tatoeba:8" : "tatoeba:7", japanese: more ? "パンを食べる。" : "ご飯を食べた。",
              translations: [{lang: "en", text: "I ate rice."}, {lang: "es", text: "Comí arroz."}]}],
            pagination: {hasMore: !more, cursor: more ? null : "next/+=="}
          };
        });
        if (native) host.authoring = {
          addNote: selection => { window.proposals.push(selection); },
          updateNote: selection => {
            if (window.nativeError) throw new Error(window.nativeError);
            window.proposals.push(selection);
          },
          findNotes: selection => { window.proposals.push(selection); }
        };
        card.setCardHost(host);
        card.setWriteState({canWrite: false, connected: false, readOnly: true});
        card.setPopupOptions({...card.DEFAULT_CARD_OPTIONS, hideAutomatically: false, theme});
        const word = document.getElementById("word");
        word.dataset.lemma = "食べる";
        word.dataset.surface = "食べた";
        word.dataset.sentence = "昨日、ご飯を食べた。";
        card.showNow(word);
        window.nextLookup = () => card.showNow(document.getElementById("second"));
        window.reopenLookup = () => card.showNow(word);
        window.dismissFixture = () => card.dismissPopup();
      };
    `,
  },
  bundle: true, write: false, format: "iife", logLevel: "silent",
});

const browser = await chromium.launch({ headless: true });
const screenshots = mkdtempSync(join(tmpdir(), "shirabe-authoring-browser-"));
let currentPage;
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1100, height: 800 },
      isMobile: mobile, hasTouch: mobile,
    });
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(5000);
    await page.route("https://authoring.test/**", route => route.fulfill({
      contentType: "text/html; charset=utf-8", body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><button id="launcher">Look up</button><p lang="ja">昨日、ご飯を<span id="word">食べた</span>。<span id="second" data-lemma="君">君</span></p>',
    }));
    await page.goto("https://authoring.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("button", { name: "Look up", exact: true }).focus();
    await page.evaluate(({ native, theme }) => window.openFixture(native, theme), { native: !mobile, theme: mobile ? "dark" : "light" });
    const dialog = page.getByRole("dialog", { name: "Shirabe dictionary" });
    await dialog.waitFor({ state: "visible" });
    await dialog.locator(".sb-badge-prepared").waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".sb-host").shadowRoot.querySelector(".sb-popup")).opacity === "1");
    assert.match(await dialog.locator(".sb-badge-prepared").getAttribute("aria-label"), /Desktop preparation/);
    assert.equal(await dialog.getByRole("note", { name: /Saved for offline use.*Desktop preparation/ }).count(), 1);
    if (!mobile) assert.equal(await dialog.getByRole("note", { name: "Study status", exact: true }).textContent(), "Anki collection · Due");
    else assert.equal(await dialog.getByRole("note", { name: "Study status", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "launcher", "hover lookup does not steal focus");
    await page.screenshot({ path: join(screenshots, `${mobile ? "mobile-dark" : "desktop-light"}-prepared.png`) });
    const summary = dialog.locator(".sb-authoring summary");
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshots, `${mobile ? "mobile-dark" : "desktop-light"}-collapsed.png`) });
    if (mobile) await summary.tap();
    else { await summary.focus(); await summary.press("Enter"); }
    assert.equal(await dialog.getByRole("checkbox", { name: /Pronunciation audio/ }).count(), 0, "hosts without verified insertable clips offer no audio insertion");
    assert.equal(await page.evaluate(() => window.exampleRequests), 0);
    const findExamples = dialog.getByRole("button", { name: "Find examples", exact: true });
    if (mobile) await findExamples.tap();
    else { await findExamples.focus(); await findExamples.press("Enter"); }
    const eat = dialog.getByRole("checkbox", { name: "to eat", exact: true });
    const example = dialog.getByRole("checkbox", { name: "ご飯を食べた。 I ate rice. Tatoeba · tatoeba:7 · English", exact: true });
    await example.waitFor();
    assert.equal(await findExamples.evaluate(button => button.getRootNode().activeElement === button), true, "example search completion preserves focus");
    if (mobile) { await eat.tap(); await example.tap(); }
    else {
      await eat.focus(); await eat.press("Space");
      await example.focus(); await example.press("Space");
    }
    assert.equal(await eat.isChecked(), false);
    assert.equal(await example.isChecked(), true);
    assert.equal(await page.evaluate(() => window.exampleRequests), 1);
    const keyword = dialog.getByRole("searchbox", { name: "Keyword", exact: true });
    await keyword.fill("bread");
    assert.equal(await example.isVisible(), false);
    assert.match(await dialog.getByRole("status", { name: "Example search status" }).textContent(), /1 hidden by filters/);
    await keyword.fill("");
    await dialog.getByRole("spinbutton", { name: "Maximum characters", exact: true }).fill("6");
    assert.equal(await example.isVisible(), false);
    await dialog.getByRole("spinbutton", { name: "Maximum characters", exact: true }).fill("7");
    assert.equal(await example.isVisible(), true);
    await dialog.getByRole("combobox", { name: "Translation", exact: true }).selectOption("without");
    assert.equal(await example.isVisible(), false);
    await dialog.getByRole("combobox", { name: "Translation", exact: true }).selectOption("any");
    assert.equal(await example.isChecked(), true);
    await dialog.getByRole("spinbutton", { name: "Maximum characters", exact: true }).fill("");
    await dialog.getByRole("combobox", { name: "Translation language", exact: true }).selectOption("es");
    await findExamples.click();
    const spanish = dialog.getByRole("checkbox", { name: "ご飯を食べた。 Comí arroz. Tatoeba · tatoeba:7 · Español", exact: true });
    await spanish.check();
    await dialog.getByRole("button", { name: "More examples", exact: true }).click();
    await dialog.getByRole("checkbox", { name: /パンを食べる。 Comí arroz/ }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "More examples", exact: true }).isVisible(), false);
    await spanish.uncheck();
    await dialog.getByRole("combobox", { name: "Translation language", exact: true }).selectOption("en");
    assert.equal(await example.isChecked(), true, "language changes preserve the selected original translation");
    await dialog.getByRole("combobox", { name: "Expression", exact: true }).selectOption("食べた");
    if (!mobile) {
      const add = dialog.getByRole("button", { name: "Add Anki note", exact: true });
      await add.focus(); await add.press("Enter");
      await page.waitForFunction(() => window.proposals.length === 1);
      assert.equal(await add.evaluate(button => button.getRootNode().activeElement === button), true, "native completion returns focus to its action");
      const proposal = await page.evaluate(() => window.proposals[0]);
      assert.equal(proposal.expression, "食べた");
      assert.equal(proposal.entry, "jmdict:1358280");
      assert.deepEqual(proposal.senseRefs, ["jmdict#1"]);
      assert.deepEqual(proposal.examples, [{ japanese: "ご飯を食べた。", translation: "I ate rice.", source: "Tatoeba", reference: "tatoeba:7", translationLanguage: "en" }]);
      const message = "The Anki editor is still loading. Close and reopen it, then try again.";
      await page.evaluate(message => { window.nativeError = message; }, message);
      const update = dialog.getByRole("button", { name: "Update this note", exact: true });
      await update.focus(); await update.press("Enter");
      const feedback = dialog.getByRole("status", { name: "Copy and note status", exact: true });
      assert.equal(await feedback.textContent(), message);
      assert.equal(await update.isEnabled(), true);
      assert.equal(await update.evaluate(button => button.getRootNode().activeElement === button), true);
      const visible = await feedback.evaluate(status => {
        const rect = status.getBoundingClientRect();
        const popup = status.closest(".sb-popup").getBoundingClientRect();
        return rect.top >= popup.top && rect.bottom <= popup.bottom;
      });
      assert.equal(visible, true, "native recovery instructions are visible without hunting below field choices");
      await page.screenshot({ path: join(screenshots, "desktop-native-error.png") });
      await page.evaluate(() => { window.nativeError = null; });
      await update.press("Enter");
      await page.waitForFunction(() => window.proposals.length === 2);
    } else {
      assert.equal(await dialog.getByRole("button", { name: "Add Anki note", exact: true }).count(), 0);
    }
    for (const name of ["Copy expression", "Copy reading", "Copy selected definition", "Copy selected examples"]) {
      const copy = dialog.getByRole("button", { name, exact: true });
      if (mobile) await copy.tap();
      else await copy.click();
      assert.equal(await copy.evaluate(button => button.getRootNode().activeElement === button), true, "copy completion preserves focus");
    }
    assert.deepEqual(await page.evaluate(() => window.copied), [
      "食べた", "たべる", "to live on (e.g. a salary)", "ご飯を食べた。\nI ate rice.\n\nTatoeba\ntatoeba:7",
    ]);
    assert.deepEqual(await page.evaluate(() => window.reviewGestures), []);
    const layout = await dialog.locator(".sb-authoring").evaluate(section => {
      const popup = section.closest(".sb-popup");
      const controls = [...section.querySelectorAll('button, summary, select, input:not([type="checkbox"]), .sb-authoring-choice')]
        .filter(control => control.getClientRects().length);
      const length = section.querySelector('input[type="number"]').getBoundingClientRect();
      const translation = [...section.querySelectorAll(".sb-authoring-filters select")].pop().getBoundingClientRect();
      return {
        minimumHeight: Math.min(...controls.map(control => control.getBoundingClientRect().height)),
        horizontalOverflow: popup.scrollWidth > popup.clientWidth,
        right: popup.getBoundingClientRect().right,
        viewport: window.innerWidth,
        filterGap: translation.left - length.right,
      };
    });
    assert.ok(layout.minimumHeight >= 44, JSON.stringify(layout));
    assert.equal(layout.horizontalOverflow, false);
    assert.ok(layout.right <= layout.viewport);
    assert.ok(layout.filterGap >= 5, JSON.stringify(layout));
    await example.scrollIntoViewIfNeeded();
    const screenshot = join(screenshots, `${mobile ? "mobile-dark" : "desktop-light"}.png`);
    await page.screenshot({ path: screenshot });
    console.log(screenshot);
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error("WebView clipboard unavailable"); };
    });
    await dialog.getByRole("button", { name: "Copy expression", exact: true }).click();
    const manual = dialog.getByRole("textbox", { name: "Select and copy" });
    await manual.waitFor({ state: "visible" });
    assert.equal(await manual.inputValue(), "食べた");
    assert.equal(await manual.evaluate(text => text.selectionEnd - text.selectionStart), "食べた".length);
    await manual.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "launcher", "Escape returns focus to the opener");
    await page.evaluate(() => window.reopenLookup());
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Close", exact: true }).focus();
    await page.evaluate(() => window.nextLookup());
    const back = dialog.getByRole("button", { name: "Previous lookup", exact: true });
    await back.focus();
    await back.press("Enter");
    await page.waitForFunction(() => document.querySelector(".sb-host").shadowRoot.querySelector(".sb-headword")?.textContent.includes("食"));
    while (await back.isEnabled()) {
      await back.focus();
      await back.press("Enter");
    }
    assert.equal(await dialog.evaluate(box => box.getRootNode().activeElement === box), true, "history boundary keeps focus in the dialog");
    await dialog.press("Alt+ArrowRight");
    await dialog.locator(".sb-authoring summary").focus();
    await dialog.locator(".sb-authoring summary").press("Alt+ArrowLeft");
    assert.equal(await dialog.evaluate(box => box.getRootNode().activeElement === box), true, "Alt+Back leaves replaced authoring controls in the dialog");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "launcher", "Close returns focus to the opener");
    await page.evaluate(() => window.reopenLookup());
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Close", exact: true }).focus();
    await page.evaluate(() => window.dismissFixture());
    assert.equal(await page.evaluate(() => document.activeElement?.id), "launcher", "native Back dismissal restores the opener");
    if (mobile) {
      await page.evaluate(() => window.reopenLookup());
      await dialog.waitFor({ state: "visible" });
      const signOut = dialog.locator(".sb-account summary");
      await signOut.tap();
      assert.equal(await page.evaluate(() => window.signOuts), 0);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).tap();
      assert.equal(await signOut.evaluate(summary => summary.getRootNode().activeElement === summary), true);
      await signOut.tap();
      await page.screenshot({ path: join(screenshots, "mobile-sign-out.png") });
      const message = "Device storage is unavailable. Close and reopen the study screen, then try again.";
      await page.evaluate(message => { window.signOutError = message; }, message);
      await dialog.getByRole("button", { name: "Sign out", exact: true }).tap();
      assert.equal(await dialog.getByRole("status", { name: "Sign-out status", exact: true }).textContent(), message);
      assert.equal(await page.evaluate(() => window.signOuts), 0);
      assert.equal(await dialog.isVisible(), true);
      await page.screenshot({ path: join(screenshots, "mobile-sign-out-error.png") });
      await page.evaluate(() => { window.signOutError = null; });
      await dialog.getByRole("button", { name: "Sign out", exact: true }).tap();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => window.signOuts), 1);
      assert.equal(await page.evaluate(() => document.activeElement?.id), "launcher");
    }
    console.log(`${mobile ? "Mobile dark" : "Desktop light"}: selection, copy, native capability, keys, focus, and 44px targets passed`);
    await context.close();
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    console.log(await currentPage.locator(".sb-authoring").ariaSnapshot());
    await currentPage.screenshot({ path: join(screenshots, "failure.png") });
    console.log(screenshots);
  }
  throw error;
} finally {
  await browser.close();
}
