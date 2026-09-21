import { apiHost } from "./api-host.js";
import { glossLanguagesFrom } from "./languages.js";
import type { Link } from "./link.js";
import type { LookupResult, WordCardHost } from "./host.js";
import type { GetDictionaryStackResponse, GetMeResponse } from "@shirabe-org/api";

type Preferences = { languages: string[]; dictionaryReveal: Record<string, "show" | "hover"> };

class ConnectionRequired extends Error {}

/** A read-only Anki dictionary host that applies the account's saved preferences. */
export function createAnkiHost(options: { apiBase: string; link: Link; now?: () => number }): WordCardHost {
  const now = options.now ?? Date.now;
  const base = options.apiBase.replace(/\/$/, "");
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
      const [meResponse, stackResponse] = await Promise.all([
        options.link.fetch(`${base}/api/v1/me`, { headers: { Accept: "application/json" } }),
        options.link.fetch(`${base}/api/v1/dictionary-stack`, { headers: { Accept: "application/json" } }),
      ]);
      if ([meResponse.status, stackResponse.status].some((status) => status === 401 || status === 403)) {
        reconnect = true;
        throw new ConnectionRequired("Reconnect to use your dictionary preferences and uploaded dictionaries.");
      }
      if (!meResponse.ok || !stackResponse.ok) throw new Error("Couldn't load your dictionary settings. Try again.");
      const me = await meResponse.json() as GetMeResponse;
      const stack = (await stackResponse.json() as GetDictionaryStackResponse).dictionaryStack;
      if (!me.credential?.scopes?.includes("user:profile:read") || !stack) {
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
    return { ...result, definition: { ...result.definition, senses: result.definition.senses.map((sense) => {
      const slug = sense.ref?.split("#")[0];
      const covered = slug && Object.entries(preferences.dictionaryReveal ?? {}).some(([source, mode]) =>
        source.split(":")[0] === slug && mode === "hover");
      return { ...sense, covered: !!covered };
    }) } };
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
