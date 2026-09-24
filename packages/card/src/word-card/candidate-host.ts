import { candidateToDefinition, type IdentifiedCandidate } from "./api-host.js";
import { applyDictionaryReveal } from "./dictionary-reveal.js";
import type { CardEvent, LookupContext, LookupResult, WordCardHost } from "./host.js";
import type { GlossLanguage } from "./languages.js";
import type { TagDisplayLocale } from "./legend.js";
import type { Definition } from "./types.js";
import type { ApiSense } from "./api-types.js";

export type CandidateQuery = LookupContext & { lemma: string; surface: string };
export type CandidateAnswer = {
  candidates: IdentifiedCandidate[];
  reason?: "missing" | "failed";
};

export type CandidateHostOptions = {
  site: string;
  languages(): readonly GlossLanguage[];
  displayLocale(): TagDisplayLocale;
  lookupCandidates(query: CandidateQuery, locale: TagDisplayLocale): Promise<CandidateAnswer>;
  dictionaryReveal?(): Readonly<Record<string, "show" | "hover">>;
  filterDefinitions?(definitions: ApiSense["definitions"], dictionary: string): ApiSense["definitions"];
  hiddenGlossLanguages?(): readonly GlossLanguage[];
  wordUrl?(candidate: IdentifiedCandidate, locale: TagDisplayLocale): string;
  onDefinition?(definition: Definition | null): void;
  report?(event: CardEvent, detail?: Record<string, string | number | boolean>): void;
  lookupLinks?(definition: Definition | null, word: HTMLElement): Array<{ id: string; label: string; url: string }>;
  openHeadword?(definition: Definition, spelling: string): void;
};

/** Adapt an existing identify transport to the shared card without owning credentials or caching. */
export function candidateHost(options: CandidateHostOptions): WordCardHost {
  const site = options.site.replace(/\/$/, "");
  let latest: IdentifiedCandidate[] = [];

  function found(candidate: IdentifiedCandidate, all: IdentifiedCandidate[], surface: string): LookupResult {
    latest = all;
    const hiddenGlossLanguages = options.hiddenGlossLanguages?.() ?? [];
    const alternatives = all.map((item) => {
      const mapped = candidateToDefinition(item, site, options.languages(), {
        displayLocale: options.displayLocale(),
        filterDefinitions: options.filterDefinitions,
      });
      return applyDictionaryReveal({
        ...mapped,
        entry: item.id,
        ...(options.wordUrl ? { url: options.wordUrl(item, options.displayLocale()) } : {}),
        sourceForm: surface !== mapped.headword ? surface : undefined,
        baseForm: mapped.headword,
        baseReading: mapped.reading ?? undefined,
        ...(hiddenGlossLanguages.length ? { hiddenGlossLanguages: [...hiddenGlossLanguages] } : {}),
      }, options.dictionaryReveal?.() ?? {});
    });
    const definition = alternatives.find((item) => item.entry === candidate.id) ?? null;
    return { status: "found", definition, alternatives };
  }

  async function ask(query: CandidateQuery, selectedEntry?: string): Promise<LookupResult> {
    const answer = await options.lookupCandidates(query, options.displayLocale());
    if (answer.reason === "failed") {
      return { status: "failed", message: "Could not load definitions. Please try again later." };
    }
    const selected = selectedEntry
      ? answer.candidates.find((candidate) => candidate.id === selectedEntry)
      : answer.candidates[0];
    if (!selected) {
      return { status: "found", definition: null };
    }
    return found(selected, answer.candidates, query.surface);
  }

  return {
    lookup(query, kind, context) {
      if (kind === "kanji") return Promise.resolve({ status: "failed", message: "Kanji lookup is not available in this preview." });
      return ask({ lemma: query, surface: context?.surface ?? query, ...context });
    },
    lookupEntry(entry, surface) {
      const cached = latest.find((candidate) => candidate.id === entry);
      return cached ? Promise.resolve(found(cached, latest, surface)) : ask({ lemma: surface, surface }, entry);
    },
    async prefetch(query, kind, context) {
      if (kind !== "kanji") await options.lookupCandidates(
        { lemma: query, surface: context?.surface ?? query, ...context }, options.displayLocale());
    },
    kanjiUrl(character) {
      return `${site}/${options.displayLocale()}/kanji/${encodeURIComponent(character)}`;
    },
    onVisibleDefinition(definition) {
      options.onDefinition?.(definition);
    },
    onDefinitionRendered(definition) {
      options.onDefinition?.(definition);
    },
    lookupLinks: options.lookupLinks,
    openHeadword: options.openHeadword,
    report: options.report,
  };
}
