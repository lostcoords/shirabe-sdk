import assert from "node:assert/strict";
import test from "node:test";
import { candidateHost } from "../src/word-card/candidate-host.js";
import type { IdentifiedCandidate } from "../src/word-card/api-host.js";

const candidates = [
  { id: "word:1", headword: "今日", reading: "きょう", entries: [], parts: [
    { text: "今", lemma: "今", id: "word:now" },
    { text: "日", lemma: "日", id: "word:day" },
  ] },
  { id: "word:2", headword: "京", reading: "きょう", entries: [] },
] as IdentifiedCandidate[];

test("a candidate transport retains ranked matches and follows the visible definition", async () => {
  const selected: string[] = [];
  const asked: unknown[] = [];
  const host = candidateHost({
    site: "https://dictionary.test",
    languages: () => ["eng"],
    displayLocale: () => "en",
    lookupCandidates: async (query) => { asked.push(query); return { candidates }; },
    onDefinition: (definition) => { selected.push(definition?.headword ?? ""); },
  });
  const result = await host.lookup("今日", "word", { surface: "今日", text: "今日は", startOffset: 0, endOffset: 2 });
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.deepEqual(result.alternatives?.map((definition) => definition.headword), ["今日", "京"]);
  assert.deepEqual(result.definition?.parts?.map((part) => part.text), ["今", "日"]);
  assert.deepEqual(selected, []);
  host.onDefinitionRendered?.(result.definition);
  host.onVisibleDefinition?.(result.alternatives![1]!);
  assert.deepEqual(selected, ["今日", "京"]);
  assert.deepEqual(asked, [{ lemma: "今日", surface: "今日", text: "今日は", startOffset: 0, endOffset: 2 }]);
  const second = await host.lookupEntry("word:2", "今日");
  assert.equal(second.status, "found");
  if (second.status === "found") assert.equal(second.definition?.headword, "京");
  assert.equal(asked.length, 1);
});

const ranked = [
  { id: "開く-あく", dictionary: "jmdict", sourceId: "1586270", headword: "開く", reading: "あく", entries: [] },
  { id: "開く-ひらく", dictionary: "jmdict", sourceId: "1202650", headword: "開く", reading: "ひらく", entries: [] },
] as unknown as IdentifiedCandidate[];

function rankedHost(asked: unknown[]) {
  return candidateHost({
    site: "https://dictionary.test",
    languages: () => ["eng"],
    displayLocale: () => "en",
    lookupCandidates: async (query) => { asked.push(query); return { candidates: ranked }; },
  });
}

test("an entry lookup asks with the token and opens the candidate the parse named", async () => {
  const asked: unknown[] = [];
  const result = await rankedHost(asked).lookupEntry("開く-ひらく", "開いた", undefined,
    { lemma: "開く", surface: "開いた", reading: "ヒライタ", pos: "verb" });
  assert.deepEqual(asked, [{ lemma: "開く", surface: "開いた", reading: "ヒライタ", pos: "verb" }]);
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.definition?.reading, "ひらく");
  // What the card writes back to `data-entry`, and what a save links by.
  assert.equal(result.definition?.entry, "jmdict:1202650");
});

test("an entry renamed since the page stored it opens the top-ranked candidate", async () => {
  const result = await rankedHost([]).lookupEntry("窓-まど-1", "窓", undefined, { lemma: "窓", surface: "窓" });
  assert.equal(result.status, "found");
  if (result.status === "found") assert.equal(result.definition?.reading, "あく");
});

test("a rendered entry handle opens the same candidate again", async () => {
  const asked: unknown[] = [];
  const result = await rankedHost(asked).lookupEntry("jmdict:1202650", "開く", undefined, { lemma: "開く", surface: "開く" });
  assert.equal(result.status, "found");
  if (result.status === "found") assert.equal(result.definition?.reading, "ひらく");
});

const tagged = [{
  id: "開く-ひらく", dictionary: "jmdict", sourceId: "1202650", headword: "開く", reading: "ひらく",
  entries: [{ dictionary: "jmdict", sourceId: "1202650", type: "definition", senses: [{
    position: 0,
    definitions: [{ lang: "en", text: "to open" }, { lang: "es", text: "abrir" }],
    usages: [{ lang: "en", text: "of a door" }, { lang: "es", text: "de una puerta" }],
    tags: [{ category: "partOfSpeech", code: "v5k", label: "Godan verb", scope: "sense" }],
  }] }],
}] as unknown as IdentifiedCandidate[];

test("a host's tag labels and presentations reach candidate definitions", async () => {
  const host = candidateHost({
    site: "https://dictionary.test",
    languages: () => ["eng"],
    displayLocale: () => "en",
    lookupCandidates: async () => ({ candidates: tagged }),
    labelForTag: (tag, label) => tag.code === "v5k" ? "Godan (de)" : label,
    presentationForTag: (_tag, defaults) => ({ ...defaults, explanation: "Ein Godan-Verb." }),
  });
  const result = await host.lookup("開く", "word", { surface: "開く" });
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  const chip = result.definition?.senses[0]?.partsOfSpeech[0];
  assert.equal(chip?.label, "Godan (de)");
  assert.equal(chip?.presentation?.explanation, "Ein Godan-Verb.");
});

test("a host's definition filter applies to usage notes too", async () => {
  const host = candidateHost({
    site: "https://dictionary.test",
    languages: () => ["eng", "spa"],
    displayLocale: () => "en",
    lookupCandidates: async () => ({ candidates: tagged }),
    filterDefinitions: (definitions) => definitions.filter((definition) => definition.lang !== "es"),
  });
  const result = await host.lookup("開く", "word", { surface: "開く" });
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.deepEqual(result.definition?.senses[0]?.glosses.map((row) => row.text), ["to open"]);
  assert.deepEqual(result.definition?.senses[0]?.usages?.map((row) => row.text), ["of a door"]);
});
