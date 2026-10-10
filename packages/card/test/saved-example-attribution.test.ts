import assert from "node:assert/strict";
import test, { after } from "node:test";
import { Window } from "happy-dom";
import { MAX_SNAPSHOT_BYTES, snapshotHash, snapshotHost, validateSnapshot } from "../src/word-card/snapshot-host.js";
import type { AuthoringSelection } from "../src/word-card/host.js";
import { fakeHost } from "./fake-host.js";

const window = new Window({ url: "https://example.test" });
let card: typeof import("../src/word-card/card.js") | undefined;
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node,
  DOMRect: window.DOMRect, getComputedStyle: window.getComputedStyle.bind(window),
});
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const notice = "Sentences and translations from Tatoeba contributors (CC BY 2.0 FR).";
const references = ["https://tatoeba.org/en/sentences/show/7", "https://tatoeba.org/en/sentences/show/8"];
const licenseUrl = "https://creativecommons.org/licenses/by/2.0/fr/";

function fixture() {
  return {
    formatVersion: 1, contentVersion: "attribution-fixture", createdAt: 1700000000000, complete: true,
    preferences: { languages: ["es", "en"], dictionaryReveal: {} },
    sources: [{ slug: "tatoeba", name: "Tatoeba", attribution: [notice, ...references].join("\n"),
      source: { name: "Tatoeba", url: "https://tatoeba.org", license: "CC BY 2.0 FR", licenseUrl } }],
    segments: [{ text: "猫", contentHash: snapshotHash("猫"), tokens: [
      { surface: "猫", start: 0, length: 1, entry: "jmdict:1", lemma: "猫", reading: "ネコ", content: true },
    ], results: [{ tokenIndex: 0, candidates: [{
      id: "猫", dictionary: "jmdict", sourceId: "1", headword: "猫", reading: "ネコ", common: true,
      pitch: [], forms: [], entries: [{ dictionary: "jmdict", sourceId: "1", type: "word",
        senses: [{ position: 0, definitions: [{ lang: "es", text: "gato" }], tags: [] }] }],
      examples: [
        { japanese: "猫が寝ています。", translations: [{ lang: "es", text: "El gato está durmiendo." }] },
        { japanese: "猫を見ました。", translations: [{ lang: "es", text: "Vi un gato." }] },
      ],
    }] }] }],
  };
}

async function openPrepared(data = fixture(), withSearch = false) {
  card ??= await import("../src/word-card/card.js");
  const proposals: AuthoringSelection[] = [];
  const copied: string[] = [];
  window.navigator.clipboard.writeText = async text => { copied.push(text); };
  const fallback = fakeHost({ study: false });
  const searches: unknown[] = [];
  if (withSearch) fallback.exampleSearch = async query => { searches.push(query); return { examples: [], cursor: null, hasMore: false }; };
  fallback.authoring = { addNote: selection => { proposals.push(selection); } };
  card.setCardHost(snapshotHost(fallback, data, { contentVersion: data.contentVersion, apiBase: "https://dictionary.test", texts: ["猫"] }));
  card.setWriteState({ readOnly: true, connected: false, canWrite: false });
  const word = document.createElement("span");
  word.dataset.lemma = "猫";
  word.dataset.surface = "猫";
  word.dataset.entry = "jmdict:1";
  word.textContent = "猫";
  document.body.append(word);
  card.showNow(word);
  await settle();
  return { shadow: document.querySelector(".sb-host")!.shadowRoot!, proposals, copied, searches };
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === label);
  assert.ok(found, label);
  return found;
}

test("prepared examples display their saved contributor and license notice below the sentences", async () => {
  const { shadow } = await openPrepared();
  const examples = shadow.querySelector(".sb-examples")!;
  assert.match(examples.textContent!, /猫が寝ています。/);
  assert.match(examples.textContent!, /El gato está durmiendo\./);
  assert.match(examples.textContent!, /Tatoeba contributors/);
  assert.match(examples.textContent!, /CC BY 2\.0 FR/);
  const caption = examples.querySelector(".sb-example-source")!;
  assert.equal(caption.closest("details"), null, "the contributor and license caption is visible without expansion");
  assert.equal(examples.querySelectorAll(".sb-example-source").length, 1, "one snapshot-wide notice covers both sentences");
  const details = examples.querySelector("details")!;
  const reference = details.querySelector<HTMLElement>(".sb-example-reference")!;
  const links = [...reference.querySelectorAll<HTMLAnchorElement>("a")];
  assert.deepEqual(links.map((link) => link.textContent), [
    "Tatoeba sentence 7", "Tatoeba sentence 8", "Tatoeba", "CC BY 2.0 FR",
  ]);
  assert.deepEqual(links.map((link) => link.href), [...references, "https://tatoeba.org/", licenseUrl]);
  assert.ok(links.every((link) => link.target === "_blank" && link.rel === "noopener noreferrer"));
  assert.equal(reference.textContent!.includes("https://"), false, "source URLs have readable labels");
  const scrolls: ScrollIntoViewOptions[] = [];
  reference.scrollIntoView = (options) => { scrolls.push(options as ScrollIntoViewOptions); };
  assert.equal(details.open, false);
  assert.match(details.textContent!, /Sources saved with this card/);
  details.querySelector("summary")!.click();
  await settle();
  assert.equal(details.open, true);
  assert.deepEqual(scrolls, [{ block: "nearest" }], "newly opened source text is brought into view");
  details.querySelector("summary")!.click();
  await settle();
  assert.equal(details.open, false);
  assert.equal(scrolls.length, 1, "closing source details does not move the popup");
});

test("copy and native authoring preserve the aggregate saved-example attribution without inventing a sentence mapping", async () => {
  const { shadow, proposals, copied } = await openPrepared();
  const fieldset = [...shadow.querySelectorAll("fieldset")].find(fieldset => fieldset.querySelector("legend")?.textContent === "Examples")!;
  fieldset.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  button(shadow, "Copy selected examples").click();
  await settle();
  assert.match(copied[0], /Tatoeba contributors/);
  assert.match(copied[0], /CC BY 2\.0 FR/);
  for (const reference of [...references, licenseUrl]) assert.ok(copied[0].includes(reference));
  assert.ok(!copied[0].includes("猫を見ました。"));
  button(shadow, "Add Anki note").click();
  await settle();
  const chosen = proposals[0].examples[0];
  assert.equal(chosen.japanese, "猫が寝ています。");
  assert.equal(chosen.translation, "El gato está durmiendo.");
  assert.equal(chosen.translationLanguage, "es");
  const attribution = [chosen.source, chosen.reference].filter(Boolean).join("\n");
  assert.match(chosen.reference!, /^Sources saved with this card:/);
  assert.match(attribution, /Tatoeba contributors/);
  assert.match(attribution, /CC BY 2\.0 FR/);
  for (const reference of [...references, licenseUrl]) assert.ok(attribution.includes(reference));
  assert.deepEqual(Object.keys(chosen).sort(), ["japanese", "reference", "source", "translation", "translationLanguage"]);
  fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();
  button(shadow, "Copy selected examples").click();
  await settle();
  assert.equal(copied[1].split(notice).length - 1, 1, "the shared caption is copied once for both selected sentences");
  assert.equal(copied[1].split(references[0]).length - 1, 1);
  button(shadow, "Copy selected sentences").click();
  await settle();
  assert.equal(copied[2], "猫が寝ています。\n\n猫を見ました。");
  button(shadow, "Copy selected translations").click();
  await settle();
  assert.equal(copied[3], "El gato está durmiendo.\n\nVi un gato.");
});

test("saved examples remain selectable without requests when the host also offers online corpus search", async () => {
  const { shadow, proposals, searches } = await openPrepared(fixture(), true);
  const examples = [...shadow.querySelectorAll("fieldset")].find(fieldset => fieldset.querySelector("legend")?.textContent === "Examples")!;
  const picks = [...examples.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  assert.equal(picks.length, 2);
  assert.equal(picks[0].closest("label")!.hidden, false);
  picks[0].click();
  button(shadow, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].examples[0].translationLanguage, "es");
  assert.deepEqual(searches, []);
});

test("source details keep their normal activation without forwarding review gestures", async () => {
  const { shadow } = await openPrepared();
  const summary = shadow.querySelector<HTMLElement>(".sb-example-source-details summary")!;
  const forwarded: string[] = [];
  const events = ["pointerdown", "pointerup", "click", "keydown", "keyup"];
  const record = (event: Event) => { forwarded.push(event.type); };
  for (const type of events) document.addEventListener(type, record);
  try {
    for (const type of ["pointerdown", "pointerup", "click"]) summary.dispatchEvent(new window.MouseEvent(type, { bubbles: true, composed: true }) as unknown as Event);
    for (const key of [" ", "Enter", "1"]) {
      for (const type of ["keydown", "keyup"]) {
        const event = new window.KeyboardEvent(type, { key, bubbles: true, composed: true, cancelable: true });
        summary.dispatchEvent(event as unknown as Event);
        assert.equal(event.defaultPrevented, false, "native details keyboard activation stays available");
      }
    }
    assert.deepEqual(forwarded, []);
    summary.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }) as unknown as Event);
    assert.equal(shadow.querySelector(".sb-popup.sb-visible"), null);
  } finally {
    for (const type of events) document.removeEventListener(type, record);
  }
});

test("saved source notices remain inert and exclude unrelated account fields", async () => {
  const data = fixture();
  const payload = '<img src="https://attacker.test" onerror="alert(1)"><script>alert(1)</script>';
  data.sources[0].attribution = notice + "\n" + payload;
  data.sources[0].source.url = "javascript:alert(1)";
  data.sources[0].source.licenseUrl = "file:///private/secret";
  Object.assign(data.sources[0], { account: { email: "PRIVATE_ACCOUNT" }, accessToken: "PRIVATE_TOKEN" });
  Object.assign(data.sources[0].source, { headers: { Authorization: "PRIVATE_BEARER" } });
  const { shadow, proposals } = await openPrepared(data);
  const examples = shadow.querySelector(".sb-examples")!;
  assert.match(examples.textContent!, /Tatoeba contributors/);
  assert.ok(examples.textContent!.includes(payload));
  assert.equal(examples.querySelectorAll("a,img,script,iframe").length, 0);
  assert.doesNotMatch(shadow.textContent!, /PRIVATE_ACCOUNT|PRIVATE_TOKEN|PRIVATE_BEARER/);
  const choices = [...shadow.querySelectorAll("fieldset")].find(fieldset => fieldset.querySelector("legend")?.textContent === "Examples")!;
  choices.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  button(shadow, "Add Anki note").click();
  await settle();
  assert.doesNotMatch(JSON.stringify(proposals), /PRIVATE_ACCOUNT|PRIVATE_TOKEN|PRIVATE_BEARER/);
});

test("missing corpus notices do not borrow dictionary attribution, and notice data stays within existing snapshot bounds", async () => {
  const data = fixture();
  data.sources[0].slug = "jmdict";
  const { shadow } = await openPrepared(data);
  assert.match(shadow.querySelector(".sb-examples")!.textContent!, /猫が寝ています。/);
  assert.equal(shadow.querySelector(".sb-examples .sb-example-source"), null);
  for (const attribution of ["x".repeat(4097), "猫".repeat(MAX_SNAPSHOT_BYTES)]) {
    const invalid = fixture();
    invalid.sources[0].attribution = attribution;
    assert.equal(validateSnapshot(invalid), null);
  }
});

after(async () => {
  card?.dismissPopup();
  await window.happyDOM.close();
});
