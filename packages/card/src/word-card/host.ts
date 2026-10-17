import type { Definition, StudyDetails, TokenCandidate } from "./types.js";

// Everything the word card needs from the world around it, and nothing about
// where that world is. The card renders one word; the host answers what that
// word is, what the reader knows about it, and what happens when they act on it.
//
// The reason this exists is that three surfaces want the same card: a browser
// extension over a local pack, a web page over the API, and an Anki card over a
// script tag. A render decision copied into three places drifts.
//
// The rule that keeps the seam honest: this package may not import anything a
// host owns. If a new feature wants a browser API, a pack, a toast or the page's
// metrics, it needs a method here instead.

/** A grade on Shirabe's 1-4 FSRS scale, matching POST /api/v1/srs/reviews. */
export type Rating = 1 | 2 | 3 | 4;

// A lookup that could not answer, and what the reader could do about it. The
// extension returns `pending` while a pack installs; a web host never does, and
// must not have to know what a pack is.
/** One source span, optionally pinned to a dictionary entry. */
export type CardToken = {
  surface: string;
  start: number;
  length: number;
  entry?: string;
  /** Dictionary form. What the lookup is made on. */
  lemma?: string;
  reading?: string;
  /** The short part-of-speech tag, in the server's own vocabulary ("noun",
      "verb", "prt"). It NARROWS a lookup, and a tag from some other vocabulary
      narrows it to nothing: きみ needs this to answer 君 rather than the grain
      it shares a reading with. */
  pos?: string;
  inflection?: string[];
  inflectionBase?: string;
  /** True where a lookup is worth offering. Punctuation and symbols are cut like
      anything else and are not words. */
  content?: boolean;
};

/** The data contract read by showNow and schedulePrefetch. Hosts only need to
    map their parsed token to CardToken; the SDK owns its DOM attribute names. */
export function cardTokenAttributes(token: CardToken, sentence?: string, targetStart = token.start, targetEnd = targetStart + token.length): Record<string, string> {
  return {
    "data-lemma": token.lemma ?? token.surface,
    "data-surface": token.surface,
    ...(token.entry ? { "data-entry": token.entry } : {}),
    ...(token.reading ? { "data-reading": token.reading } : {}),
    ...(token.pos ? { "data-pos": token.pos, "data-lookup-pos": token.pos } : {}),
    ...(token.inflection?.length ? { "data-inflection": JSON.stringify(token.inflection) } : {}),
    ...(token.inflectionBase ? { "data-inflection-base": token.inflectionBase } : {}),
    "data-target-start": String(targetStart),
    "data-target-end": String(targetEnd),
    ...(sentence ? { "data-sentence": sentence } : {}),
  };
}

/** What the reader was actually looking at, beyond the string.
 *
 * A bare spelling is ambiguous in a way a token is not: 開いた read ヒライタ is
 * ひらく and read アイタ is あく, and a lookup given only "開いた" answers with
 * whichever spelling is commonest. Passing the reading and the part of speech is
 * the difference between a definition and a confident wrong one. */
/** What the card is willing to say happened. A closed list, so a host knows
 *  what it may receive and a chart is not built on a name that moved. */
export type CardEvent =
  | "card_opened"       // a definition was rendered
  | "card_missing"      // the host answered, and had no word
  | "lookup_failed"     // the host could not answer at all
  | "candidate_selected"
  | "lookup_link_opened"
  | "word_saved"
  | "word_known"
  | "save_refused";     // the write came back refused, `reason` says which

export type LookupContext = {
  surface?: string;
  reading?: string;
  pos?: string;
  kind?: string;
  inflection?: string[];
  /** Surrounding source text for position-based lookup APIs. */
  text?: string;
  /** UTF-16 source offset where the lookup begins. */
  startOffset?: number;
  /** Optional UTF-16 exclusive boundary hint for the clicked token. */
  endOffset?: number;
};

export type LookupPending = { status: "pending"; message: string };
export type LookupFailed = { status: "failed"; message: string };
export type LookupFound = {
  status: "found";
  definition: Definition | null;
  scanStart?: number;
  candidates?: TokenCandidate[];
  /** Complete ranked alternatives for hosts that can show one Yomitan-style result stack. */
  alternatives?: Definition[];
};
export type LookupUnavailable = { status: "unavailable"; message: string; action: { label: string; url: string } };
export type LookupResult = LookupFound | LookupPending | LookupFailed | LookupUnavailable;

/** What a write came back with. `proRequired` turns a refusal into an offer. */
export type Outcome = { ok: boolean; message: string; cardUrl?: string; proRequired?: boolean };

// Present only on a host with an account behind it. Absent is the whole answer
// for an anonymous Anki card: the card draws no mining controls rather than
// drawing dead ones.
export type StudyPort = {
  source?: string;
  states(lemmas: string[]): Promise<Record<string, StudyDetails> | null>;
  urlForWord(word: HTMLElement): Promise<string | undefined>;
  apply(word: HTMLElement, details: StudyDetails): void;

  /** All three are optional, and a host that cannot do one gets no button for
      it rather than a button that refuses. An Anki card has none of them: the
      collection is where its reviews live, and the client it signs in as is
      refused a write by the server whatever it asks for. */
  save?(word: HTMLElement, senses?: string[]): Promise<Outcome>;
  markKnown?(word: HTMLElement): Promise<Outcome>;
  grade?(word: HTMLElement, rating: Rating): Promise<Outcome>;

  /** The full save form, which needs decks, a screenshot and the account: all
      host business. The card gives it a container and gets told when it closes. */
  renderSaveForm?(container: HTMLElement, word: HTMLElement, definition: Definition | null, done: {
    onCancel(): void;
    onSaved(message: string): void;
  }): Promise<void>;

  /** True when the host draws grade buttons on the card at all. Reviewing lives
      on the site for the extension, so its answer is false. */
  gradingInCard?: boolean;
};

// A clip the card may not fetch itself: in an extension the page's CSP forbids
// it, on a web page there is no such problem. Whoever can fetch it, does.
export type AudioPort = { clip(url: string): Promise<{ dataUrl: string } | { error: string }> };

/**
 * What the card is asking about.
 *
 * `text` is the one that matters: a raw-text scan hands over the whole window
 * from the cursor, not a word, and the host is expected to find the word at the
 * front of it. An offline engine does that itself by longest match; a host over
 * the API has to ask the API to cut it first. Getting this wrong looks like
 * asking the dictionary to define an entire sentence.
 */
export type LookupKind = "word" | "kanji" | "text";

export type WordCardHost = {
  lookup(query: string, kind: LookupKind, context?: LookupContext): Promise<LookupResult>;
  lookupEntry(entry: string, surface: string, word?: HTMLElement): Promise<LookupResult>;
  /** Optional cheaper hover warmup. Its own lookup cache should serve the later
      lookup call; the card does not render or report this answer. */
  prefetch?(query: string, kind: LookupKind, context?: LookupContext): Promise<void>;

  /** Called when scrolling makes another complete match the visible result. */
  onVisibleDefinition?(definition: Definition): void;
  /** Called after the current lookup has rendered or failed, never for a stale response. */
  onDefinitionRendered?(definition: Definition | null): void;
  /** Link kanji outside the card when this host has no kanji lookup. */
  kanjiUrl?(character: string): string | null;
  /** Optional destinations shown below the definition, including on a miss. */
  lookupLinks?(definition: Definition | null, word: HTMLElement): Array<{ id: string; label: string; url: string }>;
  /** Replaces the default link to the dictionary page. */
  openHeadword?(definition: Definition, spelling: string): void;

  study?: StudyPort;
  account?: {
    signOut(): void | Promise<void>;
    connected?(): boolean;
  };
  /** Start account linking. The card draws this for a signed-out reader who could save. */
  connectAccount?(): void | Promise<void>;
  audio?: AudioPort;

  /** Cut a run of Japanese into words, for a host that has no parser of its own.
   *
   * The extension does not implement this: it parses locally and hands the card
   * spans that are already words. A host over the API does, and the difference
   * shows: scanning raw text asks "what starts here", which answers badly at a
   * boundary the reader did not choose, while a parsed run gives every word its
   * own span and its own hover.
   *
   * `start` and `length` are in code units of the text as given, so a caller can
   * put the tokens back over their own DOM. */
  tokenize?(text: string): Promise<CardToken[]>;

  /** The other words a span could be. The page that parsed it knows; the card
      only asks. A host with no page behind it simply has no answer. */
  candidatesFor?(word: HTMLElement): TokenCandidate[];

  /** Remember where a detached scan span came from, so a save can quote its
      sentence. Only a host that scans raw page text has anywhere to put this. */
  rememberOrigin?(word: HTMLElement, origin: Element | null | undefined): void;

  // Called while a lookup is `pending`, so the host can do whatever unblocks it
  // and say when to look again. Resolving means "ask me for this word again".
  // `onProgress` takes a node as well as a sentence: a host that is waiting on
  // the reader may need to give them something to press.
  resolvePending?(onProgress: (message: string | Node) => void): Promise<void>;

  notify?(message: string, ok: boolean): void;

  /** Tell the host something happened, for whoever is watching.
   *
   * The card never reports anywhere itself. It runs inside other people's pages
   * and other people's Anki decks, and a library that phones home from those is
   * a different thing from an application the reader installed. It also cannot
   * know which project the host reports to, or whether the reader agreed.
   *
   * `detail` carries no page text and no word the reader looked at: what is
   * useful is that a lookup failed and why, not which word it was. */
  report?(event: CardEvent, detail?: Record<string, string | number | boolean>): void;
  onStudyChanged?(): void;
  pricingUrl?(source: string): Promise<string>;
};
