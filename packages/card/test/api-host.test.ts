import assert from "node:assert/strict";
import test from "node:test";
import { apiHost, candidateToDefinition, toDefinition } from "../src/word-card/api-host.js";
import { createLink, type Link } from "../src/word-card/link.js";
import type { ApiWordDetail } from "../src/word-card/api-types.js";
import book from "../src/word-card/resources/legend.json" with { type: "json" };
import { chipLabel, tagPresentation } from "../src/word-card/legend.js";
import { applyDictionaryReveal } from "../src/word-card/dictionary-reveal.js";

test("every known Legend chip fits ten characters in English and Spanish", () => {
  for (const [kind, codes] of Object.entries(book.codes)) {
    for (const [code, slug] of Object.entries(codes)) {
      for (const language of ["eng", "spa"] as const) {
        const label = chipLabel(code, kind === "pos" ? "partOfSpeech" : "misc", "source wording", [language]);
        assert.ok([...label].length <= 10, `${language} ${code} (${slug}): ${label}`);
      }
    }
  }
  assert.equal(chipLabel("num", "partOfSpeech", "numeric", ["eng"]), "Numeric");
  assert.equal(chipLabel("ctr", "partOfSpeech", "counter", ["eng"]), "Counter");
  assert.equal(chipLabel("unc", "partOfSpeech", "unclassified", ["eng"]), "Unclass.");
  assert.equal(chipLabel("v2a-s", "partOfSpeech", "classical verb", ["eng"]), "Classical");
  assert.equal(chipLabel("comp", "field", "computing", ["eng"]), "Computing");
  assert.equal(chipLabel("ksb", "dialect", "Kansai-ben - Kansai dialect", ["eng"]), "Kansai-ben");
});

test("the card shortens the API's long kana label in both languages", () => {
  const source = payload.entries[0]!;
  const entry = { ...source, senses: source.senses.map((sense) => ({
    ...sense,
    tags: [{ category: "misc", code: "uk", label: "word usually written in kana", scope: "sense" as const }],
  })) };
  const word = { ...payload, entries: [entry] };
  assert.equal(toDefinition(word, "https://shirabe.org", ["eng"]).senses[0]?.tags[0]?.label, "Kana only");
  assert.equal(toDefinition(word, "https://shirabe.org", ["spa"]).senses[0]?.tags[0]?.label, "Solo kana");
  const english = toDefinition(word, "https://shirabe.org", ["eng"]).senses[0]?.tags[0]?.presentation;
  const spanish = toDefinition(word, "https://shirabe.org", ["spa"]).senses[0]?.tags[0]?.presentation;
  assert.equal(english?.fullLabel, "Usually kana");
  assert.equal(spanish?.fullLabel, "Normalmente en kana");
  assert.ok(english?.explanation);
  assert.ok(spanish?.explanation);
  assert.notEqual(english?.explanation, spanish?.explanation);
});

test("display locale chooses tag text independently of gloss language", () => {
  const spanish = toDefinition(payload, "https://shirabe.org", ["eng"], { displayLocale: "es" });
  const english = toDefinition(payload, "https://shirabe.org", ["spa"], { displayLocale: "en" });
  assert.equal(spanish.senses[0]?.glosses[0]?.text, "to open");
  assert.equal(spanish.senses[0]?.tags[0]?.label, "Solo kana");
  assert.equal(spanish.senses[0]?.tags[0]?.presentation?.fullLabel, "Normalmente en kana");
  assert.equal(english.senses[0]?.tags[0]?.label, "Kana only");
  assert.equal(english.senses[0]?.tags[0]?.presentation?.fullLabel, "Usually kana");
});

test("the API host passes its display locale into tag presentations", async () => {
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", languages: ["eng"], displayLocale: "es",
    fetch: async () => Response.json({ words: [{ candidates: [payload] }] }),
  });
  const result = await host.lookup("開く", "word");
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.definition?.senses[0]?.tags[0]?.label, "Solo kana");
  assert.equal(result.definition?.senses[0]?.glosses[0]?.text, "to open");
});

test("presentation does not borrow an unrelated explanation for name types or unknown tags", () => {
  assert.equal(tagPresentation("fem", "nameType", "female given name", ["eng"]).explanation, undefined);
  assert.equal(tagPresentation("custom", "field", "my custom domain", ["spa"]).fullLabel, "my custom domain");
});

test("name types stay distinct from usage tags with the same code", () => {
  const source = payload.entries[0]!;
  const entry = { ...source, senses: source.senses.map((sense) => ({
    ...sense,
    tags: [
      { category: "nameType", code: "fem", label: "female given name", scope: "sense" as const },
      { category: "misc", code: "fem", label: "feminine language", scope: "sense" as const },
    ],
  })) };
  const definition = toDefinition({ ...payload, entries: [entry] }, "https://shirabe.org", ["eng"]);
  assert.deepEqual(definition.senses[0]?.tags.map(({ category, label }) => [category, label]),
    [["nameType", "Name"], ["misc", "Feminine"]]);
});

test("a host can translate a tag without replacing the SDK's code mapping", () => {
  const seen: Array<[string, string]> = [];
  const definition = toDefinition(payload, "https://shirabe.org", ["eng"], (tag, short) => {
    seen.push([tag.code, short]);
    return tag.code === "uk" ? "仮名書き" : short;
  });
  assert.deepEqual(seen, [["v5k", "Godan verb"], ["uk", "Kana only"]]);
  assert.equal(definition.senses[0]?.tags[0]?.label, "仮名書き");
});

test("the API host applies a caller's tag labels to lookups", async () => {
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", languages: ["eng"],
    labelForTag: (tag, short) => tag.code === "uk" ? "仮名書き" : short,
    fetch: async () => Response.json({ words: [{ candidates: [payload] }] }),
  });
  const result = await host.lookup("開く", "word");
  assert.equal(result.status, "found");
  if (result.status === "found") assert.equal(result.definition?.senses[0]?.tags[0]?.label, "仮名書き");
});

test("a host can replace the full presentation for its own language", async () => {
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", languages: ["eng"],
    presentationForTag: (tag, defaults) => tag.code === "uk"
      ? { ...defaults, shortLabel: "仮名書き", fullLabel: "仮名で書く語", explanation: "ふつう仮名で書きます。" }
      : defaults,
    fetch: async () => Response.json({ words: [{ candidates: [payload] }] }),
  });
  const result = await host.lookup("開く", "word");
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.definition?.senses[0]?.tags[0]?.label, "仮名書き");
  assert.equal(result.definition?.senses[0]?.tags[0]?.presentation?.explanation, "ふつう仮名で書きます。");
});

test("the full-entry link uses the selected word handle without an entry query", () => {
  const definition = toDefinition({ ...payload, id: "猫-ねこ-cat:1", dictionary: "personal-review", sourceId: "cat:1" }, "https://shirabe.org", ["eng"]);
  assert.equal(definition.entry, "personal-review:cat:1");
  assert.equal(new URL(definition.url!).pathname, "/en/words/%E7%8C%AB-%E3%81%AD%E3%81%93-cat%3A1");
  assert.equal(new URL(definition.url!).search, "");
});

test("resolved particles remain clickable while punctuation does not", async () => {
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", fetch: async () => new Response(JSON.stringify({
    stackFingerprint: "test", results: [{ tokens: [
      { surface: "が", startOffset: 0, endOffset: 1, lemma: "が", kind: "function" },
      { surface: "。", startOffset: 1, endOffset: 2, kind: "symbol" },
    ] }],
  })) });
  const tokens = await host.tokenize!("が。");
  assert.equal(tokens[0]!.content, true);
  assert.equal(tokens[1]!.content, false);
});

test("online scans retain the matched surface and localized inflection without contaminating entry cache", async () => {
  const calls: string[] = [];
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", languages: ["spa"], fetch: async (url, init) => {
    const path = new URL((url instanceof Request ? url.url : String(url))).pathname;
    calls.push(path);
    if (path.endsWith("/parse")) {
      assert.equal((url instanceof Request ? url.headers : new Headers(init?.headers)).get("Accept-Language"), "es");
      return Response.json({ stackFingerprint: "test", results: [{ tokens: [
        { surface: "開いた", startOffset: 0, endOffset: 3, lemma: "開く", reading: "ヒライタ", partOfSpeech: "verb",
          kind: "inflected", inflection: { forms: [{ code: "past", label: "pasado" }], base: "開く" } },
        { surface: "。", startOffset: 3, endOffset: 4, kind: "symbol" },
      ] }] });
    }
    return Response.json({ words: [{ candidates: [payload] }] });
  } });
  const [token] = await host.tokenize!("開いた。");
  assert.deepEqual(token!.inflection, ["pasado"]);
  assert.equal(token!.inflectionBase, "開く");
  const result = await host.lookup("開いた。", "text");
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.definition!.sourceForm, "開いた");
  assert.deepEqual(result.definition!.inflection, ["pasado"]);
  assert.equal(result.definition!.inflectionBase, "開く");
  const bare = await host.lookup("開く", "word", { surface: "開いた", reading: "ヒライタ", pos: "verb" });
  assert.equal(bare.status, "found");
  if (bare.status === "found") assert.equal(bare.definition!.inflection, undefined);
  assert.equal(calls.filter((path) => path.endsWith("/words/identify")).length, 1);
});

test("saving sends the Rails lemma and selected dictionary identity", async () => {
  let body: unknown;
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", fetch: async (_url, init) => {
    const request = _url instanceof Request ? _url : new Request(_url, init);
    body = JSON.parse(await request.clone().text());
    return new Response("{}", { status: 201 });
  } });
  const word = { dataset: { lemma: "開く", reading: "ひらく", entry: "jmdict:1202650" } } as unknown as HTMLElement;
  assert.equal((await host.study!.save!(word, ["jmdict#0"])).ok, true);
  assert.deepEqual(body, {
    lemma: "開く", reading: "ひらく", dictionarySlug: "jmdict", sourceId: "1202650", senses: ["jmdict#0"],
  });
});

test("a raw scan uses identify to choose among homographs", async () => {
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", fetch: async (url) => {
    const path = new URL((url instanceof Request ? url.url : String(url))).pathname;
    if (path.endsWith("/parse")) return Response.json({ stackFingerprint: "test", results: [{ tokens: [
      { surface: "開いた", lemma: "開く", startOffset: 0, endOffset: 3, kind: "inflected" },
    ] }] });
    if (path.endsWith("/words/identify")) return Response.json({ words: [{ candidates: [payload] }] });
    throw new Error(`Unexpected request: ${url}`);
  } });
  const result = await host.lookup("開いた。", "text");
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.definition!.entry, "jmdict:1202650");
  assert.equal(result.definition!.sourceForm, "開いた");
  assert.deepEqual(result.candidates?.map((candidate) => candidate.entry), ["jmdict:1202650"]);
});

// A payload shaped like GET /api/v1/words/{id}: two dictionaries, two
// languages, and a sense position that is not its array index. Each of those is
// a case the mapping gets wrong if it is written by eye.
const payload: ApiWordDetail = {
  dictionary: "jmdict",
  sourceId: "1202650",
  id: "開く-ひらく",
  headword: "開く",
  reading: "ひらく",
  furigana: [],
  common: true,
  jlpt: "N4",
  frequency: 880,
  pitch: [{ downstep: 2, pattern: "nakadaka", audioUrl: "https://cdn.shirabe.org/audio/x.opus" }],
  forms: [
    { text: "開く", script: "kanji", common: true },
    { text: "ひらく", script: "kana", common: true },
    { text: "披く", script: "kanji", common: false, tags: [{ category: "writing", code: "rK", label: "rare kanji form" }] },
  ],
  entries: [
    {
      dictionary: "jmdict", dictionaryName: "JMdict", type: "definition", sourceId: "1202650",
      senses: [
        {
          position: 0,
          definitions: [{ lang: "en", text: "to open" }, { lang: "es", text: "abrir" }],
          tags: [{ category: "partOfSpeech", code: "v5k", label: "Godan verb" }, { category: "misc", code: "uk", label: "Usually kana" }],
        },
        // Position 3, not 1: the API filtered senses out, and renumbering here
        // would scope a save to the wrong meaning.
        { position: 3, definitions: [{ lang: "en", text: "to bloom" }], tags: [] },
      ],
    },
    {
      dictionary: "daijirin", dictionaryName: "大辞林", type: "definition", sourceId: "9",
      senses: [{ position: 0, definitions: [{ lang: "ja", text: "とじていたものをあける" }], tags: [] }],
    },
  ],
  examples: [{ id: "tatoeba:1", japanese: "花が開く。",
    source: { dictionary: "tatoeba", name: "Tatoeba", sourceId: "1" }, matches: [],
    translations: [{ lang: "en", text: "The flower blooms." }, { lang: "es", text: "La flor florece." }] }],
};

const built = () => toDefinition(payload, "https://shirabe.org", ["eng"]);

test("the API entry kind reaches the card result", () => {
  assert.equal(built().kind, "definition");
  assert.equal(toDefinition({ ...payload, entries: [{ ...payload.entries[0]!, type: "encyclopedia" }] }, "https://shirabe.org", ["eng"]).kind, "encyclopedia");
  assert.equal(toDefinition({ ...payload, name: true }, "https://shirabe.org", ["eng"]).kind, "name");
});

test("entries are flattened in the server-provided dictionary order", () => {
  const def = built();
  assert.equal(def.senses[0]?.glosses[0]?.text, "to open");
  assert.equal(def.senses.at(-1)?.glosses[0]?.text, "とじていたものをあける");
  assert.equal(def.entry, "jmdict:1202650");
});

test("candidate mapping preserves the aligned furigana for the matched spelling", async () => {
  const candidate = {
    ...payload,
    headword: "きょう",
    matchedHeadword: "今日",
    reading: "キョウ",
    furigana: [{ text: "今", ruby: "きょ" }, { text: "日", ruby: "う" }],
  };
  const definition = candidateToDefinition(candidate, "https://shirabe.org", ["eng"]);
  assert.equal(definition.headword, "今日");
  assert.deepEqual(definition.furigana, [{ text: "今", ruby: "きょ" }, { text: "日", ruby: "う" }]);
  const unrelated = candidateToDefinition({ ...candidate, furigana: [{ text: "きょう" }] }, "https://shirabe.org", ["eng"]);
  assert.equal(unrelated.furigana, undefined, "ruby for another spelling must not be applied to the matched headword");
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", languages: ["eng"],
    fetch: async () => Response.json({ words: [{ candidates: [candidate] }] }) });
  const result = await host.lookup("今日", "word");
  assert.equal(result.status, "found");
  if (result.status === "found") {
    assert.equal(result.definition?.headword, "今日");
    assert.deepEqual(result.definition?.furigana, definition.furigana);
  }
});

test("identify matched spelling uses its own ruby while preserving entry identity", () => {
  const candidate = {
    ...payload,
    headword: "初",
    matchedHeadword: "生",
    reading: "うぶ",
    furigana: [{ text: "初", ruby: "うぶ" }],
    matchedFurigana: [{ text: "生", ruby: "うぶ" }],
  };
  const definition = candidateToDefinition(candidate, "https://shirabe.org", ["eng"]);
  assert.equal(definition.headword, "生");
  assert.deepEqual(definition.furigana, [{ text: "生", ruby: "うぶ" }]);
  assert.equal(definition.entry, `${payload.dictionary}:${payload.sourceId}`);
  assert.equal(candidate.headword, "初");
  assert.deepEqual(candidate.furigana, [{ text: "初", ruby: "うぶ" }]);
});

test("display order cannot replace the resolved dictionary identity", () => {
  const definition = toDefinition({ ...payload, dictionary: "daijirin", sourceId: "9" }, "https://shirabe.org", ["eng"]);
  assert.equal(definition.entry, "daijirin:9");
  assert.equal(definition.senses[0]?.glosses[0]?.text, "to open");
});

test("a sense keeps the position the API gave it, so a save scopes correctly", () => {
  const positions = built().senses.map((s) => s.position);
  assert.deepEqual(positions, [0, 3, 0], "not renumbered by array index");
});

test("each dictionary is named even when it is the only one", () => {
  const mixed = built();
  assert.equal(mixed.senses[0]?.dictionary, "JMdict");

  const single = toDefinition({ ...payload, entries: [payload.entries[1]!] }, "https://shirabe.org", ["eng"]);
  assert.equal(single.senses[0]?.dictionary, "大辞林");
});

test("dictionary reveal follows the matching source without changing the stored definition", () => {
  const original = built();
  const result = applyDictionaryReveal(original, { "daijirin:ja": "hover", jmdict: "show" });
  assert.equal(result.senses[0]?.covered, false);
  assert.equal(result.senses.at(-1)?.covered, true);
  assert.equal(original.senses.at(-1)?.covered, undefined);
});

test("glosses come back in the reader's languages, in their order", () => {
  const spanishFirst = toDefinition(payload, "https://shirabe.org", ["spa", "eng"]);
  assert.deepEqual(spanishFirst.senses[0]?.glosses.map((g) => g.text), ["abrir", "to open"]);

  const englishOnly = built();
  assert.deepEqual(englishOnly.senses[0]?.glosses.map((g) => g.text), ["to open"]);
});

test("a monolingual sense still renders for a reader whose glosses are English", () => {
  // The 大辞林 sense is Japanese only. It survives, because the server already
  // filtered by the reader's dictionary stack: it came back because they chose
  // that dictionary, and dropping it would hide the dictionary itself.
  const english = built();
  assert.equal(english.senses.length, 3);
  assert.equal(english.senses.at(-1)?.glosses[0]?.text, "とじていたものをあける");
  assert.equal(english.senses.at(-1)?.dictionary, "大辞林", "and it says which dictionary said it");
});

test("publisher definition titles and usage-only senses survive API mapping", () => {
  const source = {
    ...payload.entries[0]!,
    senses: [
      {
        ...payload.entries[0]!.senses[0]!,
        definitions: [{ lang: "ja", text: "自慢する", title: "意味" }],
        usages: [
          { lang: "ja", text: "学歴を鼻にかける", title: "使用例" },
          { lang: "ja", text: "家柄の良さを鼻にかける" },
        ],
      },
      { ...payload.entries[0]!.senses[0]!, position: 1, definitions: [], usages: [{ lang: "ja", text: "才気を鼻にかける", title: "用例" }] },
    ],
  };
  const definition = toDefinition({ ...payload, entries: [source] }, "https://shirabe.org", ["jpn"]);

  assert.deepEqual(definition.senses[0]?.glosses, [{ lang: "jpn", tag: "JA", text: "自慢する", title: "意味" }]);
  assert.deepEqual(definition.senses[0]?.usages, [
    { lang: "jpn", tag: "JA", text: "学歴を鼻にかける", title: "使用例" },
    { lang: "jpn", tag: "JA", text: "家柄の良さを鼻にかける" },
  ]);
  assert.deepEqual(definition.senses[1]?.usages, [{ lang: "jpn", tag: "JA", text: "才気を鼻にかける", title: "用例" }]);
});

test("a note-only sense remains visible without inventing a definition", () => {
  const entry = {
    ...payload.entries[0]!,
    senses: [{
      ...payload.entries[0]!.senses[0]!,
      definitions: [],
      usages: [],
      notes: [ "（他五）" ],
    }],
  };

  const definition = toDefinition({ ...payload, entries: [entry] }, "https://shirabe.org", ["eng"]);

  assert.deepEqual(definition?.senses[0]?.glosses, []);
  assert.deepEqual(definition?.senses[0]?.notes, [ "（他五）" ]);
});

test("a relation-only sense remains visible without inventing a definition", () => {
  const source = {
    ...payload.entries[0]!,
    senses: [{
      ...payload.entries[1]!.senses[0]!,
      definitions: [],
      usages: [],
      related: [{ text: "関係", reading: "かんけい" }],
    }],
  };

  const definition = toDefinition({ ...payload, entries: [source] }, "https://shirabe.org", ["eng"]);

  assert.deepEqual(definition.senses[0]?.glosses, []);
  assert.deepEqual(definition.senses[0]?.xrefs, [{ kind: "related", text: "関係", reading: "かんけい" }]);
});

test("an empty API sense is excluded while a relation-only sense keeps its position", () => {
  const source = {
    ...payload.entries[1]!,
    senses: [
      { ...payload.entries[1]!.senses[0]!, position: 2, definitions: [], usages: [], related: undefined, antonyms: undefined, seeAlso: undefined },
      { ...payload.entries[1]!.senses[0]!, position: 4, definitions: [], usages: [], related: [{ text: "充実", reading: "じゅうじつ" }] },
    ],
  };

  const definition = toDefinition({ ...payload, entries: [source] }, "https://shirabe.org", ["eng"]);

  assert.deepEqual(definition.senses.map((sense) => sense.position), [4]);
  assert.deepEqual(definition.senses[0]?.xrefs, [{ kind: "related", text: "充実", reading: "じゅうじつ" }]);
});

test("a numbered dictionary division survives even without definition text", () => {
  const entry = {
    ...payload.entries[0]!,
    senses: [{ position: 0, depth: 0, label: "一", definitions: [], usages: [], tags: [
      { category: "partOfSpeech", code: "n", label: "Noun", scope: "group" } as const,
    ] }],
  };
  const definition = toDefinition({ ...payload, entries: [entry] }, "https://shirabe.org", ["eng"]);

  assert.equal(definition.senses[0]?.label, "一");
  assert.deepEqual(definition.senses[0]?.glosses, []);
  assert.equal(definition.senses[0]?.groupTags?.[0]?.label, "Noun");
});

test("sense hierarchy keeps labels, depth, and annotation scope", () => {
  const entryTag = { category: "partOfSpeech", code: "n", label: "Noun", scope: "entry" } as const;
  const groupTag = { category: "partOfSpeech", code: "v1", label: "Ichidan verb", scope: "group" } as const;
  const senseTag = { category: "misc", code: "arch", label: "Archaic", scope: "sense" } as const;
  const entry = {
    ...payload.entries[0]!,
    senses: [{ position: 4, depth: 2, label: "一㋐", definitions: [{ lang: "en", text: "to open" }], tags: [entryTag, groupTag, senseTag] }],
  };
  const definition = toDefinition({ ...payload, entries: [entry] }, "https://shirabe.org", ["eng"]);

  assert.deepEqual(Object.fromEntries(Object.entries(definition.entryTagsByEntry ?? {}).map(([entry, chips]) =>
    [entry, chips.map(({ presentation: _presentation, ...chip }) => chip)])), {
    "jmdict:1202650": [{ label: "Noun", code: "n", category: "pos", scope: "entry" }],
  });
  assert.equal(definition.senses[0]?.label, "一㋐");
  assert.equal(definition.senses[0]?.depth, 2);
  assert.deepEqual(definition.senses[0]?.groupTags?.map(({ presentation: _presentation, ...chip }) => chip),
    [{ label: "Ichidan", code: "v1", category: "pos", scope: "group" }]);
  assert.deepEqual(definition.senses[0]?.tags.map(({ presentation: _presentation, ...chip }) => chip),
    [{ label: "Archaic", code: "arch", category: "misc", scope: "sense" }]);
});

test("API POS codes retain every scoped raw code behind display chips", () => {
  const source = {
    ...payload.entries[1]!,
    senses: [{
      position: 0,
      definitions: [{ lang: "en", text: "to open" }],
      tags: [
        { category: "partOfSpeech", code: "n", label: "Noun", scope: "entry" } as const,
        { category: "partOfSpeech", code: "v1", label: "Ichidan verb", scope: "group" } as const,
        { category: "partOfSpeech", code: "n", label: "Noun", scope: "sense" } as const,
        { category: "partOfSpeech", code: "v5k", label: "Godan verb", scope: "sense" } as const,
        { category: "partOfSpeech", code: "v5r", label: "Godan verb", scope: "sense" } as const,
      ],
    }],
  };

  const definition = toDefinition({ ...payload, entries: [source] }, "https://shirabe.org", ["eng"]);

  assert.deepEqual(definition.senses[0]?.partsOfSpeech.map((chip) => chip.label), ["Noun", "Godan verb", "Godan verb"]);
  assert.deepEqual(definition.senses[0]?.posCodes, ["n", "v1", "n", "v5k", "v5r"]);
});

test("full API relations preserve target readings and relation kinds", () => {
  const source = {
    ...payload.entries[1]!,
    senses: [{
      ...payload.entries[1]!.senses[0]!,
      related: [{ text: "開ける", reading: "あける" }],
      antonyms: [{ text: "閉じる", reading: "とじる" }],
      seeAlso: [{ text: "開放", reading: "かいほう" }],
    }],
  };
  const definition = toDefinition({ ...payload, entries: [source] }, "https://shirabe.org", ["eng"]);

  assert.deepEqual(definition.senses[0]?.xrefs, [
    { kind: "related", text: "開ける", reading: "あける" },
    { kind: "antonym", text: "閉じる", reading: "とじる" },
    { kind: "related", text: "開放", reading: "かいほう" },
  ]);
});

test("tags split into parts of speech and everything else, with codes kept", () => {
  const sense = built().senses[0]!;
  assert.deepEqual(sense.partsOfSpeech.map((c) => c.label), ["Godan verb"]);
  assert.deepEqual(sense.posCodes, ["v5k"]);
  assert.deepEqual(sense.tags.map((c) => c.label), ["Kana only"]);
});

test("source tags retain publisher metadata and headword association", () => {
  const sourceTag = { name: "arch", category: "register", notes: "publisher note", order: 2, score: -3 };
  const sourceHeadwords = [{ text: "開く", reading: "ひらく", tags: [sourceTag], rules: ["v5k"], score: 7 }];
  const sourcePayload = {
    ...payload,
    entries: payload.entries.map((entry, index) => index === 0
      ? { ...entry, senses: entry.senses.map((sense) => ({ ...sense, sourceTags: [sourceTag] })), sourceHeadwords }
      : entry),
  };
  const definition = toDefinition(sourcePayload, "https://shirabe.org", ["eng"]);

  assert.deepEqual(definition.senses[0]?.sourceTags, [sourceTag]);
  assert.deepEqual(definition.sourceHeadwordsByEntry, { "jmdict:1202650": sourceHeadwords });
});

test("mixed dictionary entries retain source headwords per originating entry", () => {
  const jmdictTag = { name: "arch", category: "register", notes: "JMdict note", order: 1, score: 2 };
  const daijirinTag = { name: "formal", category: "register", notes: "Daijirin note", order: 2, score: 3 };
  const sourcePayload = {
    ...payload,
    entries: payload.entries.map((entry, index) => ({
      ...entry,
      sourceHeadwords: [{ text: "開く", reading: index === 0 ? "ひらく" : "ヒラク", tags: [index === 0 ? jmdictTag : daijirinTag], rules: [], score: index },
        { text: "開く", reading: "あく", tags: [], rules: [], score: 9 }],
    })),
  };

  const definition = toDefinition(sourcePayload, "https://shirabe.org", ["eng"]);

  assert.deepEqual(definition.sourceHeadwordsByEntry, {
    "jmdict:1202650": sourcePayload.entries[0]!.sourceHeadwords,
    "daijirin:9": sourcePayload.entries[1]!.sourceHeadwords,
  });
});

test("other spellings are offered, the headword and reading are not repeated", () => {
  const forms = built().forms ?? [];
  assert.deepEqual(forms.map((f) => f.text), ["披く"]);
  assert.equal(forms[0]?.rare, true, "a rare-kanji writing tag reads as rare");
});

test("one translation per example, in the reader's first language", () => {
  assert.equal(built().examples[0]?.translation, "The flower blooms.");
  assert.equal(toDefinition(payload, "https://shirabe.org", ["spa"]).examples[0]?.translation, "La flor florece.");
});

test("a word the dictionary does not have is an answer in the body, not a status", async () => {
  // identify answers 200 with `words: [null]` for a token that resolves to
  // nothing: a name, a coinage, a typo the corpus kept. Reading that as a
  // failure would show "something went wrong" for an ordinary word.
  const host = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => new Response(JSON.stringify({ words: [null] }), { status: 200 }),
  });
  assert.deepEqual(await host.lookup("ヌルポ", "word"), { status: "found", definition: null, candidates: [] });
});

test("the reading and part of speech are sent, because a spelling alone is ambiguous", async () => {
  // 開いた read ヒライタ is ひらく and read アイタ is あく. Asked with the
  // spelling alone the server answers whichever writing is commonest, and is
  // confidently wrong: this is the whole reason identify replaced a lookup by id.
  let body: Record<string, unknown> = {};
  const host = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async (url, init) => {
      if ((url instanceof Request ? url.url : String(url)).includes("identify")) {
        body = JSON.parse(await (url instanceof Request ? url.clone().text() : String(init?.body)));
      }
      return new Response(JSON.stringify({ words: [{ candidates: [payload] }] }), { status: 200 });
    },
  });
  await host.lookup("開く", "word", { surface: "開いた", reading: "ヒライタ", pos: "verb" });
  assert.deepEqual((body.tokens as unknown[])[0], {
    lemma: "開く", surface: "開いた", reading: "ヒライタ", pos: "verb",
  });
  // And everything the card draws in one call, rather than a second fetch for
  // the pitch diagram that makes the card visibly rebuild itself.
  assert.deepEqual(body.include, ["pitch", "frequency", "furigana", "jlpt", "forms", "notes", "relations", "parts"]);
});

test("names remain available after ranked words and carry their classification", async () => {
  const word = { ...payload, headword: "一" };
  const name = { ...payload, headword: "ハジメ", name: true } as typeof payload & { name: boolean };

  const both = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => new Response(JSON.stringify({ words: [{ candidates: [word, name] }] }), { status: 200 }),
  });
  const chosen = await both.lookup("一", "word");
  assert.equal(chosen.status === "found" && chosen.definition?.headword, "一", "the word wins over the person");
  assert.equal(chosen.status === "found" && chosen.alternatives?.length, 2);
  assert.equal(chosen.status === "found" && chosen.alternatives?.[1]?.name, true);

  const onlyName = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => new Response(JSON.stringify({ words: [{ candidates: [name] }] }), { status: 200 }),
  });
  const fallback = await onlyName.lookup("ハジメ", "word");
  assert.equal(fallback.status === "found" && fallback.definition?.headword, "ハジメ",
    "with no word to compete, being a name IS the answer");
});

test("a server that is down is a failure the card can show, not a blank card", async () => {
  const host = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => new Response(JSON.stringify({ detail: "Service unavailable" }), { status: 503 }),
  });
  const result = await host.lookup("猫", "word");
  assert.equal(result.status, "failed");
  assert.match(result.status === "failed" ? result.message : "", /unavailable/i);
});

test("no token means no study port, so the card offers nothing it cannot do", () => {
  assert.equal(apiHost({ apiBase: "https://shirabe.org" }).study, undefined);
  assert.ok(apiHost({ apiBase: "https://shirabe.org", token: "shra_x" }).study);
  assert.ok(apiHost({ apiBase: "https://shirabe.org", authenticated: true, fetch }).study);
});

test("the key rides the Authorization header and the base never doubles its slash", async () => {
  const seen: Array<{ url: string; auth: string | null; language: string | null }> = [];
  const host = apiHost({
    apiBase: "https://shirabe.org/",
    token: "shra_x",
    fetch: async (url, init) => {
      const headers = url instanceof Request ? url.headers : new Headers(init?.headers);
      seen.push({ url: (url instanceof Request ? url.url : String(url)), auth: headers.get("Authorization"), language: headers.get("Accept-Language") });
      return new Response(JSON.stringify({ words: [{ candidates: [payload] }] }), { status: 200 });
    },
  });
  await host.lookup("猫", "word");
  assert.equal(seen[0]?.url, "https://shirabe.org/api/v1/words/identify");
  assert.equal(seen[0]?.auth, "Bearer shra_x");
  assert.equal(seen[0]?.language, "en");
});

test("a picked entry keeps its dictionary, source id and locale", async () => {
  const asked: Array<{ url: string; language: string | null; body: unknown }> = [];
  const host = apiHost({
    apiBase: "https://shirabe.org",
    languages: ["spa"],
    fetch: async (url, init) => {
      const request = url instanceof Request ? url : new Request(url, init);
      asked.push({ url: request.url, language: request.headers.get("Accept-Language"), body: JSON.parse(await request.clone().text()) });
      return new Response(JSON.stringify({ words: [{ candidates: [payload] }] }), { status: 200 });
    },
  });
  await host.lookupEntry("jmdict:1202650", "開く");
  await host.lookupEntry("jmnedict:1202650", "開く");
  assert.equal(asked.length, 2);
  assert.equal(new URL(asked[0]!.url).pathname, "/api/v1/words/identify");
  assert.equal(new URL(asked[1]!.url).pathname, "/api/v1/words/identify");
  assert.deepEqual(asked[0]!.body, asked[1]!.body);
  assert.equal(asked[0]!.language, "es");
});

test("each lookup carries its candidates even when the headword changes", async () => {
  const host = apiHost({ apiBase: "https://shirabe.org", fetch: async (_url, init) => {
    const request = _url instanceof Request ? _url : new Request(_url, init);
    const token = JSON.parse(await request.clone().text()).tokens[0];
    const candidates = token.reading === "あく" ? [payload, { ...payload, headword: "明く" }] : [payload];
    return new Response(JSON.stringify({ words: [{ candidates }] }), { status: 200 });
  } });
  const first = await host.lookup("ひらいた", "word", { reading: "あく" });
  const second = await host.lookup("ひらいた", "word", { reading: "ひらく" });
  assert.equal(first.status, "found");
  assert.equal(second.status, "found");
  assert.equal((first as { candidates?: unknown[] }).candidates?.length, 2);
  assert.equal((second as { candidates?: unknown[] }).candidates?.length, 1);
  assert.deepEqual(await host.lookup("ひらいた", "word", { reading: "あく" }), first);
});

test("the same word hovered twice costs one request", async () => {
  let calls = 0;
  const host = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => {
      calls += 1;
      return Response.json({ words: [{ candidates: [payload] }] });
    },
  });
  await host.lookup("開く", "word");
  await host.lookup("開く", "word");
  assert.equal(calls, 1);
});

test("long Anki review sessions retain at most 128 dictionary lookups", async () => {
  let requests = 0;
  const host = apiHost({ apiBase: "https://shirabe.org", fetch: async () => {
    requests++;
    return new Response(JSON.stringify({ words: [null] }));
  } });
  for (let i = 0; i < 129; i++) await host.lookup(`語${i}`, "word");
  await host.lookup("語128", "word");
  assert.equal(requests, 129);
  await host.lookup("語0", "word");
  assert.equal(requests, 130);
});

test("an answer is remembered; a server that failed is not", async () => {
  let calls = 0;
  const answered = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => { calls += 1; return new Response(JSON.stringify({ words: [null] }), { status: 200 }); },
  });
  await answered.lookup("ヌルポ", "word");
  await answered.lookup("ヌルポ", "word");
  assert.equal(calls, 1, "a word that is not in the dictionary will not start existing");

  let failures = 0;
  const down = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => { failures += 1; return new Response("{}", { status: 503 }); },
  });
  await down.lookup("猫", "word");
  await down.lookup("猫", "word");
  assert.equal(failures, 2, "but a server that was down may be back");
});

test("a raw-text scan cuts the text before identifying its first word", async () => {
  const asked: string[] = [];
  let identified: Record<string, unknown> = {};
  const host = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async (url, init) => {
      asked.push((url instanceof Request ? url.url : String(url)).replace("https://shirabe.org/api/v1", "").split("?")[0]!);
      if ((url instanceof Request ? url.url : String(url)).includes("/parse")) {
        return new Response(JSON.stringify({ stackFingerprint: "test", results: [{ tokens: [
          { surface: "猫", lemma: "猫", partOfSpeech: "noun", reading: "ネコ", startOffset: 0, endOffset: 1, kind: "word" },
          { surface: "が", lemma: "が", partOfSpeech: "prt", startOffset: 1, endOffset: 2, kind: "function" },
        ] }] }), { status: 200 });
      }
      const request = url instanceof Request ? url : new Request(url, init);
      identified = (JSON.parse(await request.clone().text()).tokens as Record<string, unknown>[])[0]!;
      return new Response(JSON.stringify({ words: [{ candidates: [payload] }] }), { status: 200 });
    },
  });

  // What a scan hands over: everything from the cursor to the end of the line.
  // Identifying that whole clause asks about something nobody pointed at.
  await host.lookup("猫が窓に静かに座る。", "text");

  assert.deepEqual(asked, ["/parse", "/words/identify"], "cut, then identify");
  assert.equal(identified.lemma, "猫", "and only the word under the cursor");
  assert.equal(identified.reading, "ネコ", "carrying how the sentence read it");
});

test("a scan over text the parser finds no word in is a miss, not an error", async () => {
  const host = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async () => new Response(JSON.stringify({ stackFingerprint: "test", results: [{ tokens: [] }] }), { status: 200 }),
  });
  assert.deepEqual(await host.lookup("!!!", "text"), { status: "found", definition: null });
});

test("a word hover never parses: the span was already cut", async () => {
  const asked: string[] = [];
  const host = apiHost({
    apiBase: "https://shirabe.org",
    fetch: async (url) => {
      asked.push((url instanceof Request ? url.url : String(url)).replace("https://shirabe.org/api/v1", "").split("?")[0]!);
      return new Response(JSON.stringify({ words: [{ candidates: [payload] }] }), { status: 200 });
    },
  });
  await host.lookup("猫", "word", { reading: "ネコ", pos: "noun" });
  assert.deepEqual(asked, ["/words/identify"], "one call for a word that is already a word");
});



// The shape the server actually sends. `POST /srs/states/lookup` answers a LIST
// of `{lemma, state, decks}`, not an object keyed by lemma, and reading it as
// one keys every word by its array index instead: the card then looks up 猫,
// finds nothing, and paints no state at all.
test("what the reader knows is keyed by the word, not by its position in the reply", async () => {
  const fetch = (async () => new Response(JSON.stringify({
    states: [
      { lemma: "猫", state: "learning", cardId: 7, decks: [] },
      { lemma: "座る", state: "none", decks: [] },
    ],
  }), { status: 200 })) as typeof globalThis.fetch;

  const host = apiHost({ apiBase: "https://shirabe.org", token: "shra_live", fetch });
  const states = await host.study!.states(["猫", "座る"]);

  assert.equal(states!["猫"]?.state, "learning");
  assert.equal(states!["猫"]?.cardId, 7);
  assert.equal(states!["座る"]?.state, "none");
});

// A card in Anki reviewed by somebody who has not signed in yet. `attach` cuts
// the note's Japanese on every render, and Anki re-renders on every flip, so a
// request that is certain to be refused goes out roughly twice per card. The
// server allows 30 unauthenticated requests a minute per IP
// (`BearerAuthentication::UNAUTHENTICATED_LIMIT`), and past that it answers 429:
// the reader stops seeing "Sign in to look this word up" and starts seeing "Too
// many unauthenticated API requests", which is our own budget spent telling
// them nothing they can act on.
//
// `link` is the right to sign in, not the fact of having done so.
test("a signed-out host asks for nothing it already knows will be refused", async () => {
  let calls = 0;
  const never = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ detail: "Bearer token required." }), { status: 401 });
  }) as unknown as typeof globalThis.fetch;

  const link = createLink({
    apiBase: "https://shirabe.org",
    clientId: "shirabe-anki-card",
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage,
    fetch: never,
  });
  const host = apiHost({ apiBase: "https://shirabe.org", link, fetch: never });

  assert.equal(link.linked(), false, "nothing stored, so no request can carry a token");

  // It REFUSES rather than answering an empty list: `wrapWords` catches that
  // and wraps nothing, while `lookup` needs it to tell "cannot cut without an
  // account" apart from "this text holds no words".
  for (let card = 0; card < 10; card++) {
    await assert.rejects(host.tokenize!(`猫が窓に座る${card}。`), /sign in/i);
  }
  assert.equal(calls, 0, "and it knows that without asking the server");

  const result = await host.lookup("猫", "word");
  assert.equal(result.status, "pending", "the reader is offered the sign-in rather than an error");
  assert.equal(calls, 0, "and that offer costs no request either");
});

// The other half, and the one that makes the guard above safe: holding back
// while signed out must not outlive being signed out. The card keeps one host
// for the life of the page and the reader signs in part way through it, so this
// is read per request rather than decided when the host was built.
test("and it starts asking the moment the reader signs in", async () => {
  let calls = 0;
  let signedIn = false;

  const answer = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ stackFingerprint: "test", results: [{ tokens: [
      { surface: "猫", startOffset: 0, endOffset: 1, lemma: "猫", kind: "word" },
    ] }] }), { status: 200 });
  }) as unknown as typeof globalThis.fetch;

  const link: Link = {
    fetch: answer,
    linked: () => signedIn,
    signIn: async () => { signedIn = true; },
    signOut: () => { signedIn = false; },
  };
  const host = apiHost({ apiBase: "https://shirabe.org", link });

  await assert.rejects(host.tokenize!("猫が"), "signed out: nothing asked");
  assert.equal(calls, 0);

  await link.signIn(() => {});
  const tokens = await host.tokenize!("猫が");
  assert.equal(tokens[0]?.surface, "猫", "signed in: the same host cuts the text");
  assert.equal(calls, 1, "so the guard is read per request, not decided when the host was built");
});

// The bug a reader hit on a phone: signed out, tapping a sentence answered
// "No entry for 「うやら幸運の女神は…」": the whole window, blamed on the text.
//
// Two separate things were wrong and only the second is this test's business:
// the scan starts mid-word (that is what wrapping fixes), and cutting it could
// not be done at all without an account. A host that cannot cut must say so,
// because `lookup` turns that into the sign-in offer, while "no tokens" is a
// statement about the text and ends as "no entry".
test("signed out, a raw-text scan offers the sign-in rather than blaming the sentence", async () => {
  let calls = 0;
  const never = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ detail: "Bearer token required." }), { status: 401 });
  }) as unknown as typeof globalThis.fetch;

  const link: Link = {
    fetch: never, linked: () => false,
    signIn: async () => {}, signOut: () => {},
  };
  const host = apiHost({ apiBase: "https://shirabe.org", link });

  const result = await host.lookup("うやら幸運の女神は私にほほ笑んでいるようですね", "text");

  assert.equal(result.status, "pending", "the reader is offered the account the cut needs");
  assert.equal(calls, 0, "and still without spending the anonymous budget");
});

test("contextual scans identify the complete word at every UTF-16 pointer position", async () => {
  const text = "😀欲しいって言った。";
  let parses = 0;
  const host = apiHost({ apiBase: "https://shirabe.org", token: "test", fetch: async (input, init) => {
    const request = new Request(input, init);
    const body = await request.json();
    if (request.url.endsWith("/parse")) {
      parses++;
      assert.deepEqual(body.texts, [text]);
      return Response.json({ stackFingerprint: "test", results: [{ tokens: [
        { surface: "😀", startOffset: 0, endOffset: 2, kind: "symbol" },
        { surface: "欲しい", lemma: "欲しい", startOffset: 2, endOffset: 5, reading: "ホシイ", partOfSpeech: "adj", kind: "word" },
        { surface: "って", lemma: "って", startOffset: 5, endOffset: 7, kind: "function" },
        { surface: "言った", lemma: "言う", startOffset: 7, endOffset: 10, kind: "inflected" },
        { surface: "。", startOffset: 10, endOffset: 11, kind: "symbol" },
      ] }] });
    }
    assert.equal(body.tokens[0].surface, "欲しい");
    assert.equal(body.tokens[0].lemma, "欲しい");
    return Response.json({ words: [{ candidates: [payload] }] });
  } });
  for (let offset = 2; offset < 5; offset++) {
    const result = await host.lookup(text.slice(offset), "text", { text, startOffset: offset });
    assert.equal(result.status, "found", `pointer ${offset}`);
    if (result.status === "found") {
      assert.equal(result.definition?.sourceForm, "欲しい");
      assert.equal(result.scanStart, 2);
    }
  }
  assert.equal(parses, 1, "the sentence parse is shared across pointer positions");
});

test("contextual pointer offsets remain absolute when the parse window starts mid-sentence", async () => {
  const text = `${"猫".repeat(70)}食べちゃったって言った。`;
  for (let offset = 70; offset < 76; offset++) {
    const origin = offset - 64;
    const start = 70 - origin;
    const host = apiHost({ apiBase: "https://shirabe.org", token: "test", fetch: async (input, init) => {
      const request = new Request(input, init);
      const body = await request.json();
      if (request.url.endsWith("/parse")) {
        assert.deepEqual(body.texts, [text.slice(origin)]);
        return Response.json({ stackFingerprint: "test", results: [{ tokens: [
          { surface: text.slice(origin, 70), lemma: "猫", startOffset: 0, endOffset: start, kind: "word" },
          { surface: "食べちゃった", lemma: "食べる", startOffset: start, endOffset: start + 6, kind: "inflected", partOfSpeech: "verb" },
        ] }] });
      }
      assert.equal(body.tokens[0].surface, "食べちゃった");
      assert.equal(body.tokens[0].lemma, "食べる");
      return Response.json({ words: [{ candidates: [payload] }] });
    } });
    const found = await host.lookup(text.slice(offset), "text", { text, startOffset: offset });
    assert.equal(found.status, "found");
    if (found.status === "found") {
      assert.equal(found.scanStart, 70);
      assert.equal(found.definition?.sourceForm, "食べちゃった");
    }
  }
});
