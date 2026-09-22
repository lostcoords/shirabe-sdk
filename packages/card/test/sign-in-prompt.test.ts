import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { createLink } from "../src/word-card/link.js";

test("each device-flow prompt exposes selectable URL and code without clipboard or app launching", async () => {
  const window = new Window({ url: "https://example.test" });
  Object.assign(globalThis, { document: window.document, window, Node: window.Node });
  Object.defineProperty(window.navigator, "clipboard", { value: undefined });
  const verification = "https://shirabe.org/link?code=FST7-4RZ3";
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: window.localStorage, fetch: async (url) => Response.json(
    (url instanceof Request ? url.url : String(url)).endsWith("/device_authorization")
      ? { device_code: "private-device-code", user_code: "FST7-4RZ3", verification_uri_complete: verification, interval: 0.001, expires_in: 600 }
      : { access_token: "private-access-token", expires_in: 3600 },
  ) });
  const prompts: HTMLElement[] = [];
  await Promise.all([link.signIn((prompt) => { prompts.push(prompt as HTMLElement); }),
    link.signIn((prompt) => { prompts.push(prompt as HTMLElement); })]);
  assert.equal(link.linked(), true);
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    document.body.replaceChildren(prompt);
    const summary = prompt.querySelector("summary");
    assert.equal(summary?.textContent, "Copy sign-in link and code");
    assert.equal(prompt.querySelector("details")!.open, false);
    summary!.click();
    const fields = [...prompt.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")];
    assert.equal(fields.length, 2);
    for (const [index, expected] of [verification, "FST7-4RZ3"].entries()) {
      const field = fields[index];
      assert.equal(field.readOnly, true);
      assert.equal(field.value, expected);
      assert.ok(field.closest("label"));
      field.focus();
      field.select();
      assert.equal(field.selectionEnd! - field.selectionStart!, expected.length);
    }
    assert.equal(prompt.querySelector("a")?.href, verification);
    assert.equal(prompt.querySelector("a")?.target, "_blank");
    assert.match(prompt.textContent!, /open your browser yourself/);
    assert.doesNotMatch(prompt.textContent!, /private-device-code|private-access-token/);
  }
});
