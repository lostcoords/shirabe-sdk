import type { AuthoringExample, ExampleSearch, ExampleSearchQuery, ExampleSearchResult } from "./host.js";
import type { GlossLanguage } from "./types.js";
import { uiLanguagesFrom } from "./languages.js";
import type { ListSentencesData, ListSentencesResponse } from "@shirabe-org/api";

export function apiExampleSearch(
  request: (path: string, init?: RequestInit) => Promise<unknown>,
  languages: readonly GlossLanguage[] = ["eng"],
): ExampleSearch {
  return async (query, signal) => {
    const surface = query.query.trim();
    if (!surface || [...surface].length > 64) throw new Error("Use a search term between 1 and 64 characters.");
    if (query.maxLength !== undefined && (!Number.isSafeInteger(query.maxLength) || query.maxLength < 1)) {
      throw new Error("Maximum characters must be a positive whole number.");
    }
    const language = query.translationLanguage ?? uiLanguagesFrom(languages).find((code) => code !== "ja") ?? "en";
    let cursor = query.cursor;
    const visited = new Set<string>();
    let result: ExampleSearchResult = { examples: [], hasMore: false, cursor: null };
    for (let pages = 0; pages < 3; pages += 1) {
      signal?.throwIfAborted();
      if (visited.has(cursor ?? "")) throw new Error("The example search returned a repeated cursor. Try again.");
      visited.add(cursor ?? "");
      const apiQuery = {
        query: surface,
        take: 50,
        ...(query.entry ? { entry: query.entry } : {}),
        ...(cursor ? { cursor } : {}),
      } satisfies ListSentencesData["query"];
      const params = new URLSearchParams(Object.entries(apiQuery).map(([key, value]) => [key, String(value)]));
      const payload = await request(`/sentences?${params}`, { signal }) as ListSentencesResponse;
      signal?.throwIfAborted();
      const page = sentencePage(payload);
      const examples = page.sentences.map((sentence): AuthoringExample => {
        const translation = sentence.translations.find((translation) => translation.lang === language && translation.text.trim());
        return {
          japanese: sentence.japanese,
          translation: translation?.text ?? null,
          source: sentence.source || (sentence.id.startsWith("tatoeba:") ? "Tatoeba" : sentence.id.split(":")[0]),
          reference: sentence.id,
          ...(translation ? { translationLanguage: translation.lang } : {}),
        };
      }).filter((example) => matchesExample(example, query));
      result = { examples, ...page.pagination };
      if (examples.length || !page.pagination.hasMore) break;
      cursor = page.pagination.cursor!;
    }
    return result;
  };
}

export function matchesExample(example: AuthoringExample, query: Pick<ExampleSearchQuery, "keyword" | "maxLength" | "translation">): boolean {
  return `${example.japanese}\n${example.translation ?? ""}`.toLocaleLowerCase().includes((query.keyword ?? "").trim().toLocaleLowerCase())
    && (!query.maxLength || [...example.japanese].length <= query.maxLength)
    && (query.translation !== "with" || !!example.translation)
    && (query.translation !== "without" || !example.translation);
}

function sentencePage(value: unknown): ListSentencesResponse {
  const page = value as Partial<ListSentencesResponse> | null;
  if (!page || !Array.isArray(page.sentences) || page.sentences.length > 50 || !page.pagination
    || typeof page.pagination.hasMore !== "boolean"
    || !(page.pagination.cursor === null || typeof page.pagination.cursor === "string")
    || (page.pagination.hasMore && !page.pagination.cursor)
    || page.sentences.some((sentence) => !sentence || typeof sentence.id !== "string" || !sentence.id.includes(":")
      || typeof sentence.japanese !== "string" || !sentence.japanese.trim()
      || (sentence.source !== undefined && typeof sentence.source !== "string")
      || !Array.isArray(sentence.translations) || sentence.translations.some((translation) => !translation
        || typeof translation.lang !== "string" || typeof translation.text !== "string"))) {
    throw new Error("The example search returned an invalid response. Try again.");
  }
  return page as ListSentencesResponse;
}
