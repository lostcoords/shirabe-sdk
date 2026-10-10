import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { accountActions } from "../src/word-card/account-actions.js";
import { fakeHost } from "./fake-host.js";
import { taberu } from "./fixtures.js";

const window = new Window({ url: "https://example.test" });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement,
  Node: window.Node, NodeFilter: window.NodeFilter, DOMRect: window.DOMRect,
  getComputedStyle: window.getComputedStyle.bind(window),
});
const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

test("sign-out requires explicit confirmation; Cancel changes no account state and restores summary focus", () => {
  let calls = 0;
  const actions = accountActions({ signOut() { calls += 1; } }, () => {});
  document.body.replaceChildren(actions);
  const summary = actions.querySelector("summary")!;
  assert.equal(summary.textContent, "Sign out of Shirabe on this device");
  summary.click();
  assert.equal(calls, 0);
  actions.querySelectorAll("button")[1].click();
  assert.equal(calls, 0);
  assert.equal((actions as HTMLDetailsElement).open, false);
  assert.equal(document.activeElement, summary);
});

test("sign-out waits for host completion, prevents duplicates and keeps a failed attempt open for retry", async () => {
  let reject!: (error: Error) => void;
  let calls = 0;
  let closed = 0;
  const actions = accountActions({ signOut: async () => {
    calls += 1;
    if (calls === 1) await new Promise<void>((_resolve, reject_) => { reject = reject_; });
  } }, () => { closed += 1; });
  document.body.replaceChildren(actions);
  actions.querySelector("summary")!.click();
  const confirm = actions.querySelector("button")!;
  confirm.click();
  confirm.click();
  assert.equal(calls, 1);
  assert.equal(closed, 0);
  assert.equal(actions.getAttribute("aria-busy"), "true");
  reject(new Error("Device storage is unavailable. Close and reopen the study screen, then try again."));
  await settle();
  assert.equal(closed, 0);
  assert.equal(actions.querySelector('[role="status"]')!.textContent, "Device storage is unavailable. Close and reopen the study screen, then try again.");
  assert.equal(confirm.disabled, false);
  confirm.click();
  await settle();
  assert.equal(calls, 2);
  assert.equal(closed, 1);
  assert.equal(actions.hasAttribute("aria-busy"), false);
});

test("the actual popup offers sign-out even after lookup failure, and hosts without it have no dead action", async () => {
  const card = await import("../src/word-card/card.js");
  let signedOut = 0;
  for (const capable of [true, false]) {
    const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
    host.lookup = async () => ({ status: "failed", message: "Connection refused" });
    if (capable) host.account = { signOut: () => { signedOut += 1; } };
    card.setCardHost(host);
    const word = document.createElement("span");
    word.dataset.lemma = "食べる";
    document.body.append(word);
    card.showNow(word);
    await settle();
    const shadow = document.querySelector(".sb-host")!.shadowRoot!;
    assert.match(shadow.querySelector(".sb-popup")!.textContent!, /Connection refused/);
    const actions = shadow.querySelector(".sb-account");
    assert.equal(!!actions, capable);
    if (actions) {
      actions.querySelector("summary")!.click();
      actions.querySelector("button")!.click();
      await settle();
      assert.equal(shadow.querySelector(".sb-visible"), null);
    }
    card.dismissPopup();
  }
  assert.equal(signedOut, 1);
});

test("the popup only offers sign-out while its live Anki account is connected", async () => {
  const card = await import("../src/word-card/card.js");
  let connected = false;
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  host.account = { signOut() {}, connected: () => connected };
  card.setCardHost(host);
  const word = document.createElement("span");
  word.dataset.lemma = "食べる";
  document.body.append(word);

  card.showNow(word);
  await settle();
  let shadow = document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-account"), null);
  card.dismissPopup();

  connected = true;
  card.showNow(word);
  await settle();
  shadow = document.querySelector(".sb-host")!.shadowRoot!;
  assert.ok(shadow.querySelector(".sb-account"));
  card.dismissPopup();

  connected = false;
  card.showNow(word);
  await settle();
  shadow = document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-account"), null);
  card.dismissPopup();
});
