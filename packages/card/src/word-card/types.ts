// The card's data vocabulary: what a host hands over and what the card renders.
// This is the contract three surfaces agree on, so it carries no page concepts
// (a parsed token, a pack manifest) and no transport (a message, a response).

import type { GlossLanguage } from "./languages.js";
export type { GlossLanguage };

export type WordState = "none" | "new" | "learning" | "due" | "retired";

// One token as the content script needs it: where it sits in the source text
// (UTF-16 offsets, matching the DOM), how to render furigana, and its state.
/** One word a span could be. Enough to render a choice and to save the one the
    reader picks: `entry` is the `(dictionary, sourceId)` identity the server
    calls `sourceId` + `dictionary`, and it is what a save travels under. */
export type TokenCandidate = {
  entry: string;
  headword: string;
  reading: string | null;
  common: boolean;
};

export type PitchPattern = { downstep: number; audioUrl: string | null };

/** One label on a sense: the short text a reader sees, the raw JMdict code
    behind it, and which family it belongs to. The family decides the colour, and
    it is the difference between "Godan verb" and "Usually kana": one says what
    the word IS and the other how it is USED, and a single grey run of text made
    them look like the same kind of claim. */
export type SenseScope = "entry" | "group" | "sense";
export type SenseChip = { label: string; code: string; category: "pos" | "field" | "misc" | "dialect"; scope?: SenseScope };

export type SourceTag = { name: string; category: string; notes?: string; order: number; score: number };
export type SourceHeadword = { text: string; reading: string; tags: SourceTag[]; rules: string[]; score: number };

/** A sense's meaning in ONE language, tagged with which. A word glossed in both
    shows both, EN over ES or ES over EN as the reader's stack says, rather than
    the whole entry twice over. `lang` is the language the TEXT is in, which is
    not always the one asked for: a sense JMdict only glosses in English is an
    English row inside a Spanish reader's card, and saying so is the honest
    version of a fallback that used to print English under "Español". */
export type GlossRow = { lang: GlossLanguage; tag: string; text: string; title?: string };
export type UsageRow = GlossRow;

// One dictionary sense, mirroring how shirabe.org renders a meaning: POS chips,
// misc/field/dialect chips, and the meaning in each language on its own row.
export type Sense = {
  /** How a save names this sense: `"<dictionary slug>#<its own number>"`, sent back in `senses`. */
  ref?: string;
  /** 0-based sense position within its own entry, for display and ordering. */
  position: number;
  /** The publisher's marker, when it supplied one (for example `一㋐`). */
  label?: string;
  /** 0 group, 1 sense, 2 sub-sense, matching SenseTier on the server. */
  depth?: number;
  /** Named only when it adds something. Every ordinary word is JMdict, and a
      dictionary line on every sense of every card is a label nobody reads. */
  dictionary?: string;
  /** A dictionary the reader chose to reveal only on hover or keyboard focus. */
  covered?: boolean;
  partsOfSpeech: SenseChip[];
  /** Raw JMdict codes (v5b, adj-i, prt): what styling and metrics match on.
      Offline packs carry them; the API path returns entity strings only. */
  posCodes?: string[];
  tags: SenseChip[];
  /** Grammar stated for the group containing this sense, rendered once at its boundary. */
  groupTags?: SenseChip[];
  sourceTags?: SourceTag[];
  /** Stable dictionary/source identity for entry-level source metadata. */
  sourceEntry?: string;
  glosses: GlossRow[];
  usages?: UsageRow[];
  /** The usage notes on THIS sense: "usu. in kana", "after the -te form of a
      verb". The one thing on a sense that changes how the word is USED rather
      than saying what it means, and the reason it is per sense and never carried
      down to the next: "usu. in kana" on sense 3 and not on sense 4 is a real
      difference between those two senses. */
  notes?: string[];
  /** Words this sense points at: what it is related to, and what it is the
      opposite of. Absent where the dictionary records neither. */
  xrefs?: SenseXref[];
};

/** A cross reference: the word, its reading when the dictionary knows one, and
    what kind of link it is. */
export type SenseXref = { kind: "related" | "antonym"; text: string; reading?: string; label?: string };

// An example sentence with its translation, from the pack's own sentence
// records. Plain text: shipping a token stream per sentence to make the words
// clickable would have cost several megabytes, and the parser can tokenize one
// locally if that ever earns its place.
// `tokens` is the cut the SITE read this line with, shipped in the pack. Mining
// this example carries it to the server, so the saved sentence keeps the words
// the learner was shown instead of being read again on arrival. Absent for a
// pack built before recipe 10.
//
// `lemma` is what makes the line READABLE rather than merely cut: it is how the
// example knows which of its words is the one being looked up (食べました is 食べる,
// and no comparison of surfaces can say so), and it rides along free because the
// pack already stores it. Mining still sends surfaces alone: see `card-form`.
export type Example = {
  japanese: string;
  translation: string | null;
  source?: string;
  reference?: string;
  translationLanguage?: string;
  tokens?: { surface: string; lemma?: string }[];
};

// A definition as shown in the hover popup: a faithful slice of the shirabe.org
// word card. Flattened from /api/v1/search (which already returns all of this).
/** Another spelling of the same word. `rare` is JMdict's own judgement (`rK`,
    `oK`): shown, because a reader who met it needs to find it, but never as
    loudly as a spelling in ordinary use. */
export type WordForm = { text: string; common: boolean; rare: boolean };

/** What KANJIDIC knows about a character, on a card that IS a character. The
    single `reading` a word card carries cannot say it: a kanji has readings in
    the plural, and which kind they are is most of what a learner is asking. */
export type KanjiDetail = { on: string[]; kun: string[]; strokes?: number; grade?: number };

export type Definition = {
  headword: string;
  reading: string | null;
  /** Every other spelling this word is written with, headword and displayed
      reading excluded (they are already at the top of the card). Absent for a
      word written exactly one way, which is most of them. */
  forms?: WordForm[];
  kanji?: KanjiDetail;
  /** The dictionary entry this hit came from, as the pack's stable
      `slug:sourceId` handle ("jmdict:2517580"). Sent back when the word is saved
      so the card LINKS to that entry (enrichment, drift-tracking) instead of
      landing as an orphan the learner has to relink by hand. Absent for a kanji,
      which is not a dictionary word. */
  entry?: string;
  url: string; // the word's page on shirabe.org
  common: boolean;
  jlpt: string | null; // e.g. "N3"
  frequency: number | null; // corpus rank (lower = more common)
  pitch: PitchPattern[];
  /** Grammar stated for each source entry, rendered inside that entry's first visible sense. */
  entryTagsByEntry?: Record<string, SenseChip[]>;
  senses: Sense[];
  /** Source headword pairs grouped by the dictionary entry that supplied them.
      Kept separate from the wire shape so mixed dictionary cards never merge
      publisher tags from unrelated entries. */
  sourceHeadwordsByEntry?: Record<string, SourceHeadword[]>;
  examples: Example[];
  sourceForm?: string;
  baseForm?: string;
  baseReading?: string;
  inflection?: string[];
  inflectionBase?: string;
  offline?: boolean;
  /** Preparation time as Unix milliseconds, absent for live dictionary data. */
  preparedAt?: number;
};

export type DeckMembership = { id: number; name: string };
export type IntervalPreviews = { again: string; hard: string; good: string; easy: string };
export type StudyDetails = {
  state: WordState;
  decks: DeckMembership[];
  intervals?: IntervalPreviews;
  /** Shirabe card id: open `/study/cards?card_id=` to view card + mined context. */
  cardId?: number;
  reviewCard?: { id: number; revision: string };
  /**
   * How many cards this word holds. A word can carry one per meaning, so `> 1`
   * means `cardId` reaches only one of them and the word deserves the card
   * browser filtered by lemma instead of a deep link.
   */
  cardCount?: number;
  /** 0-based sense positions this word already has cards for. */
  savedSenses?: string[];
  /** A card covers the whole word, so every meaning is already taken. */
  savedWholeWord?: boolean;
};
