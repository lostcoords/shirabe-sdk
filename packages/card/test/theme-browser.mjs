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
      card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
      window.showCard = theme => {
        card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, theme, hideAutomatically: false });
        card.showNow(document.getElementById("word"));
      };
    `,
  }, bundle: true, write: false, format: "iife", logLevel: "silent",
});
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<p><span id="word" data-lemma="食べる">食べる</span>。</p>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const [system, theme, dark] of [
    ["dark", "system", true], ["light", "system", false],
    ["dark", "light", false], ["light", "dark", true],
  ]) {
    await page.emulateMedia({ colorScheme: system, reducedMotion: "reduce" });
    await page.evaluate(theme => window.showCard(theme), theme);
    const popup = page.locator(".sb-host .sb-popup");
    await popup.locator(".sb-headword ruby rt").waitFor();
    const colors = await popup.evaluate(popup => ({
      background: getComputedStyle(popup).backgroundColor,
      ink: getComputedStyle(popup).color,
      accent: getComputedStyle(popup.querySelector(".sb-headword ruby rt")).color,
    }));
    assert.deepEqual(colors, dark
      ? { background: "rgb(37, 37, 38)", ink: "rgb(232, 232, 232)", accent: "rgb(19, 159, 247)" }
      : { background: "rgb(255, 255, 255)", ink: "rgb(17, 24, 39)", accent: "rgb(3, 105, 161)" },
    `SDK defaults use Shirabe colors with ${theme} theme on a ${system} system`);
  }
  console.log("Default card theme passed for both system themes and explicit overrides");
} finally {
  await browser.close();
}
