import type { ApiEntry, ApiSense, ApiTag, ApiWordDetail } from "./api-types.js";
import type { CardToken, LookupResult, Outcome, WordCardHost } from "./host.js";
import type { Link } from "./link.js";
import type { Definition, GlossLanguage, GlossRow, Sense, SenseChip, SenseScope, SenseXref, StudyDetails, WordForm } from "./types.js";
import { GLOSS_TAGS } from "./languages.js";
import { kataToHira } from "./furigana.js";
import { apiExampleSearch } from "./api-example-search.js";
import type {
  GetWordResponse,
  IdentifyWordsData,
  IdentifyWordsResponse,
  LookupWordStatesData,
  LookupWordStatesResponse,
  ParseTextData,
  ParseTextResponse,
  ParseToken,
  SaveCardData,
} from "@shirabe-org/api";

type IdentifyToken = IdentifyWordsData["body"]["tokens"][number];
type IdentifiedCandidate = NonNullable<NonNullable<IdentifyWordsResponse["words"][number]>["candidates"]>[number];

/**
 * A host backed by Shirabe's public API, for anything that is not the browser
 * extension: a web page, an Anki template, a desktop app.
 *
 * It lives here rather than in each consumer because the mapping below is the
 * expensive part and it is the same mapping every time. The API answers with
 * `entries` of `senses` written per dictionary; the card renders one word with
 * one list of senses. Getting that wrong is how a client ends up showing one
 * dictionary's meanings and silently dropping another's.
 */
export type ApiHostOptions = {
  /** Where the API lives, e.g. `https://shirabe.org`. */
  apiBase: string;
  /** Sent as `Authorization: Bearer`. Absent means anonymous, which the API may
      refuse: a lookup that comes back 401 surfaces as a failed lookup, not as a
      blank card. */
  token?: string;
  /** The supplied fetch already carries a signed-in reader, as it does inside
      Shirabe where the browser session stays in its HttpOnly cookie. */
  authenticated?: boolean;
  /** A sign-in this host can carry out itself, for a surface with nowhere else
      to do one: an Anki card, on a desktop or a phone. It supplies the reader on
      every request, renews what it holds, and turns a 401 into an offer instead
      of a dead end. Build one with `createLink`. */
  link?: Link;
  /** What the card says while it waits for the reader to sign in. A `link` gives
      this a default; without one there is nowhere to send them, so a 401 stays
      an ordinary failure. */
  signInPrompt?: string;
  /** Gloss languages in the reader's own order. */
  languages?: GlossLanguage[];
  /** Alternate transport, such as a host-authenticated fetch or test fixture. */
  fetch?: typeof globalThis.fetch;
};

export function apiHost(options: ApiHostOptions): WordCardHost {
  const base = options.apiBase.replace(/\/$/, "");
  const languages = options.languages ?? ["eng"];
  // A link is a `fetch` with the reader on it, so carrying an account needs
  // nothing else here: the requests below are written as if signed in, and are,
  // once they are.
  const http = options.link?.fetch ?? options.fetch ?? globalThis.fetch.bind(globalThis);
  const signInPrompt = options.signInPrompt ?? (options.link ? "Sign in to look this word up" : undefined);
  const authenticated = !!options.token || !!options.link || !!options.authenticated;

  // False only where we KNOW the next request cannot carry a credential: the
  // link is this host's way of authenticating and the reader has not signed in
  // through it yet. A `link` is the right to sign in, not the fact of having
  // done so, and every path below needs a token.
  //
  // A host given its own `fetch` and no link is left alone, because that fetch
  // may be the credential: the desktop add-on's hands the call to Python, where
  // the token lives.
  //
  // What this stops: the server allows 30 unauthenticated requests a minute per
  // IP and then answers 429, and a signed-out card spent that in under a minute
  // of ordinary reviewing, because `attach` cuts the note's text on every
  // render and Anki re-renders on every flip. The reader ended up reading "Too
  // many unauthenticated API requests" instead of the sign-in being offered.
  const credentialed = (): boolean => !!options.token || !options.link || options.link.linked();

  const request = async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
    if (!credentialed()) throw new ApiError(401, signInPrompt ?? "Sign in to look this word up");
    const response = await http(`${base}/api/v1${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) throw new ApiError(response.status, await problemTitle(response));
    return (response.status === 204 ? null : response.json()) as T;
  };

  // A reader hovering a paragraph asks for the same words over and over, and
  // over the network that is a request each time. The API is built for this
  // (its dictionary reads are ETagged for exactly this reason), but the cheapest
  // request is the one not made: an answer is good until the tab goes away.
  const cache = new Map<string, LookupResult>();
  const parses = new Map<string, CardToken[]>();
  function remember<T>(map: Map<string, T>, key: string, value: T): void {
    map.delete(key);
    map.set(key, value);
    if (map.size > 128) map.delete(map.keys().next().value!);
  }

  // Not signed in is a step the reader can take, so it is `pending` and not
  // `failed`: the card offers the sign-in and retries the same word afterwards,
  // rather than showing "Bearer token required", which is our problem worded as
  // theirs.
  function whatWentWrong(error: unknown): LookupResult {
    if (error instanceof ApiError && error.status === 401 && signInPrompt) {
      return { status: "pending", message: signInPrompt };
    }
    return { status: "failed", message: error instanceof Error ? error.message : "Lookup failed" };
  }

  const lookupBy = async (path: string): Promise<LookupResult> => {
    const cached = cache.get(path);
    if (cached) return cached;
    try {
      const payload = await request<GetWordResponse>(path);
      const found: LookupResult = { status: "found", definition: toDefinition(payload, base, languages) };
      remember(cache, path, found);
      return found;
    } catch (error) {
      // A word the dictionary does not have is an answer, not a failure: the
      // card says "no entry" rather than "something went wrong".
      // A word the dictionary does not have will not start existing, so that
      // answer is worth keeping. A failure is not: the server may be back.
      if (error instanceof ApiError && error.status === 404) {
        const missing: LookupResult = { status: "found", definition: null };
        remember(cache, path, missing);
        return missing;
      }
      return whatWentWrong(error);
    }
  };

  // Which word a token is, asked the way the server wants it asked.
  //
  // NOT `GET /api/v1/words/{id}`. That takes a spelling and ignores everything
  // else, so 開いた read ヒライタ (ひらく) comes back as あく: a confident wrong
  // definition, and nothing raises because a wrong answer is not an error.
  // `identify` takes the token, uses the reading and the part of speech to rank,
  // and answers a LIST, because one answer is often a claim that cannot be
  // supported: きみ is 君, 黄身 or 黍 and only the reader knows which.
  const identify = async (token: IdentifyToken): Promise<LookupResult> => {
    const key = `identify:${JSON.stringify(token)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    try {
      // `locale` rides in the query string: the request body rejects properties
      // it does not declare. `include` is what makes this ONE call rather than a
      // second fetch for the pitch diagram and the badges.
      const body = {
        tokens: [token],
        include: ["pitch", "frequency", "furigana", "jlpt", "forms", "notes", "relations", "parts"],
      } satisfies IdentifyWordsData["body"];
      const answer = await request<IdentifyWordsResponse>(`/words/identify?locale=${encodeURIComponent(uiLocale(languages))}`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      // A token that resolves to nothing answers 200 with `words: [null]`, so
      // "no entry" arrives in the body rather than as a status. A name, a
      // coinage or a typo the corpus kept is an ordinary case, not a failure.
      const all = (answer.words[0]?.candidates ?? []).map(completeCandidate);
      // Names rank below real words and never outrank one, so they arrive as a
      // tail: きみ answers with six people called Kimi behind the pronoun. Drop
      // them while there is a word to show, and keep them when there is not,
      // because then being a name IS the answer.
      const words = all.filter((candidate) => !isName(candidate));
      const candidates = words.length ? words : all;

      const found: LookupResult = {
        status: "found",
        definition: candidates.length ? toDefinition(candidates[0]!, base, languages) : null,
        candidates: candidates.map((candidate) => ({
          entry: entryIdentity(candidate),
          headword: candidate.headword,
          reading: candidate.reading ?? null,
          common: candidate.common ?? false,
        })),
      };
      remember(cache, key, found);
      return found;
    } catch (error) {
      return whatWentWrong(error);
    }
  };

  // Not signed in is a step the reader can take, so it is `pending` and not
  // `failed`: the card offers the sign-in and retries the same word afterwards,
  // rather than showing "Bearer token required", which is our problem worded as
  // theirs.
  return {
    // A tapped word, asked as a token rather than as a spelling.
    //
    // `text` is the scanning fallback, where the query is everything from the
    // cursor rather than a word. Cutting comes first there, because identifying
    // a whole clause asks about something nobody pointed at.
    async lookup(query, kind, context) {
      if (kind !== "text") {
        return identify({
          lemma: query,
          ...(context?.surface ? { surface: context.surface } : {}),
          ...(context?.reading ? { reading: context.reading } : {}),
          ...(context?.pos ? { pos: context.pos } : {}),
        });
      }
      // Cutting can fail rather than come back empty: signed out, the parse is
      // a 401. Answering "no entry" there would blame the word for our missing
      // account, so the error is kept and turned into the same offer any other
      // request gets.
      const tokens = await this.tokenize!(query.slice(0, 120)).catch((error: unknown) => whatWentWrong(error));
      if (!Array.isArray(tokens)) return tokens;
      const first = tokens.find((token) => token.content !== false);
      if (!first) return { status: "found", definition: null };
      const result = await identify({
        lemma: first.lemma ?? first.surface,
        surface: first.surface,
        ...(first.reading ? { reading: first.reading } : {}),
        ...(first.pos ? { pos: first.pos } : {}),
      });
      if (result.status !== "found") return result;
      const selected = first.entry && result.definition?.entry !== first.entry
        ? await this.lookupEntry(first.entry, first.surface) : result;
      if (selected.status !== "found" || !selected.definition) return selected;
      return { ...selected, candidates: result.candidates, definition: { ...selected.definition, sourceForm: first.surface,
        ...(first.inflection?.length ? { inflection: first.inflection, inflectionBase: first.inflectionBase } : {}),
      } };
    },

    lookupEntry: (entry, surface) => {
      const params = new URLSearchParams({ entry, include: "examples", locale: uiLocale(languages) });
      return lookupBy(`/words/${encodeURIComponent(surface)}?${params}`);
    },

    exampleSearch: apiExampleSearch(request, languages),

    // The server's own tokenizer, so a host with no parser gets the same cuts
    // the website and the extension get rather than a guess made from a string.
    async tokenize(text) {
      // Deliberately no signed-out shortcut here. `request` already refuses
      // without reaching the network, and it refuses by THROWING, which is the
      // difference the callers rely on: `wrapWords` catches it and wraps
      // nothing, while `lookup` turns it into the sign-in offer. Returning an
      // empty list instead says "this text holds no words", and a reader who
      // tapped a sentence was told there was no entry for it.
      const key = `parse:${text}`;
      const cached = parses.get(key);
      if (cached) return cached;
      const body = { text } satisfies ParseTextData["body"];
      const parsed = await request<ParseTextResponse>(`/parse?locale=${uiLocale(languages)}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (parsed.tokens.some(Array.isArray)) throw new Error("The parser returned a batch for one text.");
      const parsedTokens = parsed.tokens as ParseToken[];

      // `position` and `length` come from the server, in UTF-16 units, which is
      // what a JavaScript string index is. Searching for each surface instead
      // would put the second 猫 of a sentence at the first one's offset.
      const tokens: CardToken[] = parsedTokens.map((token) => ({
        surface: token.surface,
        start: token.position,
        length: token.length,
        lemma: token.lemma ?? token.surface,
        reading: token.reading,
        pos: token.pos,
        entry: token.entry ? `${token.entry.dictionary}:${token.entry.sourceId}` : undefined,
        ...(token.inflection ? { inflection: token.inflection.labels, inflectionBase: token.inflection.base } : {}),
        content: token.kind !== "symbol",
      })).filter((token) => token.surface);
      remember(parses, key, tokens);
      return tokens;
    },

    // Signing in is the host's own job now, so the card asks it rather than
    // asking whoever assembled it.
    resolvePending: options.link?.signIn,

    study: authenticated ? {
      async states(lemmas) {
        try {
          // `states` is a LIST of `{lemma, state}`, in the order asked. Read as
          // an object it keys every word by its array index, so the card looks
          // up 猫, finds nothing, and paints no state on anything.
          const body = { words: lemmas } satisfies LookupWordStatesData["body"];
          const payload = await request<LookupWordStatesResponse>("/srs/states/lookup", {
            method: "POST",
            body: JSON.stringify(body),
          });
          const out: Record<string, StudyDetails> = {};
          for (const value of payload.states) {
            if (!value.lemma) continue;
            out[value.lemma] = { state: wordState(value.state), decks: [], cardId: value.cardId };
          }
          return out;
        } catch {
          return null;
        }
      },
      async urlForWord(word) {
        const id = word.dataset.cardId;
        return id ? `${base}/study/cards?card_id=${id}` : `${base}/study/cards`;
      },
      apply(word, details) {
        word.dataset.state = details.state;
        if (details.cardId != null) word.dataset.cardId = String(details.cardId);
      },
      save: (word, senses) => {
        const [dictionarySlug, ...sourceId] = (word.dataset.entry ?? "").split(":");
        return write(request, {
          lemma: word.dataset.lemma ?? "",
          reading: word.dataset.reading,
          ...(dictionarySlug && sourceId.length ? { dictionarySlug, sourceId: sourceId.join(":") } : {}),
          senses,
        }, "Saved");
      },
    } : undefined,

    async pricingUrl(source) {
      return `${base}/pricing?source=${encodeURIComponent(source)}`;
    },
  };
}

async function write(request: (path: string, init?: RequestInit) => Promise<unknown>, body: SaveCardData["body"], done: string): Promise<Outcome> {
  try {
    await request("/srs/saves", { method: "POST", body: JSON.stringify(body) });
    return { ok: true, message: done };
  } catch (error) {
    // 402 is the paywall, and the card turns it into an offer rather than an
    // error: the same distinction the extension draws.
    const proRequired = error instanceof ApiError && error.status === 402;
    return { ok: false, message: error instanceof Error ? error.message : "Could not save", proRequired };
  }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function problemTitle(response: Response): Promise<string> {
  try {
    const body = await response.json() as { title?: string; detail?: string };
    return body.detail ?? body.title ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

// The server files people under JMnedict, and now says so itself rather than
// leaving a client to test the slug: JMdict carries thousands of name rows under
// its own slug, so the slug alone keeps every one of them and never tells you.
const isName = (candidate: ApiWordDetail & { name?: boolean }): boolean =>
  candidate.name === true;

function completeCandidate(candidate: IdentifiedCandidate): ApiWordDetail {
  if (!candidate.dictionary || !candidate.sourceId || candidate.common === undefined
    || !candidate.pitch || !candidate.forms || !candidate.entries) {
    throw new Error("The API returned an incomplete word candidate.");
  }
  return { ...candidate, furigana: candidate.furigana ?? [] } as ApiWordDetail;
}

// Which language the server should resolve its LABELS into. The definitions come
// back in every language the entry has; this only picks the one the chips read.
const uiLocale = (languages: readonly GlossLanguage[]): string =>
  languages[0] === "spa" ? "es" : "en";

// The reading as the card should draw it: the aligned ruby when the server sent
// one, and the canonical reading folded to hiragana when it did not.
function readingOf(payload: ApiWordDetail): string | null {
  const ruby = (payload.furigana ?? []).map((part) => part.ruby ?? part.text).join("");
  if (ruby) return ruby;
  return payload.reading ? kataToHira(payload.reading) : null;
}

const wordState = (raw: string | undefined): StudyDetails["state"] =>
  raw === "new" || raw === "learning" || raw === "due" || raw === "retired" ? raw : "none";

// ── The mapping ──────────────────────────────────────────────────────────────

/**
 * `WordDetail` to `Definition`.
 *
 * The two shapes disagree in three ways that matter, and each is a decision
 * rather than a rename:
 *
 * - The API groups senses under `entries`, one per dictionary. The card shows
 *   one list, so entries are flattened in their server-given order (which is the
 *   reader's own dictionary stack) and each sense carries which dictionary wrote
 *   it, named only when the card is mixing more than one.
 * - The API returns every language it has; the card shows the reader's, in their
 *   order, and a sense with nothing left to say in those languages is dropped
 *   rather than rendered empty.
 * - `position` comes from the API and is passed straight back on a save. It is
 *   NOT the array index: positions are non-contiguous when a sense was filtered
 *   out, and renumbering them here would save the wrong meaning.
 */
function entryIdentity(payload: ApiWordDetail): string {
  return `${payload.dictionary}:${payload.sourceId}`;
}

export function toDefinition(payload: ApiWordDetail, base: string, languages: readonly GlossLanguage[]): Definition {
  const entries = [...payload.entries].sort((a, b) => a.order - b.order);
  const mixed = new Set(entries.map((e) => e.dictionary)).size > 1;
  const senses = entries.flatMap((entry) => sensesOf(entry, languages, mixed));
  const entryTagsByEntry = Object.fromEntries(entries.flatMap((entry) => {
    const tags = uniqueChips(entry.senses.flatMap((sense) => chips(sense.tags, (tag) => tagScope(tag.scope) === "entry")));
    return tags.length ? [[`${entry.dictionary}:${entry.sourceId}`, tags] as const] : [];
  }));
  const sourceHeadwordsByEntry = Object.fromEntries(entries.flatMap((entry) =>
    entry.sourceHeadwords?.length ? [[`${entry.dictionary}:${entry.sourceId}`, entry.sourceHeadwords] as const] : []));

  return {
    headword: payload.headword,
    // Hiragana, because this is what gets drawn over the headword. The server's
    // `reading` is the entry's canonical katakana (ネコ), and its `furigana`
    // carries the ruby a reader expects (ねこ); prefer the second and fold the
    // first when it is all there is.
    reading: readingOf(payload),
    entry: entryIdentity(payload),
    url: `${base}/en/words/${encodeURIComponent(payload.id)}?${new URLSearchParams({ entry: entryIdentity(payload) })}`,
    common: payload.common,
    jlpt: payload.jlpt ?? null,
    frequency: payload.frequency ?? null,
    pitch: payload.pitch.map((p) => ({ downstep: p.downstep, audioUrl: p.audioUrl ?? null })),
    ...(Object.keys(entryTagsByEntry).length ? { entryTagsByEntry } : {}),
    senses,
    ...(Object.keys(sourceHeadwordsByEntry).length ? { sourceHeadwordsByEntry } : {}),
    // The card shows ONE translation under a line, in the reader's first
    // language, because a sentence with three translations stacked under it is
    // no longer an example of anything.
    examples: (payload.examples ?? []).map((example) => ({
      japanese: example.japanese,
      translation: pickTranslation(example.translations, languages),
    })),
    forms: forms(payload),
  };
}

function pickTranslation(
  translations: Array<{ lang: string; text: string }> | undefined,
  languages: readonly GlossLanguage[],
): string | null {
  for (const language of languages) {
    const hit = (translations ?? []).find((t) => FROM_ISO[t.lang] === language);
    if (hit) return hit.text;
  }
  return null;
}

function sensesOf(entry: ApiEntry, languages: readonly GlossLanguage[], mixed: boolean): Sense[] {
  const out: Sense[] = [];
  for (const sense of entry.senses) {
    const glosses = glossRows(sense, languages);
    const usages = usageRows(sense, languages);
    const notes = sense.notes?.length ? sense.notes : undefined;
    const xrefs = crossReferences(sense);
    if (!glosses.length && !usages.length && !notes?.length && !xrefs.length) continue;
    const groupTags = uniqueChips(chips(sense.tags, (t) => tagScope(t.scope) === "group"));
    out.push({
      ref: `${entry.dictionary}#${sense.position}`,
      position: sense.position,
      ...(sense.label ? { label: sense.label } : {}),
      ...(sense.depth != null ? { depth: sense.depth } : {}),
      sourceEntry: `${entry.dictionary}:${entry.sourceId}`,
      dictionary: mixed ? (entry.dictionaryName ?? entry.dictionary) : undefined,
      partsOfSpeech: chips(sense.tags, (t) => t.category === "partOfSpeech" && tagScope(t.scope) === "sense"),
      posCodes: sense.tags.filter((t) => t.category === "partOfSpeech").map((t) => t.code),
      ...(groupTags.length ? { groupTags } : {}),
      tags: chips(sense.tags, (t) => t.category !== "partOfSpeech" && tagScope(t.scope) === "sense"),
      ...(sense.sourceTags?.length
        ? { sourceTags: sense.sourceTags }
        : {}),
      glosses,
      ...(usages.length ? { usages } : {}),
      notes,
      ...(xrefs.length ? { xrefs } : {}),
    });
  }
  return out;
}

function crossReferences(sense: ApiSense): SenseXref[] {
  return [
    ...(sense.related ?? []).map((xref) => crossReference(xref, "related")),
    ...(sense.antonyms ?? []).map((xref) => crossReference(xref, "antonym")),
    ...(sense.seeAlso ?? []).map((xref) => crossReference(xref, "related")),
  ];
}

function crossReference(xref: NonNullable<ApiSense["related"]>[number], kind: SenseXref["kind"]): SenseXref {
  const label = "label" in xref && typeof xref.label === "string" ? xref.label : undefined;
  return {
    kind,
    text: xref.text,
    ...(xref.reading ? { reading: xref.reading } : {}),
    ...(label ? { label } : {}),
  };
}

// The API speaks ISO 639-1 (`en`), the pack and the card speak the three-letter
// gloss codes (`eng`). One table, here, because it is the only place the two
// vocabularies meet.
const FROM_ISO: Record<string, GlossLanguage> = { en: "eng", es: "spa", ja: "jpn" };

// The reader's languages first and in their order. A sense that has none of
// them still renders, in whatever it does have: the server already filtered by
// the reader's own dictionary stack, so a 国語辞典 sense coming back means they
// put that dictionary there on purpose, and hiding it because it writes Japanese
// would hide the dictionary itself (docs/specs/yomitan-monolingual.md).
function glossRows(sense: ApiSense, languages: readonly GlossLanguage[]): GlossRow[] {
  const rows: GlossRow[] = [];
  for (const language of languages) {
    for (const definition of sense.definitions) {
      if (FROM_ISO[definition.lang] !== language) continue;
      rows.push({ lang: language, tag: GLOSS_TAGS[language], text: definition.text, ...(definition.title ? { title: definition.title } : {}) });
    }
  }
  if (rows.length) return rows;
  return sense.definitions.map((definition) => ({
    lang: FROM_ISO[definition.lang] ?? languages[0] ?? "eng",
    tag: (FROM_ISO[definition.lang] && GLOSS_TAGS[FROM_ISO[definition.lang]!]) ?? "",
    text: definition.text,
    ...(definition.title ? { title: definition.title } : {}),
  }));
}

function usageRows(sense: ApiSense, languages: readonly GlossLanguage[]): GlossRow[] {
  const rows: GlossRow[] = [];
  for (const language of languages) {
    for (const usage of sense.usages ?? []) {
      if (FROM_ISO[usage.lang] !== language) continue;
      rows.push({ lang: language, tag: GLOSS_TAGS[language], text: usage.text, ...(usage.title ? { title: usage.title } : {}) });
    }
  }
  if (rows.length) return rows;
  return (sense.usages ?? []).map((usage) => {
    const lang = FROM_ISO[usage.lang] ?? languages[0] ?? "eng";
    return { lang, tag: GLOSS_TAGS[lang], text: usage.text, ...(usage.title ? { title: usage.title } : {}) };
  });
}

const chips = (tags: ApiTag[], keep: (tag: ApiTag) => boolean): SenseChip[] =>
  tags.filter(keep).map((tag) => ({ label: tag.label, code: tag.code, category: category(tag.category), ...(tag.scope ? { scope: tag.scope } : {}) }));

const tagScope = (scope: ApiTag["scope"]): SenseScope => scope ?? "sense";

function uniqueChips(chips: SenseChip[]): SenseChip[] {
  return chips.filter((chip, index) => chips.findIndex((other) =>
    other.category === chip.category && other.code === chip.code && other.scope === chip.scope) === index);
}

const category = (raw: string): SenseChip["category"] =>
  raw === "partOfSpeech" ? "pos" : raw === "field" ? "field" : raw === "dialect" ? "dialect" : "misc";

// The card shows spellings OTHER than the headword, and says which are rare.
// The API marks rarity as a writing tag rather than a boolean.
function forms(payload: ApiWordDetail): WordForm[] | undefined {
  // `forms` includes the headword and both kana spellings of the reading. The
  // row is for spellings a reader might have MET instead of the headword, so
  // repeating what is already at the top of the card is noise.
  const spoken = new Set([payload.headword, payload.reading, readingOf(payload)].filter(Boolean).map(String));
  const others = payload.forms
    .filter((form) => !spoken.has(form.text) && !spoken.has(kataToHira(form.text)))
    .map((form) => ({
      text: form.text,
      common: form.common,
      rare: (form.tags ?? []).some((tag) => /rare|irregular|ateji/i.test(tag.code) || /rare|irregular|ateji/i.test(tag.label)),
    }));
  return others.length ? others : undefined;
}
