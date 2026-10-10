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
      import { createLink } from "./src/word-card/link.ts";
      import { fakeHost } from "./test/fake-host.ts";
      import { taberu } from "./test/fixtures.ts";
      Object.defineProperty(navigator, "clipboard", { value: undefined });
      window.starts = 0;
      window.approved = false;
      window.blockedLinks = 0;
      document.addEventListener("click", event => {
        if (event.composedPath().some(node => node instanceof Element && node.matches(".sb-link-open"))) {
          event.preventDefault();
          window.blockedLinks += 1;
        }
      }, true);
      window.begin = theme => {
        const link = createLink({apiBase: location.origin, clientId: "test-client", storage: localStorage,
          fetch: async url => {
            if (String(url).endsWith("/device_authorization")) {
              window.starts += 1;
              return Response.json({device_code: "private-device-code", user_code: "FST7-4RZ3",
                verification_uri_complete: location.origin + "/link?code=FST7-4RZ3", expires_in: 600, interval: 0.05});
            }
            return Response.json(window.approved ? {access_token: "test-token", expires_in: 3600} : {error: "authorization_pending"});
          }
        });
        const host = fakeHost({study: false});
        host.lookup = async () => link.linked() ? {status: "found", definition: taberu} : {status: "pending", message: "Sign in to look this word up"};
        host.resolvePending = link.signIn;
        card.setCardHost(host);
        card.setWriteState({canWrite: false, connected: false, readOnly: true});
        card.setPopupOptions({...card.DEFAULT_CARD_OPTIONS, hideAutomatically: false, theme});
        card.showNow(document.getElementById("word"));
      };
    `,
  }, bundle: true, write: false, format: "iife", logLevel: "silent",
});

const browser = await chromium.launch({ headless: true });
const screenshots = mkdtempSync(join(tmpdir(), "shirabe-sign-in-browser-"));
let page;
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1100, height: 800 }, isMobile: mobile, hasTouch: mobile });
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.route("https://manual-approval.test/**", route => route.fulfill({ contentType: "text/html; charset=utf-8",
      body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p lang="ja"><span id="word" data-lemma="食べる">食べる</span>。</p><label>Browser address field<input id="paste"></label>',
    }));
    await page.goto("https://manual-approval.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(theme => window.begin(theme), mobile ? "dark" : "light");
    const dialog = page.getByRole("dialog", { name: "Shirabe dictionary" });
    const direct = dialog.getByRole("link", { name: "Sign in to Shirabe", exact: true });
    await direct.click();
    assert.equal(await page.evaluate(() => window.blockedLinks), 1);
    assert.equal(context.pages().length, 1);
    assert.equal(await direct.getAttribute("target"), "_blank", "Desktop keeps its existing direct link");
    const summary = dialog.locator(".sb-link-manual summary");
    if (mobile) await summary.tap();
    else { await summary.focus(); await summary.press("Enter"); }
    const paste = page.getByRole("textbox", { name: "Browser address field", exact: true });
    for (const [name, expected] of [["Verification address", "https://manual-approval.test/link?code=FST7-4RZ3"], ["Confirmation code", "FST7-4RZ3"]]) {
      const field = dialog.getByRole("textbox", { name, exact: true });
      assert.equal(await field.getAttribute("readonly"), "");
      await field.focus();
      await field.press("ControlOrMeta+A");
      assert.equal(await field.evaluate(field => field.selectionEnd - field.selectionStart), expected.length);
      await field.press("ControlOrMeta+C");
      await paste.fill("");
      await paste.press("ControlOrMeta+V");
      assert.equal(await paste.inputValue(), expected, "native copy/paste works with navigator.clipboard unavailable");
    }
    assert.equal(await page.evaluate(() => navigator.clipboard), undefined);
    await dialog.getByRole("textbox", { name: "Confirmation code", exact: true }).scrollIntoViewIfNeeded();
    await dialog.getByRole("textbox", { name: "Confirmation code", exact: true }).focus();
    const layout = await dialog.evaluate(dialog => ({
      overflow: dialog.scrollWidth > dialog.clientWidth,
      minimumHeight: Math.min(...[...dialog.querySelectorAll(".sb-link-manual summary,.sb-link-manual textarea")].map(control => control.getBoundingClientRect().height)),
    }));
    assert.equal(layout.overflow, false);
    assert.ok(layout.minimumHeight >= 44);
    assert.doesNotMatch(await dialog.textContent(), /private-device-code/);
    const path = join(screenshots, `${mobile ? "mobile-dark" : "desktop-light"}-manual-approval.png`);
    await page.screenshot({ path });
    console.log(path);
    await page.evaluate(() => { window.approved = true; });
    await dialog.locator(".sb-headword").waitFor();
    assert.equal(await page.evaluate(() => window.starts), 1, "manual approval redeems the existing device flow");
    console.log(`${mobile ? "Mobile dark" : "Desktop light"}: blocked launch, native URL/code copy and paste, approval, and 44px fields passed`);
    await context.close();
  }
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(screenshots, "failure.png") });
    console.log(screenshots);
  }
  throw error;
} finally {
  await browser.close();
}
