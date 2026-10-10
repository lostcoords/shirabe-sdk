import { apiHost } from "./api-host.js";
import { createCardApiClient } from "./api-client.js";
import { glossLanguagesFrom } from "./languages.js";
import { applyDictionaryReveal } from "./dictionary-reveal.js";
import type { Link } from "./link.js";
import type { LookupResult, WordCardHost } from "./host.js";
import { getDictionaryStack } from "@shirabe-org/api";

type Preferences = { languages: string[]; dictionaryReveal: Record<string, "show" | "hover"> };

class ConnectionRequired extends Error {}

/** A read-only Anki dictionary host that applies the account's saved preferences. */
export function createAnkiHost(options: { apiBase: string; link: Link; now?: () => number }): WordCardHost {
  const now = options.now ?? Date.now;
  const base = options.apiBase.replace(/\/$/, "");
  const client = createCardApiClient({ apiBase: base, fetch: options.link.fetch });
  const fallback = apiHost(options);
  let cached: { host: WordCardHost; preferences: Preferences; expires: number } | undefined;
  let loading: Promise<NonNullable<typeof cached>> | undefined;
  let reconnect = false;
  let revision = 0;

  async function current(): Promise<NonNullable<typeof cached>> {
    if (!options.link.linked()) {
      cached = undefined;
      throw new ConnectionRequired("Sign in to use your Shirabe dictionaries.");
    }
    if (cached && cached.expires > now()) return cached;
    if (loading) return loading;
    const requested = revision;
    loading = (async () => {
      // The stack is both the data we need and proof of its own permission.
      // Fetching `/me` just to inspect an identity scope made a generic card
      // request unrelated data, and required an extra OAuth permission.
      const result = await getDictionaryStack({ client });
      const status = result.response?.status;
      if ([401, 403].includes(status ?? 0)) {
        reconnect = true;
        throw new ConnectionRequired("Reconnect to use your dictionary preferences and uploaded dictionaries.");
      }
      if (result.error || !result.data) throw new Error("Couldn't load your dictionary settings. Try again.");
      const stack = result.data.dictionaryStack;
      if (!stack) {
        reconnect = true;
        throw new ConnectionRequired("Reconnect to use your dictionary preferences and uploaded dictionaries.");
      }
      if (revision !== requested || !options.link.linked()) throw new ConnectionRequired("Sign in again to continue.");
      const preferences: Preferences = {
        languages: stack.sources.flatMap((source) => source.languages),
        dictionaryReveal: Object.fromEntries(stack.sources.map((source) => [source.dictionary, source.reveal])),
      };
      const languages = glossLanguagesFrom(preferences.languages);
      cached = { host: apiHost({ ...options, languages: languages.length ? languages : ["eng"] }), preferences, expires: now() + 60_000 };
      return cached;
    })();
    try {
      return await loading;
    } finally {
      loading = undefined;
    }
  }

  function failure(error: unknown): LookupResult {
    return {
      status: error instanceof ConnectionRequired ? "pending" : "failed",
      message: error instanceof Error ? error.message : "Couldn't look up this word. Try again.",
    };
  }

  async function withSession<T>(read: (value: NonNullable<typeof cached>) => Promise<T>): Promise<T> {
    const requested = revision;
    const value = await read(await current());
    if (revision !== requested || !options.link.linked()) throw new ConnectionRequired("Sign in again to continue.");
    return value;
  }

  function signOut(): void {
    revision++;
    cached = undefined;
    loading = undefined;
    reconnect = false;
    options.link.signOut();
  }

  function reveal(result: LookupResult, preferences: Preferences): LookupResult {
    if (result.status !== "found" || !result.definition) return result;
    return { ...result, definition: applyDictionaryReveal(result.definition, preferences.dictionaryReveal) };
  }

  return {
    async lookup(query, kind, context) {
      try {
        return await withSession(async ({ host, preferences }) => reveal(await host.lookup(query, kind, context), preferences));
      } catch (error) { return failure(error); }
    },
    async lookupEntry(entry, surface) {
      try {
        return await withSession(async ({ host, preferences }) => reveal(await host.lookupEntry(entry, surface), preferences));
      } catch (error) { return failure(error); }
    },
    async tokenize(text) {
      return withSession(({ host }) => host.tokenize!(text));
    },
    exampleSearch(query, signal) {
      signal?.throwIfAborted();
      return withSession(({ host }) => {
        signal?.throwIfAborted();
        return host.exampleSearch!(query, signal);
      });
    },
    account: { signOut, connected: () => options.link.linked() },
    study: fallback.study && {
      ...fallback.study,
      save: undefined,
      async states(lemmas) {
        try { return await withSession(async ({ host }) => host.study?.states(lemmas) ?? null); }
        catch { return null; }
      },
    },
    async resolvePending(onProgress) {
      revision++;
      cached = undefined;
      if (reconnect) {
        options.link.signOut();
        reconnect = false;
      }
      await options.link.signIn(onProgress);
    },
  };
}
