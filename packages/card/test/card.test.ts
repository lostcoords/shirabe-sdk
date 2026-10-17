import assert from "node:assert/strict";
import test from "node:test";
import { fakeHost } from "./fake-host.js";
import { kimi, studied, taberu } from "./fixtures.js";
import { snapshotHash, snapshotHost, type PreparedSnapshot } from "../src/word-card/snapshot-host.js";
import { legendTerm } from "../src/word-card/legend.js";

// The card renders into a shadow root it builds once and caches, so the whole
// file shares one window: the same constraint the extension's popup suite has,
// and for the same reason.
let shared: Promise<Awaited<ReturnType<typeof build>>> | null = null;
const page = () => (shared ??= build());

async function build() {
  const { Window } = await import("happy-dom");
  const window = new Window({ url: "https://example.test/page" });
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement,
    Node: window.Node, DOMRect: window.DOMRect, getComputedStyle: window.getComputedStyle.bind(window),
  });
  const card = await import("../src/word-card/card.js");
  return { window, card };
}

const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0)); };

test("a host can show parts and lookup links, reveal hidden glosses, and handle the headword", async () => {
  const { card, window } = await page();
  const definition = { ...taberu, headword: "良い天気", reading: "いいてんき", hiddenGlossLanguages: ["eng" as const], parts: [
    { text: "いい", lemma: "良い", reading: "いい", entry: "jmdict:good" },
    { text: "天気", lemma: "天気", reading: "てんき", entry: "jmdict:weather" },
  ] };
  const host = fakeHost({ study: false, definitions: { "いい天気": definition } });
  const opened: string[] = [];
  const events: string[] = [];
  host.openHeadword = (_definition, spelling) => opened.push(spelling);
  host.lookupLinks = () => [{ id: "jisho", label: "Jisho", url: "https://jisho.org/search/いい天気" }];
  host.report = (event) => events.push(event);
  card.setCardHost(host);
  const target = await word("いい天気");
  card.showNow(target);
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.deepEqual([...shadow.querySelectorAll(".sb-part")].map((part) => part.textContent), ["いい", "天気"]);
  assert.equal(shadow.querySelector(".sb-gloss-row")?.hasAttribute("hidden"), true);
  (shadow.querySelector(".sb-reveal-definitions") as unknown as HTMLElement).click();
  assert.equal(shadow.querySelector(".sb-gloss-row")?.hasAttribute("hidden"), false);
  (shadow.querySelector(".sb-headword") as unknown as HTMLElement).click();
  assert.deepEqual(opened, ["良い天気"]);
  (shadow.querySelector(".sb-lookup-link") as unknown as HTMLElement).click();
  assert.ok(events.includes("lookup_link_opened"));
  (shadow.querySelectorAll(".sb-part")[0] as unknown as HTMLElement).click();
  await settle();
  assert.ok(host.journal.lookups.includes("良い"));
  card.dismissPopup();
});

test("parser morphemes do not appear as dictionary expression parts", async () => {
  const { card, window } = await page();
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
  const target = await word("食べる");
  target.dataset.parts = JSON.stringify(["食べ", "る"]);
  card.showNow(target);
  await settle();
  assert.equal(window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-parts"), null);
});

test("popup chrome keeps history navigation without a close button", async () => {
  const { card, window } = await page();
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelectorAll(".sb-chrome-button").length, 2);
  assert.equal(shadow.querySelector('[aria-label="Close"]'), null);
  assert.ok(shadow.querySelector('[aria-label="Previous lookup"]'));
  assert.ok(shadow.querySelector('[aria-label="Next lookup"]'));
  card.dismissPopup();
});

test("a host can translate the explanation opened from a chip", async () => {
  const { card, window } = await page();
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS,
    legendForTag: (code, _kind, original) => code === "v1"
      ? { label: "一段動詞", body: "一段活用の動詞です。" }
      : original,
  });
  try {
    card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
    card.showNow(await word("食べる"));
    await settle();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    shadow.querySelector(".sb-sense-chip-open")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.match(shadow.querySelector(".sb-legend")?.textContent ?? "", /一段活用の動詞です。/);
  } finally {
    card.setPopupOptions(card.DEFAULT_CARD_OPTIONS);
  }
});

test("the popup opens the presentation supplied with a definition", async () => {
  const { card, window } = await page();
  const definition = { ...taberu, senses: [{ ...taberu.senses[0]!, partsOfSpeech: [{
    label: "Verbo", code: "v1", category: "pos" as const,
    presentation: { shortLabel: "Verbo", fullLabel: "Verbo especial", explanation: "Explicación propia." },
  }] }] };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  shadow.querySelector(".sb-sense-chip-open")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.match(shadow.querySelector(".sb-legend")?.textContent ?? "", /Verbo especialExplicación propia\./);
});

test("a host without presentations can set tag display locale apart from glosses", async () => {
  const { card, window } = await page();
  card.setWriteState({ canWrite: false, connected: false, languages: ["eng"], displayLocale: "es" });
  try {
    card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
    card.showNow(await word("食べる"));
    await settle();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    shadow.querySelector(".sb-sense-chip-open")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.ok(shadow.querySelector(".sb-legend")?.textContent?.includes(legendTerm("v1", "pos", ["spa"])!.body));
  } finally {
    card.setWriteState({ canWrite: false, connected: false, languages: ["eng"] });
  }
});

test("a name type does not open a usage explanation for the same code", async () => {
  const { card, window } = await page();
  const definition = { ...taberu, senses: [{ ...taberu.senses[0]!, tags: [{ label: "Name", code: "fem", category: "nameType" as const }] }] };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-sense-chip-nameType")?.textContent, "Name");
  assert.equal(shadow.querySelector(".sb-sense-chip-nameType")?.tagName, "SPAN");
});

test("the same spelling at another position or reading performs its own lookup", async () => {
  const { card } = await page();
  const readings: Array<string | undefined> = [];
  const host = fakeHost({ study: false });
  host.lookup = async (_query, _kind, context) => {
    readings.push(context?.reading);
    return { status: "found", definition: null };
  };
  card.setCardHost(host);
  for (const reading of ["あく", "ひらく", "ひらく"]) {
    const target = await word("開く");
    target.dataset.reading = reading;
    card.showNow(target);
    await settle();
    assert.ok(target.classList.contains("sb-word-open"));
  }
  assert.deepEqual(readings, ["あく", "ひらく", "ひらく"]);
});

test("the popup renders source tags on their matching sense and term", async () => {
  const { card, window } = await page();
  const sourceTag = { name: "arch", category: "register", notes: "publisher note", order: 2, score: -3 };
  const definition = {
    ...taberu,
    sourceHeadwordsByEntry: { "jmdict:1": [{ text: "食べる", reading: "たべる", tags: [sourceTag], rules: ["v1"], score: 7 }] },
    senses: taberu.senses.map((sense, index) => index === 0 ? { ...sense, sourceEntry: "jmdict:1", sourceTags: [sourceTag] } : sense),
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelectorAll(".sb-source-tag").length, 2);
  assert.match(shadow.textContent ?? "", /arch/);
  assert.match(shadow.querySelector(".sb-source-tags")?.getAttribute("title") ?? "", /publisher note/);
});

test("pitch uses compact mora overlines instead of a graph", async () => {
  const { card, window } = await page();
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const morae = [...shadow.querySelectorAll(".sb-pitch-mora")];
  assert.deepEqual(morae.map((mora) => mora.textContent), ["た", "べ", "る"]);
  assert.equal(morae[0]!.classList.contains("sb-pitch-high"), false);
  assert.equal(morae[1]!.classList.contains("sb-pitch-high"), true);
  assert.equal(morae[1]!.classList.contains("sb-pitch-drop"), true);
  assert.equal(shadow.querySelector(".sb-pitch-svg"), null);
  assert.equal(shadow.querySelector(".sb-pitch-num")?.textContent, "[2]");
});

test("a host with complete alternatives keeps every result in one scroll area", async () => {
  const { card, window } = await page();
  const alternative = {
    ...taberu,
    headword: "他べる",
    reading: "ほかべる",
    entry: "jmdict:alternative",
    url: "https://shirabe.org/en/word/alternative",
    pitch: [],
    senses: [{ ...taberu.senses[0]!, glosses: [{ lang: "eng" as const, tag: "EN", text: "an alternative match" }] }],
  };
  const host = fakeHost({ study: false, definitions: { "食べる": taberu, "jmdict:alternative": alternative } });
  const visible = [] as string[];
  host.onVisibleDefinition = (definition) => visible.push(definition.headword);
  host.lookup = async () => ({
    status: "found",
    definition: taberu,
    alternatives: [taberu, alternative],
    candidates: [
      { entry: taberu.entry!, headword: taberu.headword, reading: taberu.reading, common: true },
      { entry: alternative.entry!, headword: alternative.headword, reading: alternative.reading, common: false },
    ],
  });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-candidates"), null);
  assert.equal(shadow.querySelector(".sb-alternatives-label"), null);
  assert.equal(shadow.querySelector(".sb-alternative-headword ruby rt")?.textContent, "ほか");
  assert.equal(shadow.querySelector(".sb-alternative-reading"), null);

  const body = shadow.querySelector(".sb-body") as unknown as HTMLElement;
  const article = shadow.querySelector(".sb-alternative") as unknown as HTMLElement;
  assert.equal(article.hidden, false);
  (shadow.querySelector(".sb-results-toggle") as unknown as HTMLButtonElement).click();
  (shadow.querySelectorAll(".sb-result-link")[1] as unknown as HTMLButtonElement).click();
  assert.equal(article.hidden, false);
  assert.equal((body.querySelector(".sb-result-panel") as unknown as HTMLElement).hidden, false);
  assert.equal(article.querySelector(".sb-alternative-headword")?.getAttribute("aria-label"), "Use 他べる as this word");
  assert.deepEqual(visible, ["他べる"]);

  (shadow.querySelector(".sb-results-toggle") as unknown as HTMLButtonElement).click();
  (shadow.querySelectorAll(".sb-result-link")[0] as unknown as HTMLButtonElement).click();
  assert.equal(shadow.querySelector(".sb-headword")?.getAttribute("href"), taberu.url);
  assert.deepEqual(visible, ["他べる", "食べる"]);
});

test("the result overview opens on demand and returns to the chosen definition", async () => {
  const { card, window } = await page();
  const alternative = { ...taberu, headword: "他べる", reading: "ほかべる", entry: "jmdict:other", url: "https://shirabe.org/en/word/other",
    senses: [{ ...taberu.senses[0]!, glosses: [{ lang: "eng" as const, tag: "EN", text: "another match" }] }] };
  const host = fakeHost({ study: false });
  host.lookup = async () => ({ status: "found", definition: taberu, alternatives: [taberu, alternative] });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const body = shadow.querySelector(".sb-body") as unknown as HTMLElement;
  const toggle = shadow.querySelector(".sb-results-toggle") as unknown as HTMLButtonElement;
  const overview = shadow.querySelector(".sb-results-overview") as unknown as HTMLElement;
  assert.equal(toggle.textContent?.trim(), "1 of 2 results");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(overview.hidden, true);
  assert.equal(body.hidden, false);

  toggle.click();
  assert.equal(overview.hidden, false);
  assert.equal(body.hidden, true);
  assert.equal(shadow.activeElement, overview.querySelector(".sb-result-link"));
  assert.deepEqual([...overview.querySelectorAll(".sb-result-preview")].map((item) => item.textContent), ["to eat", "another match"]);
  assert.deepEqual([...overview.querySelectorAll(".sb-result-reading")].map((item) => item.textContent), ["たべる", "ほかべる"]);
  (overview.querySelectorAll(".sb-result-link")[1] as unknown as HTMLButtonElement).click();
  assert.equal(overview.hidden, true);
  assert.equal(body.hidden, false);
  assert.equal(toggle.textContent?.trim(), "2 of 2 results");
  assert.equal(shadow.querySelector(".sb-alternative-headword")?.getAttribute("aria-label"), "Use 他べる as this word");
  assert.equal((body.querySelector(".sb-alternative") as HTMLElement).hidden, false);
  assert.equal((body.querySelector(".sb-result-panel") as HTMLElement).hidden, false);
  assert.equal(toggle.textContent?.trim(), "2 of 2 results");

  toggle.click();
  (overview.querySelectorAll(".sb-result-link")[0] as unknown as HTMLButtonElement).click();
  assert.equal(body.scrollTop, 0);
  assert.equal(toggle.textContent?.trim(), "1 of 2 results");

});

test("native scrolling updates the result counter and footer without resetting the scroll position", async () => {
  const { card, window } = await page();
  const alternative = { ...taberu, headword: "他べる", entry: "jmdict:other", url: "https://shirabe.org/en/word/other" };
  const host = fakeHost({ study: false });
  host.lookup = async () => ({ status: "found", definition: taberu, alternatives: [taberu, alternative] });
  host.lookupLinks = (definition) => definition ? [{ id: "shirabe", label: "shirabe.org", url: definition.url }] : [];
  card.setCardHost(host);
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, lookupLinksPlacement: "footer" });
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const body = shadow.querySelector(".sb-body") as unknown as HTMLElement;
  const toggle = shadow.querySelector(".sb-results-toggle") as unknown as HTMLButtonElement;
  Object.defineProperties(body, { clientHeight: { value: 100 }, scrollHeight: { value: 500 } });
  assert.equal(body.querySelector(".sb-lookup-links"), null);
  assert.equal(shadow.querySelector(".sb-popup-footer .sb-lookup-link")?.getAttribute("href"), taberu.url);
  body.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
  const panel = body.querySelector(".sb-result-panel") as HTMLElement;
  const alternativePanel = body.querySelector(".sb-alternative") as HTMLElement;
  panel.getBoundingClientRect = () => ({ top: -body.scrollTop } as DOMRect);
  alternativePanel.getBoundingClientRect = () => ({ top: 200 - body.scrollTop } as DOMRect);
  body.scrollTop = 230;
  const wheel = new window.WheelEvent("wheel", { deltaY: 30, cancelable: true });
  body.dispatchEvent(wheel as unknown as Event);
  assert.equal(wheel.defaultPrevented, false);
  assert.equal(body.scrollTop, 230);
  body.dispatchEvent(new window.Event("scroll") as unknown as Event);
  assert.equal(toggle.textContent?.trim(), "2 of 2 results");
  assert.equal(body.scrollTop, 230);
  assert.equal(shadow.querySelector(".sb-popup-footer .sb-lookup-link")?.getAttribute("href"), alternative.url);
  body.scrollTop = 100;
  body.dispatchEvent(new window.Event("scroll") as unknown as Event);
  assert.equal(toggle.textContent?.trim(), "1 of 2 results");
  assert.equal(body.scrollTop, 100);
  toggle.click();
  assert.ok(shadow.querySelector(".sb-popup")?.classList.contains("sb-results-open"));
  (shadow.querySelectorAll(".sb-result-link")[1] as unknown as HTMLButtonElement).click();
  assert.equal(shadow.querySelector(".sb-popup")?.classList.contains("sb-results-open"), false);
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS });
});

test("the scrollbar thumb drags without jumping and stops on pointer release", async () => {
  const { card, window } = await page();
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const body = shadow.querySelector(".sb-body") as unknown as HTMLElement;
  const track = shadow.querySelector(".sb-scroll-track") as unknown as HTMLElement;
  const thumb = shadow.querySelector(".sb-scroll-thumb") as unknown as HTMLElement;
  Object.defineProperties(body, { clientHeight: { value: 600 }, scrollHeight: { value: 1800 } });
  track.getBoundingClientRect = () => ({ top: 0, height: 600 } as DOMRect);
  thumb.getBoundingClientRect = () => ({ top: 0, height: 200 } as DOMRect);
  let captured = false;
  track.setPointerCapture = () => { captured = true; };
  track.hasPointerCapture = () => captured;
  track.releasePointerCapture = () => { captured = false; };
  body.dispatchEvent(new window.Event("scroll") as unknown as Event);
  const pointer = (type: string, clientY: number) => new window.PointerEvent(type, { clientY, pointerId: 1, bubbles: true }) as unknown as PointerEvent;
  thumb.dispatchEvent(pointer("pointerdown", 50));
  assert.equal(body.scrollTop, 0);
  assert.equal(captured, true);
  track.dispatchEvent(pointer("pointermove", 250));
  assert.equal(body.scrollTop, 600);
  track.dispatchEvent(pointer("pointerup", 250));
  assert.equal(captured, false);
  track.dispatchEvent(pointer("pointermove", 450));
  assert.equal(body.scrollTop, 600);
});

test("arrow keys move focus through the open result overview", async () => {
  const { card, window } = await page();
  const second = { ...taberu, headword: "他べる", entry: "jmdict:other" };
  const third = { ...taberu, headword: "多べる", entry: "jmdict:third" };
  const host = fakeHost({ study: false });
  host.lookup = async () => ({ status: "found", definition: taberu, alternatives: [taberu, second, third] });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  (shadow.querySelector(".sb-results-toggle") as unknown as HTMLButtonElement).click();
  const rows = [...shadow.querySelectorAll(".sb-result-link")] as unknown as HTMLButtonElement[];
  const press = (key: string) => shadow.activeElement!.dispatchEvent(
    new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
  assert.equal(shadow.activeElement, rows[0]);
  press("ArrowDown");
  assert.equal(shadow.activeElement, rows[1]);
  press("ArrowDown");
  assert.equal(shadow.activeElement, rows[2]);
  press("ArrowDown");
  assert.equal(shadow.activeElement, rows[2]);
  press("ArrowUp");
  assert.equal(shadow.activeElement, rows[1]);

  rows[1]!.click();
  const body = shadow.querySelector(".sb-body") as unknown as HTMLElement;
  const scrolls: number[] = [];
  Object.defineProperty(body, "scrollBy", { value: ({ top }: { top: number }) => scrolls.push(top) });
  press("ArrowDown");
  press("ArrowUp");
  assert.deepEqual(scrolls, [80, -80]);
});

test("result metadata stays with its entry in the continuous scroll area", async () => {
  const { card, window } = await page();
  const alternative = { ...taberu, entry: "jmdict:other", headword: "他べる", reading: "ほかべる",
    inflection: ["potential"], common: false, pitch: [{ downstep: 0, audioUrl: null }] };
  const host = fakeHost({ study: false });
  host.lookup = async () => ({ status: "found", definition: taberu, alternatives: [taberu, alternative] });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const metadata = [...shadow.querySelectorAll(".sb-popup-meta")];
  assert.equal(metadata.length, 2);
  assert.equal(metadata[0]?.querySelector(".sb-inflection")?.textContent, "past");
  assert.ok(metadata[0]?.querySelector(".sb-badge-common"));
  assert.equal(metadata[0]?.querySelector(".sb-pitch-num")?.textContent, "[2]");
  const body = shadow.querySelector(".sb-body")!;
  assert.ok(body.contains(shadow.querySelector(".sb-headword")!));
  assert.ok(body.contains(metadata[0]!));
  assert.equal(shadow.querySelector(".sb-results-toggle")?.parentElement?.className, "sb-popup-footer");

  (shadow.querySelector(".sb-results-toggle") as unknown as HTMLButtonElement).click();
  (shadow.querySelectorAll(".sb-result-link")[1] as unknown as HTMLButtonElement).click();
  assert.equal((metadata[0] as unknown as HTMLElement).hidden, false);
  assert.equal((metadata[1] as unknown as HTMLElement).hidden, false);
  assert.equal(metadata[0]?.parentElement?.className, "sb-result-panel");
  assert.equal(metadata[1]?.parentElement?.className, "sb-alternative");
  assert.equal(metadata[1]?.querySelector(".sb-inflection")?.textContent, "potential");
  assert.equal(metadata[1]?.querySelector(".sb-pitch-num")?.textContent, "[0]");
});

test("a host action and the result switcher share the bottom row", async () => {
  const { card, window } = await page();
  const footer = document.createElement("div");
  footer.textContent = "More sentences";
  const alternative = { ...taberu, entry: "jmdict:other" };
  const host = fakeHost({ study: false });
  host.lookup = async () => ({ status: "found", definition: taberu, alternatives: [taberu, alternative] });
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, footer });
  try {
    card.setCardHost(host);
    card.showNow(await word("食べる"));
    await settle();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    const row = shadow.querySelector(".sb-popup-footer")!;
    assert.equal(row.firstElementChild, footer);
    assert.equal(row.lastElementChild?.classList.contains("sb-results-toggle"), true);
    assert.equal(shadow.querySelector(".sb-popup-content .sb-results-toggle"), null);
  } finally {
    card.setPopupOptions(card.DEFAULT_CARD_OPTIONS);
  }
});

test("the overview marks words, articles, and names like Shirabe search", async () => {
  const { card, window } = await page();
  const article = { ...taberu, headword: "天気", entry: "encyclopedia:1", kind: "encyclopedia" as const };
  const name = { ...taberu, headword: "天気", entry: "names:1", name: true };
  const host = fakeHost({ study: false });
  host.lookup = async () => ({ status: "found", definition: taberu, alternatives: [taberu, article, name] });
  card.setCardHost(host);
  try {
    card.setWriteState({ canWrite: false, connected: false, displayLocale: "en" });
    card.showNow(await word("食べる"));
    await settle();
    let shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    assert.deepEqual([...shadow.querySelectorAll(".sb-result-kind")].map((tag) => tag.textContent), ["Word", "Article", "Name"]);

    card.setWriteState({ canWrite: false, connected: false, displayLocale: "es" });
    card.showNow(await word("食べる"));
    await settle();
    shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    assert.deepEqual([...shadow.querySelectorAll(".sb-result-kind")].map((tag) => tag.textContent), ["Palabra", "Artículo", "Nombre"]);
  } finally {
    card.setWriteState({ canWrite: false, connected: false });
  }
});

test("a differing kana reading appears above the headword instead of beside it", async () => {
  const { card, window } = await page();
  const definition = { ...taberu, headword: "あなた", reading: "かなた" };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-headword ruby rt")?.textContent, "かなた");
  assert.equal(shadow.querySelector(".sb-popup-reading"), null);
});

test("name candidates share one compact result with readings, pitch and meanings", async () => {
  const { card, window } = await page();
  const nameA = { ...taberu, name: true, headword: "君", reading: "きみ", entry: "jmnedict:1",
    pitch: [{ downstep: 1, audioUrl: null }],
    senses: [{ ...taberu.senses[0]!, tags: [{ label: "Given name", code: "given", category: "nameType" as const }],
      glosses: [{ lang: "eng" as const, tag: "EN", text: "Kimi" }] }] };
  const nameB = { ...nameA, headword: "キミ", entry: "jmnedict:2",
    senses: [{ ...nameA.senses[0]!, glosses: [{ lang: "eng" as const, tag: "EN", text: "Kimi" }] }] };
  const nameC = { ...nameA, headword: "公", reading: "こう", entry: "jmnedict:3",
    senses: [{ ...nameA.senses[0]!, glosses: [{ lang: "eng" as const, tag: "EN", text: "Kō" }] }] };
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  host.lookup = async () => ({ status: "found", definition: taberu,
    alternatives: [taberu, nameA, nameB, nameC] });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelectorAll(".sb-alternative").length, 1);
  assert.equal(shadow.querySelectorAll(".sb-name-result").length, 2);
  assert.equal(shadow.querySelectorAll(".sb-name-headword").length, 3);
  assert.equal(shadow.querySelector(".sb-name-headword ruby rt")?.textContent, "きみ");
  assert.equal(shadow.querySelector(".sb-name-reading"), null);
  assert.match(shadow.querySelector(".sb-name-result")?.textContent ?? "", /Kimi/);
  assert.match(shadow.querySelector(".sb-name-result")?.textContent ?? "", /Given name/);
  assert.ok(shadow.querySelector(".sb-name-result .sb-pitch"));
});

test("an all-name lookup renders one name group without duplicate alternatives", async () => {
  const { card, window } = await page();
  const first = { ...taberu, name: true, headword: "明日香", reading: "あすか", entry: "jmnedict:1",
    senses: [{ ...taberu.senses[0]!, glosses: [{ lang: "eng" as const, tag: "EN", text: "Asuka" }] }] };
  const second = { ...first, headword: "飛鳥", entry: "jmnedict:2",
    senses: [{ ...first.senses[0]!, glosses: [{ lang: "eng" as const, tag: "EN", text: "Asuka (place)" }] }] };
  const host = fakeHost({ study: false, definitions: { "食べる": first } });
  host.lookup = async () => ({ status: "found", definition: first, alternatives: [first, second] });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelectorAll(".sb-name-results").length, 1);
  assert.equal(shadow.querySelectorAll(".sb-name-headword").length, 2);
  assert.match(shadow.querySelector(".sb-name-meanings")?.textContent ?? "", /Asuka/);
});

test("also-written spellings swap the headword in place without another lookup", async () => {
  const { card, window } = await page();
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const spelling = shadow.querySelector(".sb-word-form") as unknown as HTMLElement;
  const body = shadow.querySelector(".sb-body");
  const originalUrl = shadow.querySelector(".sb-headword")?.getAttribute("href");
  assert.equal(spelling.tagName, "BUTTON");
  spelling.click();
  await settle();
  assert.deepEqual(host.journal.lookups, ["食べる"]);
  assert.equal(shadow.querySelector(".sb-body"), body);
  assert.equal(shadow.querySelector(".sb-headword")?.getAttribute("href"), originalUrl);
  assert.match(shadow.querySelector(".sb-headword")?.textContent ?? "", /喰/);
  assert.equal(spelling.getAttribute("aria-pressed"), "true");
  assert.match(body?.textContent ?? "", /to eat/);
});

test("the headword action receives the spelling currently shown", async () => {
  const { card, window } = await page();
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  const opened: string[] = [];
  host.openHeadword = (_definition, spelling) => opened.push(spelling);
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  (shadow.querySelector(".sb-word-form") as unknown as HTMLElement).click();
  (shadow.querySelector(".sb-headword") as unknown as HTMLElement).click();
  assert.deepEqual(opened, ["喰べる"]);
});

test("a late lookup cannot replace the host's visible definition", async () => {
  const { card } = await page();
  const host = fakeHost({ study: false });
  const pending = new Map<string, (definition: typeof taberu) => void>();
  const shown: string[] = [];
  host.lookup = (query) => new Promise((resolve) => {
    pending.set(query, (definition) => resolve({ status: "found", definition }));
  });
  host.onDefinitionRendered = (definition) => shown.push(definition?.headword ?? "");
  card.setCardHost(host);

  card.showNow(await word("食べる"));
  await settle();
  card.showNow(await word("君"));
  await settle();
  pending.get("君")!({ ...taberu, headword: "君" });
  await settle();
  pending.get("食べる")!(taberu);
  await settle();

  assert.deepEqual(shown, ["君"]);
});

test("an alternative match keeps its chosen spelling when switching results", async () => {
  const { card, window } = await page();
  const alternative = { ...taberu, headword: "他べる", reading: "ほかべる", entry: "jmdict:other" };
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  let lookups = 0;
  host.lookup = async () => {
    lookups += 1;
    return { status: "found", definition: taberu, alternatives: [taberu, alternative] };
  };
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const article = shadow.querySelector(".sb-alternative") as unknown as HTMLElement;
  const toggle = shadow.querySelector(".sb-results-toggle") as unknown as HTMLButtonElement;
  toggle.click();
  (shadow.querySelectorAll(".sb-result-link")[1] as unknown as HTMLButtonElement).click();
  (article.querySelector(".sb-word-form") as unknown as HTMLElement).click();
  assert.match(article.querySelector(".sb-alternative-headword")?.textContent ?? "", /喰/);

  toggle.click();
  (shadow.querySelectorAll(".sb-result-link")[0] as unknown as HTMLButtonElement).click();
  assert.match(shadow.querySelector(".sb-headword")?.textContent ?? "", /食/);
  toggle.click();
  (shadow.querySelectorAll(".sb-result-link")[1] as unknown as HTMLButtonElement).click();
  assert.match(article.querySelector(".sb-alternative-headword")?.textContent ?? "", /喰/);
  assert.equal(lookups, 1);
});

test("a host can link headword kanji to Shirabe instead of opening a kanji lookup", async () => {
  const { card, window } = await page();
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  host.kanjiUrl = (character) => `https://shirabe.org/en/kanji/${character}`;
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const link = window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-kanji-button") as unknown as HTMLAnchorElement;
  assert.equal(link.tagName, "A");
  assert.equal(link.href, "https://shirabe.org/en/kanji/%E9%A3%9F");
  assert.equal(link.target, "_blank");
});

test("a complete single-result lookup does not show candidate pills", async () => {
  const { card, window } = await page();
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  host.lookup = async () => ({
    status: "found",
    definition: taberu,
    alternatives: [taberu],
    candidates: [{ entry: taberu.entry!, headword: taberu.headword, reading: taberu.reading, common: true }],
  });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-candidates"), null);
  assert.match(shadow.querySelector(".sb-body")?.textContent ?? "", /to eat/);
});

test("host footer stays mounted through redraws and can be replaced", async () => {
  const { card, window } = await page();
  const first = document.createElement("div");
  first.textContent = "Host actions";
  const second = document.createElement("div");
  second.textContent = "New actions";
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, footer: first,
    themeVariables: { "--sb-accent": "#df9aa1", "--sb-popup-width": "520px" } });
  try {
    card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu, "君": kimi } }));
    card.showNow(await word("食べる"));
    await settle();
    const popup = window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-popup")!;
    assert.equal(popup.querySelector(".sb-popup-footer")?.lastElementChild, first);
    const shadowHost = window.document.querySelector(".sb-host") as unknown as HTMLElement;
    assert.equal(shadowHost.style.getPropertyValue("--sb-accent"), "#df9aa1");
    assert.equal(shadowHost.style.getPropertyValue("--sb-popup-width"), "520px");

    card.showNow(await word("君"));
    await settle();
    assert.equal(popup.querySelector(".sb-popup-footer")?.lastElementChild, first);
    assert.match(popup.querySelector(".sb-popup-content")?.textContent ?? "", /君/);

    card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, footer: second });
    assert.equal(first.isConnected, false);
    assert.equal(popup.querySelector(".sb-popup-footer")?.lastElementChild, second);
  } finally {
    card.setPopupOptions(card.DEFAULT_CARD_OPTIONS);
  }
  assert.equal(second.isConnected, false);
  assert.equal((window.document.querySelector(".sb-host") as unknown as HTMLElement).style.getPropertyValue("--sb-accent"), "");
});

test("a host can omit SDK authoring while keeping its own footer", async () => {
  const { card, window } = await page();
  const footer = document.createElement("div");
  footer.textContent = "Host Anki actions";
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, showAuthoring: false, footer });
  try {
    card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
    card.showNow(await word("食べる"));
    await settle();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    assert.equal(shadow.querySelector(".sb-body .sb-authoring"), null);
    assert.match(shadow.querySelector(".sb-body")?.textContent ?? "", /to eat/);
    assert.equal(shadow.querySelector(".sb-popup-footer")?.lastElementChild, footer);
  } finally {
    card.setPopupOptions(card.DEFAULT_CARD_OPTIONS);
  }
});

test("the popup keeps matching source pairs separated by dictionary", async () => {
  const { card, window } = await page();
  const first = { name: "arch", category: "register", notes: "first", order: 1, score: 1 };
  const second = { name: "formal", category: "register", notes: "second", order: 2, score: 2 };
  const unrelated = { name: "slang", category: "register", notes: "unrelated", order: 3, score: 3 };
  const definition = {
    ...taberu,
    senses: [
      { ...taberu.senses[0]!, dictionary: "JMdict", sourceEntry: "jmdict:1" },
      { ...taberu.senses[0]!, position: 1, dictionary: "Publisher", sourceEntry: "publisher:2" },
    ],
    sourceHeadwordsByEntry: {
      "jmdict:1": [{ text: "食べる", reading: "たべる", tags: [first], rules: [], score: 1 }],
      "publisher:2": [
        { text: "食べる", reading: "タベル", tags: [second], rules: [], score: 2 },
        { text: "食べる", reading: "くう", tags: [unrelated], rules: [], score: 3 },
      ],
    },
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelectorAll(".sb-source-tags").length, 3);
  assert.equal(shadow.querySelectorAll(".sb-source-tag").length, 3);
  assert.match(shadow.textContent ?? "", /arch/);
  assert.match(shadow.textContent ?? "", /formal/);
  assert.match(shadow.textContent ?? "", /slang/);
  assert.match(shadow.textContent ?? "", /くう/);
});

test("covered dictionaries collapse their senses while keeping publisher headwords visible", async () => {
  const { card, window } = await page();
  const sourceTag = { name: "private", category: "register", notes: "hidden", order: 1, score: 1 };
  const definition = {
    ...taberu,
    headword: "覆う",
    entryTagsByEntry: {
      "jmdict:1": [{ label: "Public noun", code: "n", category: "pos" as const, scope: "entry" as const }],
      "private:2": [{ label: "Private noun", code: "n", category: "pos" as const, scope: "entry" as const }],
    },
    senses: [
      { ...taberu.senses[0]!, dictionary: "JMdict", sourceEntry: "jmdict:1" },
      { ...taberu.senses[0]!, dictionary: "Private", sourceEntry: "private:2", covered: true },
    ],
    sourceHeadwordsByEntry: { "private:2": [{ text: "覆う", reading: "おおう", tags: [sourceTag], rules: [], score: 1 }] },
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "覆う": definition } }));
  card.showNow(await word("覆う"));
  await settle();

  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const sections = [...shadow.querySelectorAll(".sb-dictionary")];
  const covered = sections[1]!;
  assert.equal(shadow.querySelectorAll(".sb-source-tag").length, 1);
  assert.equal(covered.querySelectorAll(".sb-source-tag").length, 1);
  assert.equal(shadow.querySelectorAll(".sb-entry-chips").length, 2);
  assert.equal(covered.querySelectorAll(".sb-entry-chips").length, 1);
  assert.match(shadow.textContent ?? "", /Public noun/);
  assert.match(covered.textContent ?? "", /Private noun/);
  const toggle = covered.querySelector(".sb-dictionary-toggle")!;
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(covered.querySelector(".sb-dictionary-content")?.hasAttribute("hidden"), true);
  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(covered.querySelector(".sb-dictionary-content")?.hasAttribute("hidden"), false);
});

test("the popup keeps publisher titles and usage examples separate", async () => {
  const { card, window } = await page();
  const definition = {
    ...taberu,
    senses: [{
      ...taberu.senses[0]!,
      glosses: [{ lang: "jpn", tag: "JA", text: "自慢する", title: "意味" }],
      usages: [
        { lang: "jpn", tag: "JA", text: "学歴を鼻にかける", title: "使用例" },
        { lang: "jpn", tag: "JA", text: "家柄の良さを鼻にかける" },
      ],
    }],
  } as typeof taberu;
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelector(".sb-gloss-title")?.textContent, "意味");
  assert.deepEqual([...shadow.querySelectorAll(".sb-usage")].map((row) => row.textContent?.trim()), [
    "使用例学歴を鼻にかける", "家柄の良さを鼻にかける",
  ]);
});

test("the popup groups synonyms and styles Japanese prose without parsing API text as HTML", async () => {
  const { card, window } = await page();
  const definition = {
    ...taberu,
    senses: [{
      ...taberu.senses[0]!,
      glosses: [
        { lang: "eng" as const, tag: "EN", text: "to eat" },
        { lang: "eng" as const, tag: "EN", text: "to consume 日本語 <img src=x>" },
        { lang: "jpn" as const, tag: "JA", text: "食べる" },
        { lang: "jpn" as const, tag: "JA", text: "口にする" },
      ],
      notes: ["Used for 日本語; <script>alert(1)</script>"],
    }],
  } as typeof taberu;
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const rows = [...shadow.querySelectorAll(".sb-gloss-row")];
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.querySelectorAll(".sb-gloss-lang").length, 1);
  assert.match(rows[0]?.textContent ?? "", /to eat; to consume 日本語 <img src=x>/);
  assert.equal(rows[1]?.querySelectorAll(".sb-gloss-item").length, 2);
  assert.equal(shadow.querySelector(".sb-sense-note .sb-japanese-run")?.textContent, "日本語");
  assert.equal(shadow.querySelectorAll("img, script").length, 0);
});

test("a sense with one language has no language tag, even when another sense uses a different language", async () => {
  const { card, window } = await page();
  const senses = [
    { ...taberu.senses[0]!, sourceEntry: "jmdict:1", dictionary: "JMdict", glosses: [{ lang: "jpn" as const, tag: "JA", text: "食べること" }] },
    { ...taberu.senses[0]!, position: 1, sourceEntry: "jmdict:1", dictionary: "JMdict", glosses: [{ lang: "eng" as const, tag: "EN", text: "to eat" }] },
  ];
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": { ...taberu, senses } } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelectorAll(".sb-gloss-lang").length, 0);
  assert.deepEqual([...shadow.querySelectorAll(".sb-dictionary-toggle")].map((tag) => tag.textContent?.trim()), ["JMdict"]);

  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": { ...taberu, senses: senses.slice(0, 1) } } }));
  card.showNow(await word("食べる"));
  await settle();
  const single = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(single.querySelectorAll(".sb-gloss-lang").length, 0);
  assert.equal(single.querySelector(".sb-dictionary-toggle")?.textContent?.trim(), "JMdict");
});

test("footer lookup links are available during loading and update after resolution", async () => {
  const { card, window } = await page();
  let resolve!: (result: { status: "found"; definition: typeof taberu }) => void;
  const host = fakeHost({ study: false });
  host.lookup = () => new Promise((done) => { resolve = done; });
  host.lookupLinks = (definition, word) => [{ id: "shirabe", label: "shirabe.org",
    url: definition?.url ?? `https://shirabe.org/en/search/${encodeURIComponent(word.dataset.lemma!)}` }];
  card.setCardHost(host);
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, lookupLinksPlacement: "footer" });
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.ok(shadow.querySelector(".sb-loading"));
  assert.equal(shadow.querySelector(".sb-popup-footer .sb-lookup-link")?.getAttribute("href"),
    `https://shirabe.org/en/search/${encodeURIComponent("食べる")}`);
  resolve({ status: "found", definition: taberu });
  await settle();
  assert.equal(shadow.querySelector(".sb-popup-footer .sb-lookup-link")?.getAttribute("href"), taberu.url);
  assert.equal(shadow.querySelectorAll(".sb-popup-footer .sb-lookup-links").length, 1);
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS });
});

test("the popup opens with a loading state, then replaces it with the definition", async () => {
  const { card, window } = await page();
  let finish!: (result: { status: "found"; definition: typeof taberu }) => void;
  const host = fakeHost({ study: false });
  host.lookup = () => new Promise((resolve) => { finish = resolve; });
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-popup.sb-visible .sb-loading-body")?.textContent, "Loading definitions…");
  assert.equal(shadow.querySelector(".sb-loading")?.getAttribute("aria-busy"), "true");
  finish({ status: "found", definition: taberu });
  await settle();
  assert.equal(shadow.querySelector(".sb-loading"), null);
  assert.match(shadow.querySelector(".sb-popup-content")?.textContent ?? "", /to eat/);
});

test("the popup uses Shirabe's exact furigana segments for the selected headword", async () => {
  const { card, window } = await page();
  const definition = { ...taberu, headword: "今日", reading: "きょう",
    furigana: [{ text: "今", ruby: "きょ" }, { text: "日", ruby: "う" }] };
  card.setCardHost(fakeHost({ study: false, definitions: { "今日": definition } }));
  card.showNow(await word("今日"));
  await settle();
  const head = window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-headword")!;
  assert.deepEqual([...head.querySelectorAll("ruby")].map((ruby) => ruby.querySelector("rt")?.textContent), ["きょ", "う"]);
});

test("the open word stays inside the popup safe zone without sb-word page styling", async () => {
  const { card, window } = await page();
  const closed: HTMLElement[] = [];
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": taberu } }));
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, onClose: (word) => { if (word) closed.push(word); } });
  try {
    const target = await word("食べる");
    card.showNow(target);
    await settle();
    target.classList.remove("sb-word");
    target.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }) as unknown as Event);
    assert.ok(window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-popup.sb-visible"));
    window.document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    assert.equal(window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-popup.sb-visible"), null);
    assert.deepEqual(closed, [target]);
    card.dismissPopup();
    assert.deepEqual(closed, [target], "closing an already closed popup does not notify twice");
  } finally {
    card.setPopupOptions(card.DEFAULT_CARD_OPTIONS);
  }
});

test("SDK hover prefetch shares its answer with the popup lookup", async () => {
  const { card } = await page();
  const host = fakeHost({ study: false, definitions: { "食べる": taberu } });
  const target = await word("食べる");
  card.setCardHost(host);
  await card.prefetchWord(target);
  assert.deepEqual(host.journal.lookups, ["食べる"]);
  card.showNow(target);
  await settle();
  assert.deepEqual(host.journal.lookups, ["食べる"]);
  assert.match(await shown(), /to eat/);
});

test("the popup renders hierarchy labels and scoped grammar at one level", async () => {
  const { card, window } = await page();
  const sensePos = { label: "Noun", code: "n", category: "pos" as const, scope: "sense" as const };
  const groupPos = { label: "Ichidan verb", code: "v1", category: "pos" as const, scope: "group" as const };
  const entryPos = { label: "Noun", code: "n", category: "pos" as const, scope: "entry" as const };
  const definition = {
    ...taberu,
    entryTagsByEntry: { "jmdict:1358280": [entryPos] },
    senses: [
      { ...taberu.senses[0]!, label: "一①", depth: 1, sourceEntry: "jmdict:1358280", groupTags: [groupPos], partsOfSpeech: [sensePos] },
      { ...taberu.senses[1]!, label: "一㋐", depth: 2, sourceEntry: "jmdict:1358280", groupTags: [groupPos], partsOfSpeech: [sensePos] },
    ],
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelectorAll(".sb-entry-chips .sb-sense-chip").length, 1);
  assert.equal(shadow.querySelectorAll(".sb-group-chips .sb-sense-chip").length, 1);
  assert.equal(shadow.querySelectorAll(".sb-sense-chips .sb-sense-chip").length, 2);
  assert.deepEqual([...shadow.querySelectorAll(".sb-sense-marker")].map((marker) => marker.textContent), ["一", "①", "㋐"]);
});

test("a bare ① before ㊀ aligns with the section, while ㊀① stays indented", async () => {
  const { card, window } = await page();
  const senses = [
    { ...taberu.senses[0]!, position: 0, label: "①", depth: 1 },
    { ...taberu.senses[0]!, position: 1, label: "㊀", depth: 0 },
    { ...taberu.senses[0]!, position: 2, label: "㊀①", depth: 1 },
    { ...taberu.senses[0]!, position: 3, label: "㊁", depth: 0 },
    { ...taberu.senses[0]!, position: 4, label: "㊁①", depth: 1 },
  ];
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": { ...taberu, senses } } }));
  card.showNow(await word("食べる"));
  await settle();
  const rows = [...window.document.querySelector(".sb-host")!.shadowRoot!.querySelectorAll(".sb-sense-row")];
  assert.deepEqual(rows.map((row) => row.classList.contains("sb-sense-depth-1")), [false, false, true, false, true]);
});

test("dictionary indentation preserves divisions, senses and subsenses", async () => {
  const { card, window } = await page();
  const groupPos = { label: "Pronoun", code: "pn", category: "pos" as const, scope: "group" as const };
  const senses = [
    { ...taberu.senses[0]!, position: 0, label: "㊀①", depth: 1, groupTags: [groupPos] },
    { ...taberu.senses[0]!, position: 1, label: "㊀①㋐", depth: 2, groupTags: [groupPos] },
    { ...taberu.senses[0]!, position: 2, label: "㊀①㋑", depth: 2, groupTags: [groupPos] },
    { ...taberu.senses[0]!, position: 3, label: "㊀②", depth: 1, groupTags: [groupPos] },
    { ...taberu.senses[0]!, position: 4, label: "㊁", depth: 0 },
  ];
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": { ...taberu, senses } } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const rows = [...shadow.querySelectorAll(".sb-sense-row")];
  assert.deepEqual(rows.map((row) => row.className), [
    "sb-sense-row sb-sense-depth-1", "sb-sense-row sb-sense-depth-2",
    "sb-sense-row sb-sense-depth-2", "sb-sense-row sb-sense-depth-1", "sb-sense-row sb-sense-depth-0",
  ]);
  assert.equal(shadow.querySelectorAll(".sb-sense-group").length, 1);
});

test("flat dictionaries indent only subsenses and omit empty parent divisions", async () => {
  const { card, window } = await page();
  const senses = [
    { ...taberu.senses[0]!, position: 0, label: "一①", depth: 1 },
    { ...taberu.senses[0]!, position: 1, label: "一①㋐", depth: 2 },
    { ...taberu.senses[0]!, position: 2, label: "②", depth: 1 },
    { ...taberu.senses[0]!, position: 3, label: "②㋐", depth: 2 },
  ];
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": { ...taberu, senses } } }));
  card.showNow(await word("食べる"));
  await settle();
  const rows = [...window.document.querySelector(".sb-host")!.shadowRoot!.querySelectorAll(".sb-sense-row")];
  assert.deepEqual(rows.map((row) => row.className), [
    "sb-sense-row sb-sense-depth-0", "sb-sense-row sb-sense-depth-1",
    "sb-sense-row sb-sense-depth-0", "sb-sense-row sb-sense-depth-1",
  ]);
});

test("group grammar follows cumulative publisher labels and source boundaries", async () => {
  const { card, window } = await page();
  const groupPos = { label: "Ichidan verb", code: "v1", category: "pos" as const, scope: "group" as const };
  const definition = {
    ...taberu,
    senses: [
      { ...taberu.senses[0]!, label: "一①", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[1]!, label: "一①㋐", depth: 2, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[0]!, position: 2, label: "一②", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[1]!, position: 3, label: "二①", depth: 1, sourceEntry: "publisher:2", groupTags: [groupPos] },
    ],
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelectorAll(".sb-group-chips .sb-sense-chip").length, 2);
});

test("group grammar strips parenthesized kanji numerals from cumulative labels", async () => {
  const { card, window } = await page();
  const groupPos = { label: "Ichidan verb", code: "v1", category: "pos" as const, scope: "group" as const };
  const definition = {
    ...taberu,
    senses: [
      { ...taberu.senses[0]!, label: "一（一）", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[1]!, label: "一（二）", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[0]!, position: 2, label: "二（一）", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
    ],
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelectorAll(".sb-group-chips .sb-sense-chip").length, 2);
});

test("group grammar strips fullwidth uppercase Latin markers from cumulative labels", async () => {
  const { card, window } = await page();
  const groupPos = { label: "Ichidan verb", code: "v1", category: "pos" as const, scope: "group" as const };
  const definition = {
    ...taberu,
    senses: [
      { ...taberu.senses[0]!, label: "一(Ａ)", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[1]!, label: "一(Ｂ)", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[0]!, position: 2, label: "二(Ａ)", depth: 1, sourceEntry: "jmdict:1", groupTags: [groupPos] },
    ],
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelectorAll(".sb-group-chips .sb-sense-chip").length, 2);
});

test("group grammar keeps halfwidth lowercase Latin markers cumulative", async () => {
  const { card, window } = await page();
  const groupPos = { label: "Ichidan verb", code: "v1", category: "pos" as const, scope: "group" as const };
  const definition = {
    ...taberu,
    senses: [
      { ...taberu.senses[0]!, label: "一(a)", depth: 2, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[1]!, label: "一(b)", depth: 2, sourceEntry: "jmdict:1", groupTags: [groupPos] },
      { ...taberu.senses[0]!, position: 2, label: "二(a)", depth: 2, sourceEntry: "jmdict:1", groupTags: [groupPos] },
    ],
  };
  card.setCardHost(fakeHost({ study: false, definitions: { "食べる": definition } }));
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;

  assert.equal(shadow.querySelectorAll(".sb-group-chips .sb-sense-chip").length, 2);
});

test("cross-reference labels render beside targets without changing lookup text", async () => {
  const { card, window } = await page();
  const queries: string[] = [];
  const definition = {
    ...taberu,
    senses: [{
      ...taberu.senses[0]!,
      xrefs: [
        { kind: "related" as const, text: "器械" },
        { kind: "related" as const, text: "器械", reading: "きかい", label: "①" },
      ],
    }],
  };
  const host = fakeHost({ study: false, definitions: { "食べる": definition } });
  host.lookup = async (query) => { queries.push(query); return { status: "found", definition }; };
  card.setCardHost(host);
  card.showNow(await word("食べる"));
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  const links = [...shadow.querySelectorAll(".sb-xref")];
  assert.equal(links.length, 2);
  assert.match(links[0]!.textContent ?? "", /器械/);
  assert.match(links[1]!.textContent ?? "", /器械/);
  assert.match(links[1]!.textContent ?? "", /①/);
  links[1]!.dispatchEvent(new window.Event("click", { bubbles: true }));
  await settle();
  assert.deepEqual(queries, ["食べる", "器械"]);
});

function crossReferenceHost(reading: string | undefined, readings = ["アク", "ヒラク"], kind: "related" | "antonym" = "related") {
  const text = readings.map(() => "開く").join(" ");
  const snapshot: PreparedSnapshot = {
    formatVersion: 1, contentVersion: "homographs", createdAt: 1700000000000, complete: true,
    segments: [{ text, contentHash: snapshotHash(text),
      tokens: readings.map((reading, index) => ({ surface: "開く", lemma: "開く", reading,
        start: index * 3, length: 2, content: true, entry: `jmdict:${index + 1}` })),
      results: readings.map((reading, index) => ({ tokenIndex: index, candidates: [{
        id: "開く", dictionary: "jmdict", sourceId: String(index + 1), headword: "開く", reading,
        common: false, forms: [], furigana: [], pitch: [], entries: [{ dictionary: "jmdict", sourceId: String(index + 1),
          type: "definition", order: 0, senses: [{ position: 0, tags: [],
            definitions: [{ lang: "en", text: reading === "ヒラク" ? "Hiraku homograph" : "Aku homograph" }] }] }],
      }] })),
    }],
  };
  const saved = snapshotHost(undefined, snapshot, { apiBase: "https://example.test", contentVersion: snapshot.contentVersion, texts: [text] });
  const definition = { ...taberu, pitch: [], senses: [{ ...taberu.senses[0]!,
    xrefs: [{ kind, text: "開く", reading, label: "②" }],
  }] };
  const host = fakeHost({ study: false, definitions: { "食べる": definition } });
  const calls: Parameters<typeof saved.lookup>[] = [];
  host.lookup = async (...args) => { calls.push(args); return saved.lookup(...args); };
  return { host, calls };
}

for (const [reading, kind, event] of [["ひらく", "related", "click"], ["ヒラク", "antonym", "keydown"]] as const) {
  test(`cross-reference ${reading} selects its saved homograph and keeps that reading in history`, async () => {
    const { card, window } = await page();
    const { host, calls } = crossReferenceHost(reading, undefined, kind);
    card.setCardHost(host);
    const parent = await word("食べる");
    parent.dataset.entry = taberu.entry;
    parent.dataset.reading = "タベル";
    parent.dataset.pos = "verb";
    card.showNow(parent);
    await settle();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    const link = shadow.querySelector(".sb-xref")!;
    assert.equal(link.getAttribute("title"), `開く (${reading})`);
    link.dispatchEvent(event === "click" ? new window.Event("click", { bubbles: true })
      : new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    assert.deepEqual(calls, [["開く", "word", { surface: "開く", reading: "ヒラク" }]]);
    assert.match(await shown(), /Hiraku homograph/);
    assert.doesNotMatch(await shown(), /Aku homograph/);
    shadow.querySelector('[aria-label="Previous lookup"]')!.dispatchEvent(new window.Event("click"));
    await settle();
    shadow.querySelector('[aria-label="Next lookup"]')!.dispatchEvent(new window.Event("click"));
    await settle();
    assert.deepEqual(calls, Array.from({ length: 2 }, () => ["開く", "word", { surface: "開く", reading: "ヒラク" }]));
    assert.match(await shown(), /Hiraku homograph/);
  });
}

test("a missing cross-reference reading does not fall back to another saved homograph", async () => {
  const { card, window } = await page();
  const { host, calls } = crossReferenceHost("ひらく", ["アク"]);
  card.setCardHost(host);
  const parent = await word("食べる");
  parent.dataset.entry = taberu.entry;
  card.showNow(parent);
  await settle();
  window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-xref")!
    .dispatchEvent(new window.Event("click"));
  await settle();
  assert.deepEqual(calls, [["開く", "word", { surface: "開く", reading: "ヒラク" }]]);
  assert.match(await shown(), /Retry lookup/);
  assert.doesNotMatch(await shown(), /Aku homograph/);
});

test("a cross-reference without a reading does not borrow its parent's context", async () => {
  const { card, window } = await page();
  const { host, calls } = crossReferenceHost(undefined);
  card.setCardHost(host);
  const parent = await word("食べる");
  parent.dataset.entry = taberu.entry;
  parent.dataset.reading = "タベル";
  parent.dataset.pos = "verb";
  card.showNow(parent);
  await settle();
  window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-xref")!
    .dispatchEvent(new window.Event("click"));
  await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.slice(0, 2), ["開く", "word"]);
  assert.equal(calls[0]![2]?.surface, "開く");
  assert.equal(calls[0]![2]?.reading, undefined);
  assert.equal(calls[0]![2]?.pos, undefined);
  assert.match(await shown(), /Retry lookup/);
});

test("parsed entries survive opening and reopening with their original inflected surface", async () => {
  const { card } = await page();
  const calls: string[][] = [];
  const host = fakeHost({ study: false });
  host.lookup = async (query) => {
    calls.push(["unexpected spelling lookup", query]);
    return { status: "found", definition: null };
  };
  host.lookupEntry = async (entry, surface) => {
    calls.push([entry, surface]);
    return { status: "found", definition: { ...taberu, sourceForm: surface, inflection: ["past"] } };
  };
  card.setCardHost(host);
  host.candidatesFor = () => [
    { entry: taberu.entry!, headword: "食べる", reading: "たべる", common: true },
    { entry: kimi.entry!, headword: "君", reading: "きみ", common: true },
  ];
  const target = await word("食べる");
  target.dataset.surface = "食べた";
  target.dataset.entry = taberu.entry;
  card.showNow(target);
  await settle();
  card.dismissPopup();
  card.showNow(target);
  await settle();
  assert.deepEqual(calls, [[taberu.entry, "食べた"], [taberu.entry, "食べた"]]);
  const { window } = await page();
  assert.equal(window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-inflection")?.textContent, "past");
  assert.equal(window.document.querySelector(".sb-host")!.shadowRoot!.querySelectorAll(".sb-candidate").length, 2);
});

test("a lexical copula keeps its display reading separate from its study reading", async () => {
  const { card } = await page();
  const definition = { ...taberu, headword: "だった", reading: "だった", baseForm: "だ", baseReading: "だ", inflection: ["past"] };
  card.setCardHost(fakeHost({ definitions: { "だった": definition } }));
  const target = await word("だった");
  card.showNow(target);
  await settle();
  assert.equal(target.dataset.lemma, "だ");
  assert.equal(target.dataset.reading, "だ");
  assert.equal(target.dataset.entry, definition.entry);
});

test("saving a lexical adverb preserves its identity while explaining its adjective base", async () => {
  const { card, window } = await page();
  const definition = { ...taberu, entry: "jmdict:1205770", headword: "確かに", reading: "たしかに",
    baseForm: "確かに", sourceForm: "確かに", inflectionBase: "確か", inflection: ["adverbial (〜に)"] };
  const host = fakeHost({ definitions: { "確かに": definition } });
  const saves: Array<{ lemma?: string; reading?: string; entry?: string; surface?: string }> = [];
  host.study!.save = async (word) => {
    const { lemma, reading, entry, surface } = word.dataset;
    saves.push({ lemma, reading, entry, surface });
    return { ok: true, message: "Saved" };
  };
  card.setCardHost(host);
  card.setWriteState({ connected: true, canWrite: true });
  try {
    card.showNow(await word("確かに"));
    await settle();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    assert.equal(shadow.querySelector(".sb-headword rt")?.textContent, "たし");
    (shadow.querySelector(".sb-btn-save") as unknown as HTMLElement).click();
    await settle();
    assert.deepEqual(saves, [{ lemma: "確かに", reading: "たしかに", entry: "jmdict:1205770", surface: "確かに" }]);
  } finally {
    card.setWriteState({ connected: false, canWrite: false });
  }
});

test("a numeral popup keeps its displayed spelling and saves its shared base", async () => {
  const { card } = await page();
  const definition = { ...taberu, headword: "ひとつ", reading: "ひとつ", baseForm: "一つ", inflection: [] };
  const host = fakeHost({ definitions: { "ひとつ": definition }, details: { "一つ": studied } });
  card.setCardHost(host);
  card.setWriteState({ connected: true, canWrite: true });
  try {
    const target = await word("ひとつ");
    card.showNow(target);
    await settle();
    assert.equal(target.dataset.lemma, "一つ");
    assert.equal(target.dataset.state, "learning");
    const { window } = await page();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    assert.equal(shadow.querySelector(".sb-headword")?.textContent, "ひとつ");
    assert.equal(shadow.querySelector(".sb-inflection"), null);
    (shadow.querySelector(".sb-btn-known") as unknown as HTMLElement).click();
    await settle();
    assert.deepEqual(host.journal.saves, ["一つ"]);
  } finally {
    card.setWriteState({ connected: false, canWrite: false });
  }
});

test("candidate choices survive a pick and reopening without leaking to another surface or host", async () => {
  const { card, window } = await page();
  const host = fakeHost({ definitions: { "君": kimi, "食べる": taberu } });
  host.lookup = async () => ({ status: "found", definition: kimi, candidates: [
    { entry: "jmdict:1259290", headword: "君", reading: "きみ", common: true },
    { entry: taberu.entry!, headword: "食べる", reading: "たべる", common: true },
  ] });
  card.setCardHost(host);
  card.setWriteState({ connected: true, canWrite: true });
  const target = await word("きみ");
  card.showNow(target);
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(target.dataset.lemma, "君");
  assert.equal(shadow.querySelectorAll(".sb-candidate:not(.sb-candidate-more)").length, 2);
  (shadow.querySelectorAll(".sb-candidate")[1] as unknown as HTMLElement).click();
  await settle();
  assert.equal(target.dataset.entry, taberu.entry);
  assert.equal(target.dataset.sbEntryPicked, "1");
  assert.equal(shadow.querySelectorAll(".sb-candidate:not(.sb-candidate-more)").length, 2);
  card.dismissPopup();
  card.showNow(target);
  await settle();
  assert.equal(target.dataset.entry, taberu.entry);
  assert.equal(shadow.querySelectorAll(".sb-candidate:not(.sb-candidate-more)").length, 2);
  (shadow.querySelector(".sb-btn-save") as unknown as HTMLElement).click();
  await settle();
  assert.deepEqual(host.journal.saves, ["食べる"]);
  card.dismissPopup();
  target.dataset.surface = "食べる";
  card.showNow(target);
  await settle();
  assert.equal(shadow.querySelectorAll(".sb-candidate:not(.sb-candidate-more)").length, 0);
  card.setCardHost(fakeHost({ definitions: { "食べる": taberu } }));
  target.dataset.surface = "きみ";
  card.showNow(target);
  await settle();
  assert.equal(shadow.querySelectorAll(".sb-candidate:not(.sb-candidate-more)").length, 0);
});

/** A word as a host would hand it over: a span carrying what it knows. */
async function word(lemma: string, state = "none"): Promise<HTMLElement> {
  const { window } = await page();
  const span = window.document.createElement("span");
  span.className = "sb-word";
  span.dataset.lemma = lemma;
  span.dataset.surface = lemma;
  span.dataset.state = state;
  window.document.body.append(span);
  return span as unknown as HTMLElement;
}

/** Everything the card drew. It lives in a shadow root, which is what keeps a
    host page's CSS out and ours in. */
const shown = async (): Promise<string> => {
  const { window } = await page();
  const host = window.document.querySelector(".sb-host") as unknown as { shadowRoot: ShadowRoot } | null;
  // The card element, not the shadow root: the root also holds our stylesheet,
  // whose text would answer for words the card never drew.
  return host?.shadowRoot?.querySelector(".sb-popup")?.textContent ?? "";
};

test("a card renders a definition from a host with no dictionary behind it", async () => {
  const { card } = await page();
  const host = fakeHost({ definitions: { "食べる": taberu } });
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: false });

  card.showNow(await word("食べる"));
  await settle();

  const text = await shown();
  assert.match(text, /食べる/, "the headword");
  assert.match(text, /to eat/, "the first sense");
  assert.match(text, /N5/, "the JLPT badge");
  assert.deepEqual(host.journal.lookups, ["食べる"], "and it asked its host exactly once");
});

test("the inflection is shown as the host reported it", async () => {
  const { card, window } = await page();
  card.setCardHost(fakeHost({ definitions: { "食べた": taberu } }));
  card.showNow(await word("食べた"));
  await settle();
  assert.equal(window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-inflection")?.textContent, "past");
});

test("the host's resolved inflection takes precedence over a parsed span's clue", async () => {
  const { card, window } = await page();
  const resolved = { ...taberu, sourceForm: "見れなかった", inflection: ["past", "negative", "potential (ら抜き)"], inflectionBase: "見る" };
  card.setCardHost(fakeHost({ definitions: { "見れなかった": resolved } }));
  const target = await word("見れなかった");
  target.dataset.entry = resolved.entry;
  target.dataset.inflection = JSON.stringify(["past", "negative", "potential"]);
  target.dataset.inflectionBase = "見る";
  card.showNow(target);
  await settle();
  assert.equal(window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-inflection")?.textContent,
    "past, negative, potential (ら抜き)");
});

test("a lexical copula form explains its grammatical base without replacing its entry", async () => {
  const { card, window } = await page();
  const conditional = { ...taberu, headword: "なら", reading: "なら", entry: "jmdict:1009470",
    sourceForm: "なら", inflection: ["conditional (〜なら)"], inflectionBase: "だ" };
  card.setCardHost(fakeHost({ definitions: { "なら": conditional } }));
  const target = await word("なら");
  card.showNow(target);
  await settle();
  const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-inflection")?.textContent, "conditional (〜なら)");
  assert.equal(shadow.querySelector(".sb-headword")?.textContent, "なら");
  assert.equal(target.dataset.entry, "jmdict:1009470");
});

test("a parsed form keeps the resolved grammatical base for study identity", async () => {
  const { card } = await page();
  const resolved = { ...taberu, headword: "なら", reading: "なら", entry: "jmdict:1009470",
    sourceForm: "なら", inflection: ["conditional (〜なら)"], inflectionBase: "だ" };
  card.setCardHost(fakeHost({ definitions: { "なら": resolved } }));
  const target = await word("なら");
  target.dataset.entry = resolved.entry;
  target.dataset.inflection = JSON.stringify(["conditional (〜なら)"]);
  target.dataset.inflectionBase = "だ";
  card.showNow(target);
  await settle();
  assert.equal(target.dataset.lemma, "だ");
});

test("choosing a noun homophone replaces the copula study base and explanation", async () => {
  const { card, window } = await page();
  const conditional = { ...taberu, headword: "なら", reading: "なら", entry: "jmdict:1009470",
    sourceForm: "なら", inflection: ["conditional (〜なら)"], inflectionBase: "だ" };
  const oak: typeof kimi = { ...kimi, headword: "楢", reading: "なら", entry: "jmdict:oak",
    senses: [{ position: 0, glosses: [{ lang: "eng", tag: "EN", text: "oak" }],
      partsOfSpeech: [{ label: "Noun", code: "n", category: "pos" }], tags: [] }] };
  const host = fakeHost({ definitions: { "なら": conditional, "楢": oak }, details: { "だ": studied } });
  host.lookup = async () => ({ status: "found", definition: conditional, candidates: [
    { entry: conditional.entry, headword: "なら", reading: "なら", common: true },
    { entry: oak.entry!, headword: "楢", reading: "なら", common: false },
  ] });
  card.setCardHost(host);
  card.setWriteState({ connected: true, canWrite: true });
  try {
    const target = await word("なら");
    card.showNow(target);
    await settle();
    assert.equal(target.dataset.lemma, "だ");
    assert.equal(target.dataset.state, "learning");
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    (shadow.querySelectorAll(".sb-candidate")[1] as unknown as HTMLElement).click();
    await settle();
    assert.equal(target.dataset.entry, oak.entry);
    assert.equal(target.dataset.lemma, "楢");
    assert.equal(target.dataset.state, "none");
    assert.equal(shadow.querySelector(".sb-inflection"), null);
    (shadow.querySelector(".sb-btn-save") as unknown as HTMLElement).click();
    await settle();
    assert.deepEqual(host.journal.saves, ["楢"]);
  } finally {
    card.setWriteState({ connected: false, canWrite: false });
  }
});

test("a lookup with no answer says so rather than rendering an empty card", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: {} }));
  card.showNow(await word("ヌルポ"));
  await settle();
  assert.match(await shown(), /No entry/);
});

test("opening a copula form keeps study state and saves on its grammatical base", async () => {
  const { card, window } = await page();
  const conditional = { ...taberu, headword: "なら", reading: "なら", entry: "jmdict:1009470",
    sourceForm: "なら", inflection: ["conditional (〜なら)"], inflectionBase: "だ" };
  card.setWriteState({ connected: true, canWrite: true });
  try {
    for (const saved of [true, false]) {
      const host = fakeHost({ definitions: { "なら": conditional }, details: saved ? { "だ": studied } : {} });
      card.setCardHost(host);
      const target = await word("なら");
      card.showNow(target);
      await settle();
      assert.equal(target.dataset.state, saved ? "learning" : "none");
      assert.equal(target.dataset.lemma, "だ");
      assert.equal(target.dataset.entry, "jmdict:1009470");
      const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
      assert.equal(shadow.querySelector(".sb-headword")?.textContent, "なら");
      (shadow.querySelector(saved ? ".sb-btn-known" : ".sb-btn-save") as unknown as HTMLElement).click();
      await settle();
      assert.deepEqual(host.journal.saves, ["だ"]);
    }
  } finally {
    card.setWriteState({ connected: false, canWrite: false });
  }
});

test("an unsupported lookup offers an explicit online action without showing a false miss", async () => {
  const { card, window } = await page();
  const host = fakeHost({ study: false });
  host.lookup = async () => ({ status: "unavailable", message: "Meaning search is available online.",
    action: { label: "Search online: arm hair", url: "https://shirabe.test/en/search/arm%20hair" } });
  card.setCardHost(host);
  card.showNow(await word("arm hair"));
  await settle();
  assert.match(await shown(), /Meaning search is available online/);
  assert.doesNotMatch(await shown(), /No entry/);
  const root = window.document.querySelector(".sb-host")?.shadowRoot;
  assert.ok(root?.querySelector('a[href="https://shirabe.test/en/search/arm%20hair"]'));
});

test("an unavailable local lookup does not send the query to a fallback host", async () => {
  const { withFallback } = await import("../src/word-card/fallback-host.js");
  const local = fakeHost({ study: false });
  local.lookup = async () => ({ status: "unavailable", message: "Meaning search is available online.",
    action: { label: "Search online", url: "https://shirabe.test/en/search/arm%20hair" } });
  const remote = fakeHost({ study: false });
  let requests = 0;
  remote.lookup = async () => { requests += 1; return { status: "found", definition: null }; };
  const answer = await withFallback(local, remote).lookup("arm hair", "word");
  assert.equal(answer.status, "unavailable");
  assert.equal(requests, 0);
});

test("a pending lookup shows the host's own message, not a pack", async () => {
  const { card } = await page();
  // The card must never name what the host is waiting for: a web host has no
  // pack, and this message is the only thing it gets to say.
  card.setCardHost(fakeHost({ pending: true }));
  card.showNow(await word("食べる"));
  await settle();
  const text = await shown();
  assert.match(text, /Getting ready…/);
  assert.doesNotMatch(text, /dictionary|pack/i);
});

test("a host with no study port draws no mining controls", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: { "君": kimi }, study: false }));
  card.setWriteState({ canWrite: true, connected: true });
  card.showNow(await word("君"));
  await settle();
  const text = await shown();
  assert.match(text, /you/, "the definition still renders");
  assert.doesNotMatch(text, /Save/, "but nothing offers to save it");
});

test("what the reader already knows reaches the word, from the host's answer", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: { "食べる": taberu }, details: { "食べる": studied } }));
  card.setWriteState({ canWrite: true, connected: true });
  const span = await word("食べる");
  card.showNow(span);
  await settle();
  assert.equal(span.dataset.state, "learning");
});

test("a host can fall back to another when it has no answer", async () => {
  const { withFallback } = await import("../src/word-card/fallback-host.js");
  const offline = fakeHost({ definitions: {} });            // an empty pack
  const online = fakeHost({ definitions: { "猫": kimi } });  // the server has it
  const host = withFallback(offline, online);

  const hit = await host.lookup("猫", "word");
  assert.equal(hit.status === "found" && hit.definition?.headword, "君");
  assert.deepEqual(offline.journal.lookups, ["猫"], "the pack was asked first");
  assert.deepEqual(online.journal.lookups, ["猫"], "and only then the server");
});

test("a pack that is still installing is waited for, not routed around", async () => {
  const { withFallback } = await import("../src/word-card/fallback-host.js");
  const installing = fakeHost({ pending: true });
  const online = fakeHost({ definitions: { "猫": kimi } });

  const result = await withFallback(installing, online).lookup("猫", "word");
  assert.equal(result.status, "pending", "the pack is about to be the better answer");
  assert.deepEqual(online.journal.lookups, [], "so the server is never asked");
});

test("a hide asked for twice on one move does not orphan the first countdown", async () => {
  const { card } = await page();
  // Two callers asking to hide on the same pointer move is ordinary: the card's
  // own guard and the host's. The first `hideTimer` used to be overwritten
  // rather than cancelled, so cancelling on arrival at the card cancelled only
  // the second, and the card vanished a quarter of a second after the reader
  // reached it.
  const { window } = await page();
  const host = window as unknown as { clearTimeout: (id: number) => void; setTimeout: (fn: () => void, ms: number) => number };
  const cleared: number[] = [];
  const started: number[] = [];
  const realClear = host.clearTimeout;
  const realSet = host.setTimeout;
  host.clearTimeout = (id: number) => { cleared.push(id); realClear(id); };
  host.setTimeout = (fn: () => void, ms: number) => { const id = realSet(fn, ms); started.push(id); return id; };
  try {
    card.scheduleHide();
    const first = started.at(-1)!;
    card.scheduleHide();
    assert.ok(cleared.includes(first), "the countdown the first call started is cancelled, not orphaned");
  } finally {
    host.clearTimeout = realClear;
    host.setTimeout = realSet;
  }
});

// An Anki card cannot save to Shirabe: the collection is where its reviews
// live, and the client it signs in as is refused a write by the server. Telling
// that reader they are offline and should connect an account is wrong three
// times over, and it is what they were told.
test("a surface that cannot save says nothing, rather than selling an upgrade", async () => {
  const { card } = await page();
  // A word no other test in this file uses: the card skips re-rendering the one
  // it is already showing, and a repeat here would assert against that.
  const readOnly = fakeHost({ definitions: { "座る": taberu } });
  delete readOnly.study!.save;
  delete readOnly.study!.markKnown;
  card.setCardHost(readOnly);
  card.setWriteState({ canWrite: false, connected: true });

  card.showNow(await word("座る"));
  await settle();

  const text = await shown();
  assert.match(text, /to eat/, "the definition is still the point");
  assert.doesNotMatch(text, /Offline lookup/);
  assert.doesNotMatch(text, /Pro/);
});

// The other half: a surface that COULD save, for a reader who has not paid for
// it, is exactly who that line is for.
test("a signed-out reader can connect instead of reading a dead sentence", async () => {
  const { card } = await page();
  const host = fakeHost({ definitions: { "書く": taberu } });
  let calls = 0;
  host.connectAccount = async () => { calls += 1; };
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: false });

  const offer = card.studyUnavailable();
  assert.ok(offer);
  const link = offer.querySelector("button.sb-connect") as HTMLButtonElement | null;
  assert.equal(link?.textContent, "Connect your account");
  assert.equal(offer.textContent, "Connect your account to see your dictionaries and save words");
  assert.equal(offer.querySelector(".sb-offline-mode"), null);
  assert.equal(offer.querySelector("a"), null);
  link?.click();
  await settle();
  assert.equal(calls, 1);
  assert.equal(link?.hidden, true);
});

test("an offline lookup puts Offline Mode ahead of the connect offer and drops history buttons when asked", async () => {
  const { card, window } = await page();
  const host = fakeHost({ definitions: { "三村": { ...taberu, offline: true } } });
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: false });
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, historyNavigation: false });
  try {
    card.showNow(await word("三村"));
    await settle();
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    const row = shadow.querySelector(".sb-study-unavailable")!;
    assert.equal(row.textContent, "Offline Mode | Connect your account to see your dictionaries and save words");
    assert.equal(row.querySelector("button.sb-connect")?.textContent, "Connect your account");
    assert.equal(row.querySelector(".sb-connect-line")?.textContent, "Connect your account to see your dictionaries and save words");
    const css = shadow.querySelector("style")?.textContent ?? "";
    assert.match(css, /\.sb-connect \{[^}]*text-decoration: none/);
    assert.match(css, /\.sb-popup\.sb-no-history \.sb-chrome \{ display: none; \}/);
    assert.equal(shadow.querySelector(".sb-chrome")?.hasAttribute("hidden"), true);
    assert.ok(shadow.querySelector(".sb-popup")?.classList.contains("sb-no-history"));
  } finally {
    card.setPopupOptions(card.DEFAULT_CARD_OPTIONS);
    card.setWriteState({ canWrite: false, connected: false });
  }
});

test("a surface that could save still offers the upgrade", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: { "読む": taberu } }));
  card.setWriteState({ canWrite: false, connected: true });

  card.showNow(await word("読む"));
  await settle();

  assert.match(await shown(), /Pro/);
});

// The pronunciation button is drawn from the entry's own `audioUrl`, but playing
// it went through `host.audio`, which only the extension has: on every other
// surface the button rendered and clicking it did nothing at all, silently.
test("a host with no audio port still plays the clip", async () => {
  const { card, window } = await page();
  const played: string[] = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    constructor(src: string) { played.push(src); }
    play() { return Promise.resolve(); }
  };

  const host = fakeHost({ definitions: { "聞く": taberu } });
  assert.equal(host.audio, undefined, "the API host has no audio port either");
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: true });
  card.showNow(await word("聞く"));
  await settle();

  const root = (window.document.querySelector(".sb-host") as unknown as { shadowRoot: ShadowRoot }).shadowRoot;
  const button = root.querySelector(".sb-audio") as HTMLElement | null;
  assert.ok(button, "the pronunciation button is drawn");
  assert.equal(button.textContent, "", "the pronunciation button is an icon, not an emoji");
  assert.equal(button.querySelector("svg")?.getAttribute("viewBox"), "0 0 24 24");
  assert.match(button.querySelector("path")?.getAttribute("d") ?? "", /^M19\.114 5\.636/);
  button.click();
  await settle();

  assert.deepEqual(played, ["https://cdn.shirabe.org/audio/abc123.opus"]);
});

test("a remote pronunciation uses the host audio port instead of loading the CDN URL directly", async () => {
  const { card, window } = await page();
  const originalAudio = globalThis.Audio;
  const played: string[] = [], requested: string[] = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    constructor(src: string) { played.push(src); }
    play() { return Promise.resolve(); }
  };
  let release!: (value: { dataUrl: string }) => void;
  const pending = new Promise<{ dataUrl: string }>(resolve => { release = resolve; });
  const host = fakeHost({ study: false, definitions: { "聞く": taberu } });
  host.audio = { clip: (url) => { requested.push(url); return pending; } };
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: true });
  try {
    card.showNow(await word("聞く"));
    await settle();
    const button = window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-audio") as unknown as HTMLButtonElement;
    button.click();
    assert.deepEqual(requested, ["https://cdn.shirabe.org/audio/abc123.opus"]);
    assert.deepEqual(played, []);
    release({ dataUrl: "data:audio/mp4;base64,fromHost" });
    await settle();
    assert.deepEqual(played, ["data:audio/mp4;base64,fromHost"]);
  } finally {
    card.dismissPopup();
    globalThis.Audio = originalAudio;
  }
});

test("prepared pronunciation waits for a click, reports local failure inline and can retry", async () => {
  const { card, window } = await page();
  const played: string[] = [];
  const originalAudio = globalThis.Audio;
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    constructor(src: string) { played.push(src); }
    play() { return Promise.resolve(); }
  };
  let reads = 0;
  const local = { ...taberu, offline: true, pitch: taberu.pitch.map(p => ({ ...p, audioUrl: `shirabe_${"a".repeat(64)}.m4a` })) };
  const host = fakeHost({ study: false, definitions: { "聞く": local } });
  host.notify = undefined;
  host.audio = { clip: async () => ++reads === 1 ? { error: "Sync media or prepare this card again." } : { dataUrl: "data:audio/mp4;base64,fixture" } };
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: false, readOnly: true });
  card.setPopupOptions({ ...card.DEFAULT_CARD_OPTIONS, audioAutoplay: true });
  try {
    card.showNow(await word("聞く"));
    await settle();
    assert.equal(reads, 0, "Prepared media must not load before explicit playback");
    const shadow = window.document.querySelector(".sb-host")!.shadowRoot!;
    const button = shadow.querySelector(".sb-audio") as unknown as HTMLButtonElement;
    button.click();
    await settle();
    assert.match(shadow.querySelector('[role="status"]')?.textContent ?? "", /Sync media/);
    assert.deepEqual(played, []);
    assert.equal(button.disabled, false);
    button.click();
    await settle();
    assert.equal(reads, 2);
    assert.deepEqual(played, ["data:audio/mp4;base64,fixture"]);
    assert.equal(shadow.querySelector('[role="status"]')?.textContent, "");
  } finally {
    card.dismissPopup();
    card.setPopupOptions(card.DEFAULT_CARD_OPTIONS);
    globalThis.Audio = originalAudio;
  }
});

test("a pronunciation response arriving after dismissal or another lookup never starts playback", async () => {
  const { card, window } = await page();
  const originalAudio = globalThis.Audio;
  const played: string[] = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    constructor(src: string) { played.push(src); }
    play() { return Promise.resolve(); }
  };
  try {
    for (const replace of [false, true]) {
      let release!: (value: { dataUrl: string }) => void;
      const pending = new Promise<{ dataUrl: string }>(resolve => { release = resolve; });
      const local = { ...taberu, offline: true, pitch: taberu.pitch.map(p => ({ ...p, audioUrl: `shirabe_${"a".repeat(64)}.mp3` })) };
      const host = fakeHost({ study: false, definitions: { "聞く": local, "君": kimi } });
      let reads = 0;
      host.audio = { clip: () => { reads++; return pending; } };
      card.setCardHost(host);
      card.setWriteState({ canWrite: false, connected: false, readOnly: true });
      card.showNow(await word("聞く"));
      await settle();
      const button = window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-audio") as unknown as HTMLButtonElement;
      button.click();
      button.click();
      assert.equal(reads, 1, "Repeated activation cannot duplicate an in-flight clip read");
      if (replace) card.showNow(await word("君"));
      else card.dismissPopup();
      release({ dataUrl: "data:audio/mp4;base64,stale" });
      await settle();
      assert.deepEqual(played, []);
    }
  } finally {
    card.dismissPopup();
    globalThis.Audio = originalAudio;
  }
});

test("active pronunciation stops on dismissal, a new lookup and a host change", async () => {
  const { card, window } = await page();
  const originalAudio = globalThis.Audio;
  const clips: Array<{ playing: boolean; paused: number; unloaded: number }> = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    playing = false;
    paused = 0;
    unloaded = 0;
    constructor() { clips.push(this); }
    play() { this.playing = true; return Promise.resolve(); }
    pause() { this.playing = false; this.paused++; }
    removeAttribute(name: string) { assert.equal(name, "src"); }
    load() { this.unloaded++; }
  };
  try {
    for (const leave of ["dismiss", "lookup", "host"] as const) {
      const host = fakeHost({ study: false, definitions: { "聞く": taberu, "君": kimi } });
      card.setCardHost(host);
      card.showNow(await word("聞く"));
      await settle();
      const button = window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-audio") as unknown as HTMLButtonElement;
      button.click();
      await settle();
      const clip = clips.at(-1)!;
      assert.equal(clip.playing, true);
      if (leave === "dismiss") card.dismissPopup();
      else if (leave === "lookup") card.showNow(await word("君"));
      else card.setCardHost(fakeHost({ study: false }));
      assert.equal(clip.playing, false, leave);
      assert.equal(clip.paused, 1);
      assert.equal(clip.unloaded, 1);
      card.dismissPopup();
      assert.equal(clip.paused, 1, "cleanup is idempotent");
    }
  } finally {
    card.dismissPopup();
    globalThis.Audio = originalAudio;
  }
});

test("replaying pronunciation replaces the active clip instead of overlapping it", async () => {
  const { card, window } = await page();
  const originalAudio = globalThis.Audio;
  const clips: Array<{ playing: boolean }> = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    playing = false;
    constructor() { clips.push(this); }
    play() { this.playing = true; return Promise.resolve(); }
    pause() { this.playing = false; }
    removeAttribute() {}
    load() {}
  };
  try {
    card.setCardHost(fakeHost({ study: false, definitions: { "聞く": taberu } }));
    card.showNow(await word("聞く"));
    await settle();
    const button = window.document.querySelector(".sb-host")!.shadowRoot!.querySelector(".sb-audio") as unknown as HTMLButtonElement;
    button.click();
    await settle();
    button.click();
    await settle();
    assert.equal(clips.length, 2);
    assert.deepEqual(clips.map(clip => clip.playing), [false, true]);
  } finally {
    card.dismissPopup();
    globalThis.Audio = originalAudio;
  }
});

test("changing accent while a clip loads discards its late response on the same word", async () => {
  const { card, window } = await page();
  const originalAudio = globalThis.Audio;
  const played: string[] = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    constructor(src: string) { played.push(src); }
    play() { return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
    load() {}
  };
  let release!: (clip: { dataUrl: string }) => void;
  const pending = new Promise<{ dataUrl: string }>(resolve => { release = resolve; });
  const definition = { ...taberu, pitch: [taberu.pitch[0]!, { downstep: 0, audioUrl: "https://cdn.shirabe.org/audio/second.m4a" }] };
  const host = fakeHost({ study: false, definitions: { "聞く": definition } });
  host.audio = { clip: async (url) => url.endsWith("second.m4a") ? { dataUrl: "data:audio/mp4;base64,second" } : pending };
  try {
    card.setCardHost(host);
    card.showNow(await word("聞く"));
    await settle();
    const buttons = window.document.querySelector(".sb-host")!.shadowRoot!.querySelectorAll(".sb-audio");
    (buttons[0] as unknown as HTMLButtonElement).click();
    (buttons[1] as unknown as HTMLButtonElement).click();
    await settle();
    assert.deepEqual(played, ["data:audio/mp4;base64,second"]);
    release({ dataUrl: "data:audio/mp4;base64,first" });
    await settle();
    assert.deepEqual(played, ["data:audio/mp4;base64,second"]);
  } finally {
    card.dismissPopup();
    globalThis.Audio = originalAudio;
  }
});

// Which word the card is about has to stay visible while the card is open.
// Hover cannot carry it: the pointer leaves the word to reach the card, and a
// touch reader never hovers at all, so on a phone there was no way to tell what
// you had just tapped.
test("the word the card is about is marked while the card is open", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: { "食べる": taberu } }));

  const span = await word("食べる");
  card.showNow(span);
  await settle();

  assert.ok(span.classList.contains("sb-word-open"), "the open word is marked");

  card.dismissPopup();
  await settle();
  assert.equal(span.classList.contains("sb-word-open"), false, "and unmarked when the card goes");
});

test("only one word is marked at a time", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: { "食べる": taberu, "君": kimi } }));

  const first = await word("食べる");
  card.showNow(first);
  await settle();

  const second = await word("君");
  card.showNow(second);
  await settle();

  assert.equal(first.classList.contains("sb-word-open"), false, "the word you moved off is released");
  assert.ok(second.classList.contains("sb-word-open"));
});
