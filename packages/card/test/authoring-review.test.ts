import assert from "node:assert/strict";
import test, { before } from "node:test";
import { Window } from "happy-dom";
import { apiHost } from "../src/word-card/api-host.js";
import { authoringActions } from "../src/word-card/authoring.js";
import type { AuthoringSelection, ExampleSearchQuery, LookupResult } from "../src/word-card/host.js";
import { fakeHost } from "./fake-host.js";
import { kimi, taberu } from "./fixtures.js";

const window = new Window({ url: "https://example.test" });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node,
  NodeFilter: window.NodeFilter, DOMRect: window.DOMRect, getComputedStyle: window.getComputedStyle.bind(window),
});
let card: typeof import("../src/word-card/card.js");
before(async () => { card = await import("../src/word-card/card.js"); });
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
const shadow = () => document.querySelector(".sb-host")!.shadowRoot!;
function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === name || button.getAttribute("aria-label") === name);
  assert.ok(found, `button ${name} exists`);
  return found;
}
function word(surface = "食べました"): HTMLElement {
  const word = document.createElement("span");
  word.textContent = surface;
  word.dataset.surface = surface;
  word.dataset.lemma = "食べる";
  document.body.append(word);
  return word;
}

test("raw API lookup highlights and proposes only the parsed surface, not the scan window", async () => {
  const highlights = new Map<string, Set<Range>>();
  const oldCSS = globalThis.CSS;
  const oldHighlight = Object.getOwnPropertyDescriptor(globalThis, "Highlight");
  Object.assign(globalThis, { CSS: { highlights }, Highlight: class extends Set<Range> { constructor(...ranges: Range[]) { super(ranges); } } });
  const candidate = { id: "食べる", dictionary: "jmdict", sourceId: "1", headword: "食べる", reading: "タベル", common: true,
    pitch: [], forms: [], entries: [{ dictionary: "jmdict", type: "word", sourceId: "1",
      senses: [{ position: 0, definitions: [{ lang: "en", text: "eat" }], tags: [] }] }] };
  const host = apiHost({ apiBase: "https://fixture.invalid", fetch: async (url) => new Response(JSON.stringify(
    new URL((url instanceof Request ? url.url : String(url))).pathname.endsWith("/parse") ? { stackFingerprint: "test", results: [{ tokens: [{
      surface: "食べました", lemma: "食べる", startOffset: 0, endOffset: 5,
      kind: "inflected", inflection: { forms: [{ code: "past", label: "past" }, { code: "polite", label: "polite" }], base: "食べる" },
    }] }] } : { words: [{ candidates: [candidate] }] },
  )) });
  const proposals: AuthoringSelection[] = [];
  let origin!: HTMLElement;
  host.rememberOrigin = (word) => { origin = word; };
  host.authoring = { addNote: (selection) => { proposals.push(selection); } };
  try {
    card.setCardHost(host);
    card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, lookupDelay: 0, audioAutoplay: false });
    const source = word("昨日、食べました。次の文。");
    card.scheduleTextLookup("食べました。次の文。", source.getBoundingClientRect(), "昨日、食べました。", 3,
      { node: source.firstChild as Text, offset: 3 });
    await settle();
    button(shadow(), "Add Anki note").click();
    await settle();
    assert.equal(proposals[0].surface, "食べました");
    assert.equal(proposals[0].lemma, "食べる");
    assert.equal(origin.dataset.targetStart, "3");
    assert.equal(origin.dataset.targetEnd, "8");
    assert.match(shadow().querySelector(".sb-inflection")!.textContent!, /食べました → 食べる · past · polite/);
    assert.equal([...highlights.get("sb-scan") ?? []][0]?.toString(), "食べました");
    const cached = await host.lookup("食べる", "word", { surface: "食べました" });
    assert.equal(cached.status === "found" && cached.definition?.sourceForm, undefined);
  } finally {
    card.dismissPopup();
    Object.assign(globalThis, { CSS: oldCSS });
    if (oldHighlight) Object.defineProperty(globalThis, "Highlight", oldHighlight);
    else Reflect.deleteProperty(globalThis, "Highlight");
  }
});

test("wrapped inflection belongs to its original entry, survives return, and never mutates a cached definition", async () => {
  const definition = { ...taberu, sourceForm: undefined, inflection: undefined, inflectionBase: undefined };
  const original = structuredClone(definition);
  const host = fakeHost({ study: false, definitions: { 食べる: definition, 君: kimi } });
  host.candidatesFor = () => [definition, kimi].map((def) => ({ entry: def.entry!, headword: def.headword, reading: def.reading, common: true }));
  card.setCardHost(host);
  const target = word();
  target.dataset.entry = definition.entry;
  target.dataset.inflection = '["past","polite"]';
  target.dataset.inflectionBase = "食べる";
  card.showNow(target);
  await settle();
  assert.equal(shadow().querySelector(".sb-inflection")?.textContent, "食べました → 食べる · past · polite");
  (shadow().querySelectorAll<HTMLButtonElement>(".sb-candidate")[1]).click();
  await settle();
  assert.equal(shadow().querySelector(".sb-inflection"), null);
  card.dismissPopup();
  card.showNow(target);
  await settle();
  assert.equal(shadow().querySelector(".sb-inflection"), null, "reopening an alternate identity cannot acquire the original explanation");
  (shadow().querySelectorAll<HTMLButtonElement>(".sb-candidate")[0]).click();
  await settle();
  assert.equal(shadow().querySelector(".sb-inflection")?.textContent, "食べました → 食べる · past · polite");
  assert.deepEqual(definition, original);
  card.dismissPopup();
});

test("choosing a candidate after a raw scan keeps the matched surface for pinned lookup and authoring", async () => {
  const host = fakeHost({ study: false });
  const requests: string[][] = [];
  const proposals: AuthoringSelection[] = [];
  host.lookup = async () => ({ status: "found", definition: { ...taberu, sourceForm: "食べました" },
    candidates: [taberu, kimi].map((def) => ({ entry: def.entry!, headword: def.headword, reading: def.reading, common: true })) });
  host.lookupEntry = async (entry, surface) => { requests.push([entry, surface]); return { status: "found", definition: kimi }; };
  host.authoring = { addNote: (selection) => { proposals.push(selection); } };
  card.setCardHost(host);
  card.scheduleTextLookup("食べました。次の文。", new DOMRect(0, 0, 10, 10), "昨日、食べました。", 3);
  await settle();
  shadow().querySelectorAll<HTMLButtonElement>(".sb-candidate")[1].click();
  await settle();
  button(shadow(), "Add Anki note").click();
  await settle();
  assert.deepEqual(requests, [[kimi.entry, "食べました"]]);
  assert.equal(proposals[0].surface, "食べました");
  assert.equal(proposals[0].entry, kimi.entry);
  card.dismissPopup();
});

test("a wrapped lexical adverb explains its adjective base without changing note identity", async () => {
  const definition = { ...kimi, headword: "確かに", reading: "たしかに", entry: "jmdict:1205770" };
  const host = fakeHost({ study: false, definitions: { 確かに: definition } });
  const proposals: AuthoringSelection[] = [];
  host.authoring = { addNote: (selection) => { proposals.push(selection); } };
  card.setCardHost(host);
  const target = word("確かに");
  target.dataset.lemma = "確かに";
  target.dataset.entry = definition.entry;
  target.dataset.inflection = '["adverbial"]';
  target.dataset.inflectionBase = "確か";
  card.showNow(target);
  await settle();
  button(shadow(), "Add Anki note").click();
  await settle();
  assert.equal(shadow().querySelector(".sb-inflection")?.textContent, "確かに → 確か · adverbial");
  assert.equal(proposals[0].lemma, "確かに");
  assert.equal(proposals[0].entry, definition.entry);
  card.dismissPopup();
});

test("malformed or oversized wrapped explanations cannot break lookup or override the resolved entry", async () => {
  for (const inflection of ["{", '[42]', '"past"', JSON.stringify(Array(33).fill("past"))]) {
    const host = fakeHost({ study: false, definitions: { 食べる: { ...taberu, inflection: undefined, sourceForm: undefined } } });
    card.setCardHost(host);
    const target = word();
    target.dataset.entry = taberu.entry;
    target.dataset.inflection = inflection;
    target.dataset.inflectionBase = "食べる";
    card.showNow(target);
    await settle();
    assert.ok(shadow().querySelector(".sb-headword"));
    assert.equal(shadow().querySelector(".sb-inflection"), null);
    card.dismissPopup();
  }
});

test("Retry repeats the exact pinned lookup once, keeps history and focus, and recovers in place", async () => {
  const requests: string[][] = [];
  let finish!: (result: LookupResult) => void;
  const host = fakeHost({ study: false });
  host.lookupEntry = async (entry, surface) => {
    requests.push([entry, surface]);
    if (requests.length === 1) return { status: "failed", message: "Connection lost. Try again." };
    return new Promise((resolve) => { finish = resolve; });
  };
  card.setCardHost(host);
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const target = word();
  target.dataset.entry = taberu.entry;
  card.showNow(target);
  await settle();
  assert.equal(shadow().querySelector('[role="status"]')?.textContent, "Connection lost. Try again.");
  const retry = button(shadow(), "Retry lookup");
  retry.focus();
  retry.click();
  retry.click();
  await settle();
  assert.deepEqual(requests, [[taberu.entry, "食べました"], [taberu.entry, "食べました"]]);
  assert.equal(button(shadow(), "Previous lookup").disabled, true);
  assert.equal(shadow().activeElement, shadow().querySelector('[role="dialog"]'));
  finish({ status: "found", definition: taberu });
  await settle();
  assert.equal(shadow().querySelector(".sb-popup-message"), null);
  assert.ok(shadow().querySelector(".sb-headword"));
  card.dismissPopup();
  assert.equal(document.activeElement, opener);
});

test("a late Retry result cannot replace a newer word or reopen a dismissed popup", async () => {
  for (const dismiss of [false, true]) {
    let calls = 0;
    let finish!: (result: LookupResult) => void;
    const host = fakeHost({ study: false });
    host.lookup = async (query) => {
      if (query === "君") return { status: "found", definition: kimi };
      if (++calls === 1) return { status: "failed", message: "Offline" };
      return new Promise((resolve) => { finish = resolve; });
    };
    card.setCardHost(host);
    card.showNow(word());
    await settle();
    button(shadow(), "Retry lookup").click();
    await settle();
    if (dismiss) card.dismissPopup();
    else {
      const next = word("君");
      next.dataset.lemma = "君";
      card.showNow(next);
      await settle();
    }
    finish({ status: "found", definition: taberu });
    await settle();
    if (dismiss) assert.equal(shadow().querySelector(".sb-visible"), null);
    else assert.match(shadow().querySelector(".sb-headword")!.textContent!, /君/);
    card.dismissPopup();
  }
});

test("a rejected host lookup exposes a recoverable error instead of an unhandled rejection", async () => {
  const host = fakeHost({ study: false });
  let attempts = 0;
  host.lookup = async () => {
    if (++attempts === 1) throw new Error("Connection interrupted.");
    return { status: "found", definition: taberu };
  };
  card.setCardHost(host);
  card.showNow(word());
  await settle();
  assert.equal(shadow().querySelector('[role="status"]')?.textContent, "Connection interrupted.");
  button(shadow(), "Retry lookup").click();
  await settle();
  assert.ok(shadow().querySelector(".sb-headword"));
  card.dismissPopup();
});

test("copy-only popups offer the visible current sentence and independent sentence or translation copies", async () => {
  const paragraph = document.createElement("p");
  paragraph.innerHTML = '昨日、<ruby>ご飯<rt>ごはん</rt></ruby>を<span>食べました</span>。<span hidden>秘密の答え</span>';
  document.body.append(paragraph);
  const target = paragraph.querySelector("span")!;
  const section = authoringActions({ ...taberu, examples: [{ japanese: "パンを食べる。", translation: "I eat bread." }] }, target);
  document.body.append(section);
  const copied: string[] = [];
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
  button(section, "Copy current sentence").click();
  await settle();
  const current = [...section.querySelectorAll("fieldset")].find((field) => field.querySelector("legend")?.textContent === "Current sentence")!;
  assert.ok(current);
  assert.equal(current.querySelector("input")!.checked, false);
  current.querySelector("input")!.click();
  button(section, "Copy selected sentences").click();
  await settle();
  assert.equal(button(section, "Copy selected translations").disabled, true);
  const examples = [...section.querySelectorAll("fieldset")].find((field) => field.querySelector("legend")?.textContent === "Examples")!;
  examples.querySelector('input[type="checkbox"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event);
  button(section, "Copy selected sentences").click();
  await settle();
  button(section, "Copy selected translations").click();
  await settle();
  assert.deepEqual(copied, ["昨日、ご飯を食べました。", "昨日、ご飯を食べました。", "昨日、ご飯を食べました。\n\nパンを食べる。", "I eat bread."]);
  assert.ok(!section.textContent!.includes("秘密") && !section.textContent!.includes("ごはん"));
});

test("selecting the current sentence sends its source without changing context or inventing a translation", async () => {
  const target = word();
  target.dataset.sentence = "昨日、食べました。";
  const proposals: AuthoringSelection[] = [];
  const section = authoringActions(taberu, target, { addNote: (selection) => { proposals.push(selection); } });
  document.body.append(section);
  const current = [...section.querySelectorAll("fieldset")].find((field) => field.querySelector("legend")?.textContent === "Current sentence")!;
  assert.ok(current);
  current.querySelector("input")!.click();
  button(section, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].contextSentence, "昨日、食べました。");
  assert.deepEqual(proposals[0].examples, [{ japanese: "昨日、食べました。", translation: null, source: "Current card" }]);
});

test("example queries keep the chosen word only while searching this lookup's default term", async () => {
  const queries: ExampleSearchQuery[] = [];
  const section = authoringActions(taberu, word(), undefined, undefined, async (query) => {
    queries.push(query);
    return { examples: [], hasMore: false, cursor: null };
  });
  document.body.append(section);
  const term = [...section.querySelectorAll<HTMLInputElement>('input[type="search"]')][0];
  for (const query of ["食べる", "パン", " 食べる "]) {
    term.value = query;
    term.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    button(section, "Find examples").click();
    await settle();
  }
  assert.deepEqual(queries.map(({ wordId }) => wordId), ["食べる-たべる", undefined, "食べる-たべる"]);
});
