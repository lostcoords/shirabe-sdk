import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: {
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    contents: `
      import * as card from "./src/word-card/card.ts";
      import { fakeHost } from "./test/fake-host.ts";
      import { taberu } from "./test/fixtures.ts";
      card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, hideAutomatically: false });
      window.beginScan = () => {
        const host = fakeHost({ study: false });
        host.lookup = () => new Promise(resolve => {
          window.finishScan = () => resolve({ status: "found", definition: taberu });
        });
        card.setCardHost(host);
        card.scheduleTextLookup("食べることが好きです。", new DOMRect(20, 20, 20, 20), "食べることが好きです。", 0, undefined, "text", { immediate: true });
      };
      window.beginResults = () => {
        const host = fakeHost({ study: false });
        const definition = { ...taberu, senses: [{ ...taberu.senses[0], glosses: [{ lang: "eng", tag: "EN", text: "a long definition ".repeat(50) }] }] };
        host.lookup = async () => ({ status: "found", definition, alternatives: [definition,
          { ...taberu, headword: "他べる", entry: "other", senses: [taberu.senses[0]] },
          { ...definition, headword: "多べる", entry: "third" }] });
        card.setCardHost(host);
        card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, hideAutomatically: false,
          themeVariables: { "--sb-popup-max-height": "320px" } });
        card.showNow(document.getElementById("word"));
      };
    `,
  }, bundle: true, write: false, format: "iife", logLevel: "silent",
});
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" });
  await page.setContent('<p><span id="word" data-lemma="食べる">食べる</span>ことが好きです。</p>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  if (!process.argv.includes("scroll")) {
    await page.evaluate(() => window.beginScan());
    await page.waitForFunction(() => typeof window.finishScan === "function");
    assert.equal(await page.locator(".sb-host .sb-visible").count(), 0, "raw scans stay hidden until the matched headword is known");
    await page.evaluate(() => window.finishScan());
    const heading = page.locator(".sb-host .sb-headword");
    await heading.waitFor();
    assert.equal(await heading.evaluate(element => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll("rt").forEach(node => node.remove());
      return clone.textContent;
    }), "食べる");
    console.log("Raw lookup opens with the matched headword, never the full sentence");
  }
  if (!process.argv.includes("loading")) {
    await page.evaluate(() => window.beginResults());
    const body = page.locator(".sb-host .sb-body");
    await body.locator(".sb-alternative").first().waitFor({ state: "attached" });
    assert.equal(await body.locator(".sb-alternative:visible").count(), 2, "all dictionary results share one scroll area");
    const rect = await body.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const initialHeight = await page.locator(".sb-host .sb-popup").evaluate(element => element.getBoundingClientRect().height);
    for (const delta of [80, 80, 80, 80, 80, 80, 80, 80, -80, -80]) {
      const before = await body.evaluate(element => element.scrollTop);
      await page.mouse.wheel(0, delta);
      await page.waitForFunction(({ before, delta }) => {
        const body = document.querySelector(".sb-host").shadowRoot.querySelector(".sb-body");
        return Math.abs(body.scrollTop - (before + delta)) < 2;
      }, { before, delta });
      assert.equal(await page.locator(".sb-host .sb-popup").evaluate(element => element.getBoundingClientRect().height), initialHeight, "wheel scrolling does not resize the popup");
    }
    await page.locator(".sb-host .sb-results-toggle").click();
    await page.locator(".sb-host .sb-result-link").nth(1).click();
    const entryOffset = await body.evaluate(element => element.querySelector(".sb-alternative").getBoundingClientRect().top - element.getBoundingClientRect().top);
    assert.ok(Math.abs(entryOffset) < 2, "the overview scrolls to an entry instead of replacing the list");
    assert.equal(await body.locator(".sb-alternative:visible").count(), 2);
    console.log("Wheel scrolling moves continuously through results without resizing or paging");
  }
} finally {
  await browser.close();
}
