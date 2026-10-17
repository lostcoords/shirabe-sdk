import assert from "node:assert/strict";
import test, { after } from "node:test";
import { Window } from "happy-dom";
import { MAX_SNAPSHOT_BYTES, snapshotHash, snapshotHost, validateSnapshot } from "../src/word-card/snapshot-host.js";
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

async function openPrepared(data = fixture()) {
  card ??= await import("../src/word-card/card.js");
  const fallback = fakeHost({ study: false });
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
  return { shadow: document.querySelector(".sb-host")!.shadowRoot! };
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
  const { shadow } = await openPrepared(data);
  const examples = shadow.querySelector(".sb-examples")!;
  assert.match(examples.textContent!, /Tatoeba contributors/);
  assert.ok(examples.textContent!.includes(payload));
  assert.equal(examples.querySelectorAll("a,img,script,iframe").length, 0);
  assert.doesNotMatch(shadow.textContent!, /PRIVATE_ACCOUNT|PRIVATE_TOKEN|PRIVATE_BEARER/);
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
