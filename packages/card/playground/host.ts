import type { Definition } from "../src/word-card/types.js";
import type { LookupResult, WordCardHost } from "../src/word-card/host.js";
import { SENTENCES, WORDS } from "./corpus.js";

// A host with nothing behind it: no extension, no pack, no account, no network.
// It is the whole point of the playground. If the card renders here it renders
// anywhere, and a change that breaks this file has broken the contract.
export function playgroundHost(log: (line: string) => void): WordCardHost {
  const find = (query: string): Definition | null =>
    WORDS[query] ?? Object.values(WORDS).find((d) => d.headword === query) ?? null;

  return {
    async lookup(query, kind): Promise<LookupResult> {
      log(`lookup(${JSON.stringify(query)}, ${kind})`);
      await new Promise((r) => setTimeout(r, 120)); // a real host is never instant
      const definition = find(query);
      return { status: "found", definition };
    },
    async lookupEntry(entry, surface): Promise<LookupResult> {
      log(`lookupEntry(${entry}, ${surface})`);
      return { status: "found", definition: Object.values(WORDS).find((d) => d.entry === entry) ?? null };
    },
    study: {
      async states(lemmas) {
        log(`states(${lemmas.join(", ")})`);
        return Object.fromEntries(lemmas.map((l) => [l, { state: stateOf(l), decks: [] }]));
      },
      async urlForWord() { return "https://shirabe.org/en/study/cards"; },
      apply(word, details) { word.dataset.state = details.state; },
      async save(word) {
        log(`save(${word.dataset.lemma})`);
        saved.add(word.dataset.lemma ?? "");
        return { ok: true, message: "Saved" };
      },
      async markKnown(word) {
        log(`markKnown(${word.dataset.lemma})`);
        known.add(word.dataset.lemma ?? "");
        return { ok: true, message: "Marked known" };
      },
    },
    notify: (message, ok) => log(`${ok ? "notify" : "error"}: ${message}`),
    onStudyChanged: () => log("onStudyChanged()"),
    async pricingUrl(source) { return `https://shirabe.org/pricing?source=${source}`; },
  };
}

const saved = new Set<string>();
const known = new Set<string>();
const stateOf = (lemma: string) => known.has(lemma) ? "retired" as const : saved.has(lemma) ? "learning" as const : "none" as const;

export { SENTENCES };
