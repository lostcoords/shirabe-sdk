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
