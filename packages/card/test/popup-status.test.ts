import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import type { StudyDetails } from "../src/word-card/types.js";
import { fakeHost } from "./fake-host.js";
import { taberu } from "./fixtures.js";

const window = new Window({ url: "https://example.test" });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement,
  Node: window.Node, NodeFilter: window.NodeFilter, DOMRect: window.DOMRect,
  getComputedStyle: window.getComputedStyle.bind(window),
});

const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

test("prepared lookup badge shows its saved date online or offline without inventing freshness or an upsell", async () => {
  const card = await import("../src/word-card/card.js");
  const preparedAt = Date.UTC(2026, 8, 12, 12);
  for (const [offline, timestamp] of [[true, preparedAt], [false, preparedAt], [true, undefined], [true, NaN]] as const) {
    const def = { ...taberu, offline, preparedAt: timestamp };
    const host = fakeHost({ study: false, definitions: { "食べる": def } });
    card.setCardHost(host);
    card.setWriteState({ canWrite: false, connected: false, readOnly: true });
    const word = document.createElement("span");
    word.dataset.lemma = "食べる";
    document.body.append(word);
    card.showNow(word);
    await settle();
    const shadow = document.querySelector(".sb-host")!.shadowRoot!;
    const badge = shadow.querySelector<HTMLElement>(".sb-badge-prepared");
    if (Number.isFinite(timestamp)) {
      assert.equal(badge?.textContent, `Saved for offline use · ${new Date(preparedAt).toLocaleDateString()}`);
      assert.match(badge!.title, /while online/);
      assert.match(badge!.getAttribute("aria-label")!, /Desktop preparation/);
    } else assert.equal(badge, null);
    assert.doesNotMatch(shadow.textContent!, /Get Shirabe Pro|Connect to save/);
    assert.equal(def.preparedAt, timestamp);
    assert.equal(def.offline, offline);
    card.dismissPopup();
  }
});

test("read-only study status names its actual source and never infers fresh state from old word attributes", async () => {
  const card = await import("../src/word-card/card.js");
  for (const source of ["Anki collection", undefined]) {
    for (const available of [true, false]) {
      const host = fakeHost({ definitions: { "食べる": taberu }, details: { "食べる": { state: "due", decks: [] } } });
      host.study!.source = source;
      if (!available) host.study!.states = async () => null;
      card.setCardHost(host);
      card.setWriteState({ canWrite: false, connected: false, readOnly: true });
      const word = document.createElement("span");
      word.dataset.lemma = "食べる";
      word.dataset.state = "retired";
      document.body.append(word);
      card.showNow(word);
      await settle();
      const shadow = document.querySelector(".sb-host")!.shadowRoot!;
      const caption = shadow.querySelector('[aria-label="Study status"]');
      assert.equal(caption?.textContent ?? null, available ? `${source ?? "Shirabe"} · Due` : null);
      assert.equal(shadow.querySelector(".sb-btn-save"), null);
      assert.equal(shadow.querySelector(".sb-btn-known"), null);
      assert.equal(shadow.querySelector(".sb-btn-open"), null);
      card.dismissPopup();
    }
  }
});

test("late read-only study status keeps the focused headword and ignores a dismissed popup", async () => {
  const card = await import("../src/word-card/card.js");
  for (const dismiss of [false, true]) {
    let release!: (details: Record<string, StudyDetails>) => void;
    const pending = new Promise<Record<string, StudyDetails>>(resolve => { release = resolve; });
    const host = fakeHost({ definitions: { "食べる": taberu } });
    host.study!.source = "Anki collection";
    host.study!.states = () => pending;
    card.setCardHost(host);
    card.setWriteState({ canWrite: false, connected: true, readOnly: true });
    const word = document.createElement("span");
    word.dataset.lemma = "食べる";
    document.body.append(word);
    card.showNow(word);
    await settle();
    const shadow = document.querySelector(".sb-host")!.shadowRoot!;
    try {
      assert.ok(shadow.querySelector(".sb-body"), "Definition controls must exist before study metadata arrives");
      const headword = shadow.querySelector<HTMLButtonElement>(".sb-headword");
      assert.ok(headword);
      headword.focus();
      if (dismiss) card.dismissPopup();
      release({ "食べる": { state: "due", decks: [] } });
      await settle();
      assert.equal(shadow.querySelector('[aria-label="Study status"]')?.textContent ?? null,
        dismiss ? null : "Anki collection · Due");
      assert.equal(word.dataset.state, dismiss ? undefined : "due");
      if (!dismiss) assert.equal(shadow.activeElement, headword);
    } finally {
      release({});
      card.dismissPopup();
    }
  }
});

test("Manage is absent without an actual host destination, even if the word retains an API card URL", async () => {
  const card = await import("../src/word-card/card.js");
  for (const url of [undefined, "https://dictionary.test/study/cards?card_id=7"]) {
    const host = fakeHost({ definitions: { "食べる": taberu }, details: { "食べる": { state: "due", decks: [] } } });
    host.study!.source = "Anki collection";
    host.study!.urlForWord = async () => url;
    card.setCardHost(host);
    card.setWriteState({ canWrite: true, connected: true, readOnly: false });
    const word = document.createElement("span");
    word.dataset.lemma = "食べる";
    word.dataset.cardUrl = "https://old.test/study/cards";
    document.body.append(word);
    card.showNow(word);
    await settle();
    const shadow = document.querySelector(".sb-host")!.shadowRoot!;
    const manage = shadow.querySelector<HTMLAnchorElement>(".sb-btn-open");
    if (url) assert.equal(manage?.href, url);
    else assert.equal(manage?.getAttribute("href") ?? null, null);
    card.dismissPopup();
  }
});
