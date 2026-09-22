import assert from "node:assert/strict";
import test from "node:test";
import { fakeHost } from "./fake-host.js";
import { kimi, studied, taberu } from "./fixtures.js";
import { snapshotHash, snapshotHost, type PreparedSnapshot } from "../src/word-card/snapshot-host.js";

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

test("a host with complete alternatives renders one scrollable result stack", async () => {
  const { card, window } = await page();
  const alternative = {
    ...taberu,
    headword: "他べる",
    reading: "ほかべる",
    entry: "jmdict:alternative",
    pitch: [],
    senses: [{ ...taberu.senses[0]!, glosses: [{ lang: "eng" as const, tag: "EN", text: "an alternative match" }] }],
  };
  const host = fakeHost({ study: false, definitions: { "食べる": taberu, "jmdict:alternative": alternative } });
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
  assert.equal(shadow.querySelector(".sb-alternatives-label")?.textContent, "Other matches");
  assert.match(shadow.querySelector(".sb-alternative")?.textContent ?? "", /an alternative match/);
  assert.equal(shadow.querySelector(".sb-alternative-headword")?.textContent, "他べるほかべる");
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

test("covered dictionary senses do not reveal their source tags", async () => {
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
  const covered = shadow.querySelector(".sb-sense-covered")!;
  assert.equal(shadow.querySelectorAll(".sb-source-tag").length, 1);
  assert.equal(covered.querySelectorAll(".sb-source-tag").length, 1);
  assert.equal(shadow.querySelectorAll(".sb-entry-chips").length, 2);
  assert.equal(covered.querySelectorAll(".sb-entry-chips").length, 1);
  assert.match(shadow.textContent ?? "", /Public noun/);
  assert.match(covered.textContent ?? "", /Private noun/);
  assert.match(shadow.querySelector(".sb-sense-covered")?.getAttribute("aria-label") ?? "", /Focus or hover to reveal/);
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
  assert.match(shadow.textContent ?? "", /一①/);
  assert.match(shadow.textContent ?? "", /一㋐/);
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
  assert.match(await shown(), /食べた → 食べる/);
  const { window } = await page();
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

test("the inflection path is shown as the host reported it", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: { "食べた": taberu } }));
  card.showNow(await word("食べた"));
  await settle();
  assert.match(await shown(), /食べた.*食べる.*past/s);
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
  assert.equal(shadow.querySelector(".sb-inflection")?.textContent, "なら → だ · conditional (〜なら)");
  assert.equal(shadow.querySelector(".sb-headword")?.textContent, "なら");
  assert.equal(target.dataset.entry, "jmdict:1009470");
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
test("a surface that could save still offers the upgrade", async () => {
  const { card } = await page();
  card.setCardHost(fakeHost({ definitions: { "読む": taberu } }));
  card.setWriteState({ canWrite: false, connected: true });

  card.showNow(await word("読む"));
  await settle();

  assert.match(await shown(), /Pro/);
});

// The 🔊 button is drawn from the entry's own `audioUrl`, but playing it went
// through `host.audio`, which only the extension has: on every other surface the
// button rendered and clicking it did nothing at all, silently.
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
