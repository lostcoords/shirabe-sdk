import assert from "node:assert/strict";
import test from "node:test";
import { apiHost } from "../src/word-card/api-host.js";
import { apiExampleSearch } from "../src/word-card/api-example-search.js";

const rice = {
  id: "tatoeba:7", japanese: "ご飯を食べた。",
  translations: [{ lang: "en", text: "I ate rice." }, { lang: "es", text: "Comí arroz." }],
  source: { dictionary: "tatoeba", name: "Tatoeba", sourceId: "7" }, matches: [],
};
const page = (sentences: unknown[] = [rice], cursor: string | null = null) => ({
  query: "食べる", sentences, pagination: { hasMore: !!cursor, cursor },
});

test("corpus search uses the authenticated GET endpoint and carries exact Spanish attribution", async () => {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const host = apiHost({
    apiBase: "https://dictionary.test", token: "test-token", languages: ["spa"],
    fetch: async (url, init) => {
      calls.push({ url: new URL(String(url)), init });
      return Response.json(page([rice, { ...rice, id: "uploaded:42", source: { dictionary: "uploaded", name: "My dictionary", sourceId: "42" }, translations: [] }]));
    },
  });
  const controller = new AbortController();
  const result = await host.exampleSearch!({ query: " 食べる ", keyword: "", maxLength: 8, translation: "any" }, controller.signal);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/api/v1/sentences");
  assert.deepEqual([...calls[0].url.searchParams], [["query", "食べる"], ["limit", "50"], ["filter[translationLanguages][]", "es"]]);
  assert.equal(calls[0].init?.method ?? "GET", "GET");
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer test-token");
  assert.equal(new Headers(calls[0].init?.headers).get("Accept-Language"), "es");
  assert.equal(calls[0].init?.signal, controller.signal);
  assert.deepEqual(result, {
    examples: [
      { japanese: rice.japanese, translation: "Comí arroz.", source: "Tatoeba", reference: "tatoeba:7", translationLanguage: "es" },
      { japanese: rice.japanese, translation: null, source: "My dictionary", reference: "uploaded:42" },
    ], cursor: null, hasMore: false,
  });
});

test("filters walk corpus pages and preserve opaque cursors for More examples", async () => {
  const cursors: (string | null)[] = [];
  const search = apiExampleSearch(async (path) => {
    const cursor = new URL(path, "https://dictionary.test").searchParams.get("cursor");
    cursors.push(cursor);
    if (!cursor) return page([{ ...rice, japanese: "とても長い文でご飯を食べた。" }], "next/+==");
    if (cursor === "next/+==") return page([rice], "last:2");
    return page([{ ...rice, id: "tatoeba:8" }]);
  });
  const query = { query: "食べる", keyword: "ARROZ", maxLength: 7, translationLanguage: "es", translation: "with" as const };
  const first = await search(query);
  assert.equal(first.examples.length, 1);
  assert.equal(first.cursor, "last:2");
  assert.equal(first.hasMore, true);
  const next = await search({ ...query, cursor: first.cursor! });
  assert.equal(next.examples[0].reference, "tatoeba:8");
  assert.equal(next.hasMore, false);
  assert.deepEqual(cursors, [null, "next/+==", "last:2"]);
});

test("chosen word identity survives filtered pagination without broadening to a homograph", async () => {
  const calls: URL[] = [];
  const search = apiExampleSearch(async (path) => {
    calls.push(new URL(path, "https://dictionary.test"));
    return calls.length === 1 ? page([], "next/+==") : page([rice]);
  });
  await search({ query: "開いた", wordId: "開く-ひらく", translationLanguage: "es" });
  assert.equal(calls.length, 2);
  for (const url of calls) {
    assert.equal(url.searchParams.get("filter[wordId]"), "開く-ひらく");
    assert.equal(url.searchParams.get("query"), "開いた");
  }
});

test("a missing requested language never borrows English, including translation-presence filters", async () => {
  const search = apiExampleSearch(async () => page());
  const without = await search({ query: "食べる", translationLanguage: "fr", translation: "without" });
  assert.deepEqual(without.examples, [{ japanese: rice.japanese, translation: null, source: "Tatoeba", reference: "tatoeba:7" }]);
  const withTranslation = await search({ query: "食べる", translationLanguage: "fr", translation: "with" });
  assert.deepEqual(withTranslation.examples, []);
  assert.equal(withTranslation.hasMore, false);
});

test("Unicode length counts characters, source strings remain plain data and malformed pages fail", async () => {
  const search = apiExampleSearch(async () => page([{ ...rice, id: "uploaded:9", source: { dictionary: "uploaded", name: "<script>source</script>", sourceId: "9" }, japanese: "𠮟る。" }]));
  const result = await search({ query: "𠮟る", maxLength: 3 });
  assert.equal(result.examples.length, 1);
  assert.equal(result.examples[0].source, "<script>source</script>");
  for (const malformed of [null, {}, page([null]), page([{ ...rice, translations: null }]),
    { ...page(), pagination: { hasMore: true, cursor: null } }]) {
    await assert.rejects(apiExampleSearch(async () => malformed)({ query: "食べる" }), /invalid response/);
  }
});

test("aborting filtered pagination stops the next request and network failure is not a synthetic empty result", async () => {
  const controller = new AbortController();
  let calls = 0;
  const search = apiExampleSearch(async (_path, init) => {
    calls += 1;
    assert.equal(init?.signal, controller.signal);
    controller.abort();
    return page([], "next");
  });
  await assert.rejects(search({ query: "食べる" }, controller.signal), { name: "AbortError" });
  await assert.rejects(search({ query: "食べる" }, controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
  await assert.rejects(apiExampleSearch(async () => { throw new Error("Offline"); })({ query: "食べる" }), /Offline/);
});

test("repeated cursors and invalid query limits fail without an unbounded request loop", async () => {
  let calls = 0;
  const search = apiExampleSearch(async () => { calls += 1; return page([], "same"); });
  await assert.rejects(search({ query: "食べる" }), /repeated cursor/);
  assert.equal(calls, 2);
  for (const query of [{ query: " " }, { query: "長".repeat(65) }, { query: "食べる", maxLength: -1 }, { query: "食べる", maxLength: 2.5 }]) {
    await assert.rejects(search(query));
  }
  assert.equal(calls, 2);
});

test("a filtered-out corpus is bounded to three pages per explicit Search or More action", async () => {
  const cursors: (string | null)[] = [];
  const search = apiExampleSearch(async (path) => {
    const cursor = new URL(path, "https://dictionary.test").searchParams.get("cursor");
    cursors.push(cursor);
    const offset = Number(cursor ?? 0);
    return page([rice], offset < 8 ? String(offset + 1) : null);
  });
  const query = { query: "食べる", keyword: "no matching sentence" };
  const first = await search(query);
  assert.equal(cursors.length, 3);
  assert.deepEqual(first, { examples: [], hasMore: true, cursor: "3" });
  const more = await search({ ...query, cursor: first.cursor! });
  assert.deepEqual(cursors, [null, "1", "2", "3", "4", "5"]);
  assert.deepEqual(more, { examples: [], hasMore: true, cursor: "6" });
});
