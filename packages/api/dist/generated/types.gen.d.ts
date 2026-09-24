export type ClientOptions = {
    baseUrl: 'https://shirabe.org' | 'http://localhost:3000' | (string & {});
};
/**
 * Search request. `query` is the only required field. When `filters.sources`
 * is omitted, the API key owner's saved dictionary stack applies.
 *
 */
export type SearchRequest = {
    /**
     * Lexical terms (kanji, kana, or romaji/meaning) plus optional inline
     * `#key:value` filters, the same grammar as the website search bar. Use
     * `filters` below instead for structured/programmatic filtering; the two
     * are merged.
     *
     */
    query: string;
    /**
     * Structured filters (merged with any inline `#key:value` in `query`).
     * Values accept aliases or codes, lists (`v1,v5k`), ranges (`n5-n3`), and
     * comparators (`<2000`).
     *
     */
    filters?: {
        pos?: string;
        field?: string;
        misc?: string;
        dialect?: string;
        name?: string;
        jlpt?: string;
        freq?: string;
        script?: string;
        common?: boolean;
        /**
         * Ordered dictionary stack for this request. Array order sets dictionary
         * priority; language order sets definition priority within a dictionary.
         * This overrides saved preferences without changing them. Only sources
         * available to the credential are used.
         *
         */
        sources?: Array<SearchSource>;
    };
    /**
     * Maximum number of ranked matches to return per resolved segment.
     */
    limit?: number;
    /**
     * Opt-in extras for every match: `kanji` (character cards) and `sentences`
     * (example preview).
     *
     */
    include?: Array<'kanji' | 'sentences'>;
};
/**
 * Shirabe's preferred dictionary-aware interpretation of the query. Segments
 * preserve their UTF-16 positions and contain best-first word-card matches.
 * Fields requested through `include` appear only when requested.
 *
 */
export type SearchResults = {
    /**
     * Echoes the input query.
     */
    query: string;
    /**
     * The preferred query segmentation, in source-text order.
     */
    segments: Array<SearchSegment>;
};
/**
 * Surrounding text and the UTF-16 target where popup lookup begins.
 */
export type IdentifyRequest = {
    /**
     * The surrounding sentence or bounded Japanese text run.
     */
    text: string;
    /**
     * The clicked position and optional token boundary supplied by the caller.
     */
    target: {
        /**
         * Inclusive UTF-16 code-unit offset where Shirabe starts scanning for dictionary expressions.
         */
        startOffset: number;
        /**
         * Optional exclusive UTF-16 code-unit boundary hint. It ranks that span first but does not exclude overlapping spans.
         */
        endOffset?: number;
    };
};
/**
 * Dictionary-bearing spans beginning at the requested position, best first.
 */
export type IdentifyResults = {
    /**
     * Echoes the submitted text.
     */
    text: string;
    /**
     * Fingerprint of the dictionary configuration used for these results.
     */
    stackFingerprint: string;
    /**
     * Possible dictionary expression lengths beginning at `startOffset`, best first.
     */
    spans: Array<SearchSegment>;
};
/**
 * One dictionary and its ordered definition languages.
 */
export type SearchSource = {
    /**
     * Dictionary slug from `GET /api/v1/dictionaries`.
     */
    dictionary: string;
    /**
     * Ordered ISO 639-1 definition languages for this dictionary.
     */
    languages: Array<'ja' | 'en' | 'es' | 'fr' | 'de' | 'nl' | 'ru' | 'sv' | 'hu' | 'sl'>;
};
/**
 * One search match, a headword merged across dictionaries. `id` is the
 * headword slug for GET /api/v1/words/{id}.
 *
 */
export type Result = {
    /**
     * The handle that reopens THIS result at `GET /api/v1/words/{id}`: the same one the website links with. Usually the headword plus its reading (顔-かお), and a trailing source id where the reading still cannot tell two entries apart. Not always the `headword` field: a bare spelling would hand every homograph sharing it to whichever entry resolves first.
     *
     */
    id: string;
    headword: string;
    reading?: string | null;
    /**
     * How the query matched this result.
     */
    matchType: 'writing' | 'reading' | 'meaning';
    /**
     * Reading aligned to the headword (ruby omitted over kana runs).
     */
    furigana: Array<{
        text: string;
        ruby?: string;
    }>;
    common: boolean;
    jlpt?: string | null;
    /**
     * Corpus rank (lower = more common).
     */
    frequency?: number | null;
    pitch: Array<{
        downstep: number;
        pattern: 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka';
        /**
         * Pre-generated clip of the reading spoken at this accent; null when unavailable.
         */
        audioUrl?: string | null;
        /**
         * Verified published MP3 copy of this recording for offline use; absent when unavailable.
         */
        audioDownloadUrl?: string;
        /**
         * True when no dictionary lists this pitch and it's an automatic model estimate.
         */
        autogenerated?: boolean;
    }>;
    forms: Array<Form>;
    /**
     * One per contributing dictionary, in the caller's preference order.
     */
    entries: Array<Entry>;
    /**
     * Only with include=kanji, kanji cards for the headword's characters.
     */
    kanji?: Array<KanjiCard>;
    /**
     * Only with include=sentences, a capped preview. The full paginated set
     * is at GET /api/v1/sentences?query=<headword>.
     *
     */
    sentences?: Array<Sentence>;
};
/**
 * One dictionary's record for the word. Generic across dictionaries. JMdict,
 * JMnedict, Wikipedia, and user uploads all populate the same container.
 *
 */
export type Entry = {
    /**
     * Dictionary slug (resolve via GET /api/v1/dictionaries).
     */
    dictionary: string;
    /**
     * What that dictionary is CALLED. A slug is not a name: a reader's own uploads are filed under a hash of their contents, so a client attributing these senses on screen prints a hash without this.
     */
    dictionaryName?: string;
    /**
     * Dictionary kind.
     */
    type: string;
    /**
     * The record's identifier within that dictionary.
     */
    sourceId: string;
    senses: Array<Sense>;
    /**
     * Source-specific tags and rules retain their spelling and reading association.
     */
    sourceHeadwords?: Array<SourceHeadword>;
};
/**
 * One dictionary sense in display order. `position` selects the sense when
 * saving; `label` and `depth` preserve the publisher's numbering and hierarchy.
 * Definitions, usages and tags remain separate. Individual fields document
 * whether they require the detail endpoint.
 *
 */
export type Sense = {
    /**
     * How a save names this sense: `"<dictionary slug>#<that dictionary's own 0-based number>"`. Pass it in `senses[]` to scope a card to this sense.
     *
     */
    ref?: string;
    /**
     * 0-based sense position within the entry, the value to send in
     * `senses` to scope a saved card to this sense, qualified by its dictionary
     * slug as `"<slug>#<position>"`. Positions can be
     * non-contiguous when a sense is filtered out for the requested languages.
     * Stable within a dictionary version, but a re-import can shift it; it is a
     * selector to post straight back on a save, not a durable id to cache. The
     * server resolves it against the current entry into a content-keyed anchor,
     * so a saved card survives later re-imports.
     *
     */
    position: number;
    /**
     * Which TIER the dictionary put this sense at: `0` a group, `1` a sense,
     * `2` a sub-sense of the sense above it. Senses arrive in display order, so
     * a client nests by reading this down the list.
     *
     * Computed from the publisher label, whose glyph families vary by dictionary.
     * An unnumbered sense has depth 1.
     *
     */
    depth?: number;
    /**
     * Publisher's sense marker, including enclosing group markers. Omitted when unnumbered.
     */
    label?: string;
    definitions: Array<Definition>;
    /**
     * Publisher-supplied usage content for this sense. This is separate from
     * definitions and corpus-wide examples, and is omitted when the sense has
     * none in the requested languages. Usage rows intentionally have no `kind`.
     *
     */
    usages?: Array<{
        /**
         * ISO 639-1 language code.
         */
        lang: string;
        text: string;
        /**
         * Optional publisher-supplied title for the usage.
         */
        title?: string;
    }>;
    tags: Array<Tag>;
    /**
     * Publisher-defined labels on this definition, separate from grammatical and usage codes.
     */
    sourceTags?: Array<SourceTag>;
    /**
     * Usage notes on this sense ("usu. in kana"). On `GET /api/v1/words/{id}` always; on `POST /api/v1/words/identify` with `include=notes`. Absent when the sense has none, rather than present and empty.
     *
     */
    notes?: Array<string>;
    related?: Array<CrossReference>;
    antonyms?: Array<CrossReference>;
    seeAlso?: Array<CrossReference>;
    /**
     * Writings this sense is restricted to. Detail endpoint only.
     */
    restrictions?: Array<string>;
    /**
     * Loanword etymology. Detail endpoint only.
     */
    loanwordSource?: {
        language?: string;
        text?: string | null;
        wasei?: boolean;
    } | null;
};
/**
 * One meaning text in a single language. Equivalent across languages (the
 * `en`/`es` entries of a sense are the same meaning); within a language,
 * array order is primary-first. `kind` marks non-gloss content.
 *
 */
export type Definition = {
    /**
     * ISO 639-1 language code.
     */
    lang: string;
    text: string;
    /**
     * Omitted for plain glosses; present for explanations/abstracts.
     */
    kind?: 'gloss' | 'meaning' | 'translation' | 'explanation' | 'abstract';
    /**
     * Optional publisher-supplied title for this definition.
     */
    title?: string;
};
/**
 * A generic usage label, part of speech, misc, field, dialect, name-type,
 * writing tag, etc. Dictionary-agnostic: the `category` is open so
 * user-uploaded dictionaries can carry their own. Resolve the full code
 * dictionary via GET /api/v1/tags.
 *
 */
export type Tag = {
    category: string;
    code: string;
    label: string;
    /**
     * Where the publisher states this annotation. Present on sense tags, absent on writing tags.
     */
    scope?: 'entry' | 'group' | 'sense';
};
/**
 * One written form of the word.
 */
export type Form = {
    text: string;
    script: 'kanji' | 'kana' | 'hanzi_trad' | 'hanzi_simp' | 'pinyin' | 'latin' | 'other';
    common: boolean;
    /**
     * Writing tags (rare/irregular/ateji) when present.
     */
    tags?: Array<Tag>;
};
/**
 * Compact kanji card for the kanji in a headword (search ?include=kanji).
 * `char` is the id; fetch the full record at GET /api/v1/kanji/{character}.
 *
 */
export type KanjiCard = {
    char: string;
    /**
     * Language-tagged meanings, primary-first.
     */
    meanings?: Array<{
        lang: string;
        text: string;
    }>;
    readings?: {
        on?: Array<string>;
        kun?: Array<string>;
    };
    strokes?: number | null;
    jlpt?: string | null;
    grade?: number | null;
    frequency?: number | null;
};
/**
 * One lookup chip produced by Shirabe's Sudachi-based tokenizer.
 */
export type Token = {
    /**
     * Surface form as it appeared in the input.
     */
    surface: string;
    /**
     * Short part-of-speech tag (verb, noun, adj, …).
     */
    pos?: string | null;
    /**
     * True for the morpheme used as the search lemma.
     */
    primary: boolean;
    /**
     * Dictionary form of the morpheme.
     */
    lemma?: string | null;
    /**
     * The word id this token reads about at `GET /api/v1/words/{id}`. Follow this rather than `lemma`: a lemma is what a form reduces to, which is not always the word on screen (なら reduces to the copula だ and is its own headword meaning "if"). Absent where the dictionary carries no such word.
     *
     */
    id?: string;
    /**
     * Katakana reading of the surface.
     */
    reading?: string | null;
    /**
     * Full Sudachi POS chain (6 fields).
     */
    posFull?: Array<string>;
    /**
     * Friendly part-of-speech label (Noun, Verb, Copula, Counter, …).
     */
    posLabel?: string | null;
    /**
     * Conjugation type (活用型).
     */
    conjType?: string | null;
    /**
     * Conjugation form (活用形).
     */
    conjForm?: string | null;
    /**
     * Why the surface is one lookup chip.
     */
    kind: 'word' | 'compound' | 'inflected' | 'counter' | 'expression' | 'function' | 'symbol';
    /**
     * Grammatical construction of the chip.
     */
    morphemes?: Array<{
        surface?: string;
        pos?: Array<string>;
        lemma?: string | null;
        reading?: string | null;
        conjType?: string | null;
        conjForm?: string | null;
    }>;
    /**
     * Conservative independently meaningful B-mode parts of a compound or counter.
     */
    components?: Array<TokenComponent>;
};
/**
 * Japanese texts to segment using the caller's active dictionary stack.
 */
export type ParseRequest = {
    /**
     * One or more non-blank texts. Each item produces one index-aligned item in
     * `results`. Their combined length counts against the caller's tokenization
     * limits reported by `GET /api/v1/me`.
     *
     */
    texts: Array<string>;
    /**
     * Optional token details. `study` contains private card state and requires
     * `user:study:read`; the other values require only `user:dictionary:read`.
     *
     */
    include?: Array<'furigana' | 'morphology' | 'study'>;
    /**
     * Ordered dictionary sources to use for this parse, such as `jmdict:en`.
     */
    sources?: Array<string>;
};
/**
 * One preferred, dictionary-aware tokenization for every submitted text.
 */
export type Parse = {
    /**
     * Fingerprint of the active dictionary stack used to choose token boundaries.
     */
    stackFingerprint: string;
    /**
     * Revision of the public dictionary pack whose data the parser used.
     */
    packRevision: string;
    /**
     * Ordered dictionary and definition-language sources used for this parse.
     */
    sources: Array<string>;
    /**
     * Tokenization results in the same order as the request's `texts`.
     */
    results: Array<{
        /**
         * The submitted text represented by this result.
         */
        text: string;
        /**
         * The preferred segmentation in reading order.
         */
        tokens: Array<ParseToken>;
    }>;
};
/**
 * One token from Shirabe's preferred, dictionary-aware segmentation.
 */
export type ParseToken = {
    /**
     * Inclusive start in UTF-16 code units.
     */
    startOffset: number;
    /**
     * Exclusive end in UTF-16 code units.
     */
    endOffset: number;
    /**
     * Text exactly as it appears in the input.
     */
    surface: string;
    /**
     * Preferred dictionary form when one is available.
     */
    lemma?: string;
    /**
     * Katakana reading of this occurrence when available.
     */
    reading?: string;
    /**
     * Short machine-readable part-of-speech tag.
     */
    partOfSpeech?: string;
    /**
     * Why this surface forms one lookup token.
     */
    kind: 'word' | 'compound' | 'inflected' | 'counter' | 'expression' | 'function' | 'symbol';
    /**
     * Meaningful parts retained inside a merged token.
     */
    components?: Array<{
        surface: string;
        startOffset: number;
        endOffset: number;
        lemma?: string;
        reading?: string;
        partOfSpeech?: Array<string>;
    }>;
    /**
     * How this occurrence reaches its dictionary form.
     */
    inflection?: {
        base: string;
        /**
         * Ordered outermost-first.
         */
        forms: Array<{
            code: string;
            label: string;
        }>;
    };
    /**
     * Present only with `include: ["furigana"]` and when ruby is needed.
     */
    furigana?: Array<{
        text: string;
        ruby?: string;
    }>;
    /**
     * Present only with `include: ["morphology"]`.
     */
    morphology?: {
        label?: string;
        partOfSpeech?: Array<string>;
        conjugationType?: string;
        conjugationForm?: string;
    };
    /**
     * Present only with `include: ["study"]`; requires `user:study:read`.
     */
    study?: {
        state: string;
        decks: Array<{
            id?: number;
            name?: string;
        }>;
        cardId?: number;
        cardCount?: number;
        savedSenses?: Array<string>;
        savedWholeWord?: boolean;
        intervals?: {
            [key: string]: unknown;
        };
    };
};
export type ParseOperation = {
    id: string;
    status: 'queued' | 'running';
    textCount: number;
    submittedAt: string;
    startedAt?: string;
    expiresAt: string;
} | {
    id: string;
    status: 'done';
    textCount: number;
    submittedAt: string;
    startedAt?: string;
    finishedAt: string;
    expiresAt: string;
    result: Parse;
} | {
    id: string;
    status: 'failed';
    textCount: number;
    submittedAt: string;
    startedAt?: string;
    finishedAt: string;
    expiresAt: string;
    error: {
        code: 'PARSE_FAILED';
        detail: 'The parse operation could not be completed.';
    };
};
/**
 * A word's learning status in the API key owner's SRS, weakest → strongest.
 * `none` means the user has no card for the word yet. `suspended` is a card the
 * user has shelved out of review (off the queue and off the free card cap).
 * `retired` is the terminal tier, done studying, still counted as known.
 *
 */
export type WordState = 'none' | 'new' | 'learning' | 'due' | 'suspended' | 'retired';
/**
 * One generated card with its own schedule and review revision. Siblings share a note, not progress.
 */
export type Card = {
    /**
     * Submit this revision when grading this card.
     */
    revision: string;
    id: number;
    note: {
        id: number;
        /**
         * Plain-text label from the mapped expression, first nonempty text field, or note-type name. Not a rendered card face.
         */
        title: string;
        type: {
            id: number;
            name: string;
            kind: 'standard' | 'cloze';
        };
        /**
         * Ordered source fields, preserving HTML and media references. These values are not rendered card faces.
         */
        fields: Array<{
            name: string;
            value: string;
        }>;
        tags: Array<string>;
        /**
         * Mapped expression field. Omitted when empty or unmapped; may contain source HTML.
         */
        headword?: string;
        /**
         * Mapped reading field. Omitted when empty or unmapped; may contain source HTML.
         */
        reading?: string;
        /**
         * Mapped meaning field, not the rendered answer. Omitted when empty or unmapped; may contain source HTML.
         */
        meaning?: string;
        /**
         * Whether the dictionary definition has changed since the note last took it. Shared by every sibling card; not a scheduling signal.
         */
        driftFlagged: boolean;
        /**
         * Dictionary-qualified sense references covered by the note. Omitted for a whole-word note.
         */
        senses?: Array<string>;
    };
    template: {
        id: number;
        name: string;
        /**
         * Zero-based template ordinal within the note type, not the cloze number.
         */
        ordinal: number;
    };
    /**
     * The card's one-based cloze number (c1, c3, etc.). Omitted for standard cards.
     */
    clozeNumber?: number;
    state: WordState;
    /**
     * Human-readable schedule stage (New, Apprentice, Proficient, Master, Known, Suspended).
     */
    srsStage: string;
    /**
     * Next review time. Omitted for new, retired, and suspended cards.
     */
    due?: string;
    /**
     * True when the card has lapsed past the leech threshold. Omitted when false.
     */
    leech?: boolean;
    deck: {
        id: number;
        name: string;
    };
};
/**
 * A single SRS card, as the write endpoints echo it back.
 */
export type CardResponse = {
    card: Card;
};
/**
 * A word to save as a review card. Identity is `(deck, lemma, reading)`, so
 * re-saving a word you already have is idempotent. To pin the exact dictionary
 * entry (rather than let the server auto-link by lemma+reading), pass the
 * portable `(dictionarySlug, sourceId)` handle. This endpoint saves and mines
 * only, to grade a due card, use `POST /api/v1/srs/reviews`.
 *
 */
export type SaveRequest = {
    /**
     * Dictionary form to save.
     */
    lemma: string;
    reading?: string;
    /**
     * Exact inflected form seen by the learner; the card identity remains the dictionary-form lemma.
     */
    surface?: string;
    /**
     * Your own definition, used ONLY when the save has no dictionary entry to
     * follow. A linked card composes its meaning from the entry's senses, so a
     * value sent here is ignored for one.
     *
     */
    meaning?: string;
    /**
     * Target deck. Defaults to the owner's "Saved words" deck.
     */
    deckId?: number;
    /**
     * Create a deck with this name and save into it. Wins over `deckId` when both
     * are sent, matching the web form, a card can arrive with its own deck
     * without a detour through the decks screen.
     *
     */
    newDeckName?: string;
    /**
     * A nudge shown on the card's front. Omit to leave an existing card's hint alone; send an empty string to clear it.
     */
    hint?: string;
    /**
     * The learner's own note, shown on the answer face. Same omit/clear rule as `hint`.
     */
    notes?: string;
    /**
     * With `sourceId`, the portable handle to the exact dictionary entry to link. Omit to auto-link by lemma+reading.
     */
    dictionarySlug?: string;
    /**
     * The entry's stable in-dictionary id (paired with `dictionarySlug`).
     */
    sourceId?: string;
    /**
     * Which senses this card covers, each `"<dictionary slug>#<that dictionary's
     * own 0-based sense number>"` (e.g. `"jmdict#2"`). A bare number would not
     * say which book counted it, and a card may cover senses from any dictionary
     * the reader has stacked. Omitted for a whole-word card, which covers every
     * sense.
     *
     */
    senses?: Array<string>;
    /**
     * Every example this card should carry, in order, a card links a list, and
     * the web form's picker is multi-select. Each entry is mined exactly like the
     * singular `sentence` below (which is shorthand for a one-element list): the
     * owner's sentence bank is reused when the same text is already there, and a
     * row may carry its own clip and screenshot. Sending this key REPLACES the
     * card's examples; omit it to leave them alone.
     *
     */
    sentences?: Array<SaveSentence>;
    sentence?: SaveSentence;
    /**
     * Shorthand for the singular `sentence`'s screenshot, the shape the reader
     * already posts. Ignored when `sentences[]` is used; put the media on the row.
     *
     */
    imageDataUrl?: string;
    /**
     * Shorthand for the singular `sentence`'s clip. Same rule as `imageDataUrl`.
     */
    audioDataUrl?: string;
};
/**
 * Grade one of the caller's cards. Address the card by `cardId`, or by `lemma`
 * (+ optional `reading`) to grade the currently-due card for that word, the
 * reader's inline-grade path (rejected when the word isn't due).
 *
 */
export type ReviewRequest = {
    /**
     * API study session owning this grade. Requires cardId and rejects cards that are not next in its queue. Omit for standalone dictionary reviews.
     */
    sessionId?: number;
    /**
     * Revision returned with the displayed card. A changed card requires a fresh read before grading.
     */
    revision: string;
    /**
     * The card to grade. Provide this or `lemma`.
     */
    cardId?: number;
    /**
     * Grade the currently-due card for this dictionary form, an alternative to `cardId`.
     */
    lemma?: string;
    /**
     * Disambiguating reading for `lemma`.
     */
    reading?: string;
    /**
     * 1=Again, 2=Hard, 3=Good, 4=Easy.
     */
    rating: number;
};
/**
 * Set a word's learning state. `retired` parks it as learned (out of review);
 * `reviewing` brings it into the SRS rotation; `suspended` shelves it (off the
 * queue and the free card cap). To pin the exact dictionary entry, pass the
 * portable `(dictionarySlug, sourceId)` handle.
 *
 */
export type StateRequest = {
    lemma: string;
    /**
     * One of: retired, reviewing, suspended.
     */
    state: 'retired' | 'reviewing' | 'suspended';
    reading?: string;
    meaning?: string;
    deckId?: number;
    /**
     * With `sourceId`, the portable handle to the exact dictionary entry to link.
     */
    dictionarySlug?: string;
    /**
     * The entry's stable in-dictionary id (paired with `dictionarySlug`).
     */
    sourceId?: string;
};
/**
 * A batch of words to read state for, in one round-trip.
 */
export type StateLookupRequest = {
    /**
     * Dictionary forms, as bare strings or { lemma } objects.
     */
    words: Array<string | {
        lemma: string;
    }>;
};
/**
 * Per-word learning state for a batch lookup.
 */
export type StateList = {
    states: Array<WordStateEntry>;
};
/**
 * One of the owner's decks, with its card counts.
 */
export type Deck = {
    id: number;
    name: string;
    visibility: 'personal' | 'school';
    /**
     * Card counts; `new` is capped by the deck's new-per-day, like the study UI.
     */
    counts: {
        total: number;
        new: number;
        due: number;
        learning: number;
        review: number;
    };
};
/**
 * The owner's decks.
 */
export type DeckList = {
    decks: Array<Deck>;
};
/**
 * Create or update a deck. On update, only the given fields change.
 */
export type DeckRequest = {
    name?: string;
    /**
     * New cards introduced per day (>= 0).
     */
    newPerDay?: number;
    /**
     * FSRS target retention, between 0.5 and 1.0 (exclusive).
     */
    desiredRetention?: number;
};
/**
 * A single deck, as the deck write endpoints echo it back.
 */
export type DeckResponse = {
    deck: Deck;
};
/**
 * Edit the addressed card's shared note or its individual lifecycle. `meaning`,
 * `refresh`, `keepMine`, and `senses` change the note for every sibling card.
 * `lifecycle` changes only the addressed card. Imported source fields use the
 * note editor; these definition commands apply to dictionary-backed notes.
 * Send exactly one command per request.
 *
 */
export type CardUpdateRequest = {
    /**
     * Your definition text. Stored as a meaning of your own and marks the note
     * user-owned, which stops drift tracking.
     *
     */
    meaning?: string;
    /**
     * Take the dictionary's current definition and clear the drift flag.
     */
    refresh?: boolean;
    /**
     * Keep your definition and clear the drift flag.
     */
    keepMine?: boolean;
    /**
     * Which senses this note covers, each `"<dictionary slug>#<that dictionary's
     * own 0-based sense number>"` (e.g. `"jmdict#2"`). A bare number would not
     * say which book counted it, and a note may cover senses from any dictionary
     * the reader has stacked. Send an empty list to cover the whole word; omit
     * this property to leave the note's scope unchanged.
     *
     */
    senses?: Array<string>;
    /**
     * Move the card through its lifecycle: `suspend` shelves it out of review
     * (off the queue and the free card cap), `resume` returns it.
     *
     */
    lifecycle?: 'suspend' | 'resume';
};
/**
 * A personal annotation on a word, separate from a study note and its cards.
 */
export type WordNote = {
    id: number;
    /**
     * The word the note is attached to.
     */
    text: string;
    /**
     * Kana reading. Omitted when the note applies to any reading.
     */
    reading?: string;
    body: string;
    updatedAt: string;
};
/**
 * The owner's notes (optionally filtered to one word).
 */
export type WordNoteList = {
    wordNotes: Array<WordNote>;
    pagination: CursorPagination;
};
/**
 * Upsert a word annotation, keyed by (text, reading).
 */
export type WordNoteRequest = {
    text: string;
    reading?: string;
    body: string;
};
/**
 * A single note, as the upsert endpoint echoes it back.
 */
export type WordNoteResponse = {
    wordNote: WordNote;
};
/**
 * A page of the owner's saved cards.
 */
export type CardList = {
    cards: Array<Card>;
    pagination: CursorPagination;
};
/**
 * Eligible study cards within daily limits, including linked Anki learning ahead.
 */
export type DueQueue = {
    /**
     * Up to `limit` cards. Linked Anki cards follow their captured display settings.
     */
    cards: Array<Card>;
    /**
     * Totals available (not just this batch).
     */
    counts: {
        due: number;
        new: number;
    };
};
/**
 * The owner's study stats, the /api/v1 twin of the website's /stats.
 */
export type Stats = {
    /**
     * Current consecutive-day study streak.
     */
    streak: number;
    longestStreak: number;
    /**
     * Distinct calendar days with a review.
     */
    daysStudied: number;
    reviewsTotal: number;
    reviewsDue: number;
    newAvailable: number;
    /**
     * Mature (FSRS) plus retired cards, the whole knowledge set.,
     */
    knownWords: number;
    knownKanji: number;
    totalCards: number;
    /**
     * Correct-rate over the last 7 days, as a percentage.
     */
    accuracy7d: number;
    /**
     * Card counts by SRS stage.
     */
    srsDistribution: {
        New: number;
        Apprentice: number;
        Proficient: number;
        Master: number;
    };
};
/**
 * A full KANJIDIC character entry.
 */
export type Kanji = {
    character: string;
    strokes?: number | null;
    levels: {
        grade: number | null;
        jlpt: string | null;
        kanken: string | null;
    };
    /**
     * Newspaper-frequency rank; lower values are more frequent.
     */
    frequencyRank?: number | null;
    meanings: Array<Definition>;
    readings: {
        on: Array<string>;
        kun: Array<string>;
        nanori: Array<string>;
        /**
         * Present when `include=foreignReadings`.
         */
        foreign?: {
            pinyin?: Array<string>;
            koreanH?: Array<string>;
            koreanR?: Array<string>;
            vietnam?: Array<string>;
        };
    };
    classification: {
        radical: Radical | null;
        components: Array<string>;
        /**
         * Ideographic Description Sequence.
         */
        structure: string | null;
    };
    etymology?: {
        text?: string;
        rikusho?: string;
        via?: string | null;
        source?: string;
    } | null;
    lookalikes: Array<string>;
    /**
     * Present when `include=references`.
     */
    references?: {
        dictRefs?: unknown;
        queryCodes?: unknown;
        codepoints?: unknown;
        variants?: unknown;
    };
};
export type KanjiResponse = {
    kanji: Kanji;
    relationships: {
        compounds?: Array<KanjiCompound>;
        readingExamples?: Array<{
            reading: string;
            words: Array<{
                headword: string;
                reading: string;
            }>;
        }>;
        lookalikes?: Array<KanjiSummary>;
        relatedKanji?: KanjiRelationshipPreview;
        radicalMembers?: KanjiRelationshipPreview;
        strokeOrder?: {
            svg: string | null;
            composition: {
                [key: string]: unknown;
            } | null;
        };
    };
};
/**
 * Lightweight JMdict reference for the kanji compounds list.
 */
export type KanjiCompound = {
    /**
     * Stable word-card identifier accepted by `GET /api/v1/words/{id}`.
     */
    id: string;
    headword: string;
    reading?: string | null;
    definitions: Array<Definition>;
};
/**
 * A bounded relationship preview and the route for retrieving the complete collection.
 */
export type KanjiRelationshipPreview = {
    count: number;
    items: Array<KanjiSummary>;
    /**
     * Relative API route for the complete collection, or null when the preview is complete.
     */
    next: string | null;
};
/**
 * Compact KANJIDIC entry for index pages. Carries the at-a-glance
 * fields the kanji-index grid renders. Call `/api/v1/kanji/{character}` for
 * the full record (readings, meanings, compounds).
 *
 */
export type KanjiSummary = {
    character: string;
    strokes?: number | null;
    levels: {
        grade: number | null;
        jlpt: string | null;
        kanken: string | null;
    };
    frequencyRank?: number | null;
};
/**
 * Browseable KANJIDIC index, grouped by the chosen field.
 * `count` is the total number of kanji surfaced after any filter is
 * applied (sums across groups).
 *
 */
export type KanjiIndex = {
    groupBy: 'jlpt' | 'kanken' | 'strokes' | 'radical' | 'frequency';
    count: number;
    groups: Array<KanjiIndexGroup>;
};
/**
 * One section of the kanji index. `value` is the raw grouping value
 * (integer for strokes/radical, "Nx" string for jlpt, level string for
 * kanken, frequency bucket symbol for frequency, null for unsorted).
 * When ordered by `radical`, a `radical` object is included so clients
 * don't need a second round trip to render the section header.
 *
 */
export type KanjiIndexGroup = {
    /**
     * Grouping value; its type depends on `groupBy`.
     */
    value: number | string | null;
    /**
     * Present when `groupBy=radical`. The radical for this group.
     */
    radical?: Radical;
    /**
     * Total characters in this group before pagination or previewing.
     */
    count: number;
    kanji: Array<KanjiSummary>;
    /**
     * Present when `filter[group]` selects this group.
     */
    pagination?: CursorPagination;
};
/**
 * One radical (部首). The `number` field (1-214) is the stable
 * identifier, a few radicals have multiple Unicode glyph forms, but the
 * number is stable. `variants` lists alternate forms (e.g. 氵 and ⺡ for
 * radical 85, water).
 *
 */
export type Radical = {
    number: number;
    /**
     * Canonical display glyph.
     */
    glyph: string;
    strokes: number;
    meaning?: string | null;
    /**
     * Japanese name (hiragana).
     */
    jpName?: string | null;
    romaji?: string | null;
    /**
     * Position-of-use label (へん, つくり, etc.).
     */
    positionJp?: string | null;
    positionRomaji?: string | null;
    /**
     * Alternate Unicode forms of this radical, when any.
     */
    variants?: Array<RadicalVariant>;
};
/**
 * An alternate Unicode form of a canonical radical.
 */
export type RadicalVariant = {
    glyph: string;
    meaning?: string | null;
    jpName?: string | null;
    romaji?: string | null;
    positionJp?: string | null;
    positionRomaji?: string | null;
};
/**
 * Radical forms grouped like the website chart.
 */
export type RadicalIndex = {
    groupBy: 'strokes' | 'number' | 'position';
    /**
     * Total displayed radical forms, including variants.
     */
    count: number;
    groups: Array<{
        value: number | string | null;
        radicals: Array<RadicalCell>;
    }>;
};
/**
 * One displayed radical form, linked to its radical number.
 */
export type RadicalCell = {
    radicalNumber: number;
    glyph: string | null;
    strokes: number;
    meaning: string | null;
    jpName: string | null;
    variant: boolean;
    position: string | null;
    shape: {
        path: string;
        viewBox: string;
    } | null;
};
export type RadicalResponse = {
    radical: Radical;
    /**
     * KANJIDIC characters using this radical.
     */
    kanji: Array<KanjiSummary>;
    count: number;
    pagination: CursorPagination;
};
/**
 * A glyph used for component-based kanji discovery.
 */
export type KanjiComponent = {
    glyph: string;
    strokes: number;
    meaning?: string | null;
    jpName?: string | null;
    romaji?: string | null;
};
export type KanjiComponentIndex = {
    count: number;
    groups: Array<{
        strokes: number;
        components: Array<KanjiComponent>;
    }>;
};
export type KanjiComponentMatches = {
    components: Array<string>;
    /**
     * Total matches before the response limit is applied.
     */
    count: number;
    groups: Array<{
        strokes: number | null;
        matches: Array<KanjiSummary>;
    }>;
    /**
     * Components that can still narrow the current selection.
     */
    availableComponents: Array<string>;
    pagination: CursorPagination;
};
/**
 * The API key owner's profile, limits, and SRS entitlement.
 */
export type Me = {
    user: {
        name: string;
        displayName: string;
        memberDays: number;
        admin: boolean;
    };
    /**
     * Budgets that refill. Exceeding one answers 429 `RATE_LIMIT_EXCEEDED` with a `Retry-After`, so the request is fine and the timing is not.
     */
    rateLimit: {
        requestsPerMinute: number;
        /**
         * Parsing is charged by the character, because one call carries one text or two hundred. It spends this budget AND a request from the count above.
         */
        tokenizationCharactersPerMinute: number;
    };
    /**
     * What one request may carry, which is not a budget: over it is 413 `TEXT_TOO_LARGE`, there is no `Retry-After`, and waiting changes nothing. Split the text, or send it as a `texts` batch whose combined length fits.
     */
    payloadLimit: {
        tokenizationCharactersPerRequest: number;
    };
    /**
     * What THIS credential may do, which is a different question from what its owner may do. A connected app compares its own requirements against `scopes` to find out that it needs the reader to re-approve, on a call it is already making, instead of discovering it from a 403 in front of them.
     */
    credential: {
        /**
         * A personal API key, or an app acting under an OAuth grant.
         */
        kind: 'api_key' | 'oauth';
        /**
         * The scopes this credential carries. A subset of what the owner could grant.
         */
        scopes: Array<string>;
        /**
         * The registered name of the app behind an OAuth grant. Absent on a personal API key, which has no app behind it to name.
         */
        client?: string;
    };
    /**
     * SRS entitlement, the same predicate the write endpoints gate on: a Pro subscription or a school membership. Clients (e.g. the browser extension) gate their write features on `srs`.
     */
    entitlement: {
        /**
         * True when the owner may write to the SRS (Pro or a school member).
         */
        srs: boolean;
        /**
         * True when the owner holds a Pro subscription (excludes school-only entitlement).
         */
        subscribed: boolean;
        plan: string;
    };
};
/**
 * A token request (RFC 6749 §4.1.3, §6; RFC 8628 §3.4). Which fields matter
 * depends on `grant_type`; the rest are ignored. `client_id` is always
 * required unless the client authenticates with HTTP Basic; `client_secret`
 * is required for a confidential client.
 *
 */
export type OauthTokenRequest = {
    /**
     * `authorization_code`, `refresh_token`, `client_credentials` or `urn:ietf:params:oauth:grant-type:device_code`. Anything else answers `unsupported_grant_type`.
     */
    grant_type: string;
    /**
     * The registered client id.
     */
    client_id?: string;
    /**
     * For a confidential client. Or send both as HTTP Basic instead.
     */
    client_secret?: string;
    /**
     * `authorization_code`: the one-time code received on the redirect.
     */
    code?: string;
    /**
     * `authorization_code`: the PKCE verifier whose S256 hash was sent to /oauth/authorize.
     */
    code_verifier?: string;
    /**
     * `authorization_code`: must match the redirect_uri used to obtain the code.
     */
    redirect_uri?: string;
    /**
     * The protected resource requested. It must match the authorization grant, or is bound to a client-credentials token.
     */
    resource?: string;
    /**
     * `refresh_token`: the refresh token from the last pair. Single-use.
     */
    refresh_token?: string;
    /**
     * device grant: the `device_code` from /oauth/device_authorization.
     */
    device_code?: string;
};
/**
 * A fresh access token. User-delegated grants also include a single-use refresh token.
 */
export type OauthTokenResponse = {
    /**
     * Send as `Authorization: Bearer …`. Lives `expires_in` seconds.
     */
    access_token: string;
    token_type: 'Bearer';
    /**
     * Seconds until the access token expires.
     */
    expires_in: number;
    /**
     * User-delegated grants only. Trade for the next pair at this endpoint; single-use and rotating.
     */
    refresh_token?: string;
    /**
     * The granted scopes, space-separated.
     */
    scope: string;
};
/**
 * A revocation request (RFC 7009 §2.1).
 */
export type OauthRevokeRequest = {
    /**
     * An access token or refresh token the client holds. Its whole grant is revoked.
     */
    token: string;
    /**
     * Optional, and unnecessary here (both kinds are recognised by prefix).
     */
    token_type_hint?: 'access_token' | 'refresh_token';
    client_id?: string;
    /**
     * For a confidential client. Or send both as HTTP Basic instead.
     */
    client_secret?: string;
};
/**
 * Start the device flow (RFC 8628 §3.1).
 */
export type OauthDeviceAuthorizationRequest = {
    client_id: string;
    /**
     * For a confidential client.
     */
    client_secret?: string;
    /**
     * Space-separated. Narrowed to what the client registered for; omitted means the default read set.
     */
    scope?: string;
    /**
     * The Shirabe protected resource the resulting tokens may access.
     */
    resource?: string;
};
/**
 * A started device handshake (RFC 8628 §3.2).
 */
export type OauthDeviceAuthorization = {
    /**
     * Poll the token endpoint with this. Never shown to the user.
     */
    device_code: string;
    /**
     * Show this to the user; they type it on `verification_uri`.
     */
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    /**
     * Seconds until the handshake expires.
     */
    expires_in: number;
    /**
     * Minimum seconds between polls.
     */
    interval: number;
};
/**
 * A failure at an OAuth endpoint: RFC 6749 §5.2 / RFC 8628 §3.5 `error` and
 * `error_description`, alongside the same problem fields every other error
 * carries. `code` is `error` upper-cased.
 *
 */
export type ErrorOauth = {
    type: string;
    title: string;
    status: 400 | 401;
    detail?: string;
    code: 'INVALID_CLIENT' | 'INVALID_GRANT' | 'INVALID_SCOPE' | 'INVALID_TARGET' | 'UNSUPPORTED_GRANT_TYPE' | 'AUTHORIZATION_PENDING' | 'SLOW_DOWN' | 'ACCESS_DENIED' | 'EXPIRED_TOKEN';
    error: 'invalid_client' | 'invalid_grant' | 'invalid_scope' | 'invalid_target' | 'unsupported_grant_type' | 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token';
    error_description?: string;
    instance: string;
};
/**
 * The code dictionary resolving coded fields to labels + descriptions.
 */
export type TagList = {
    tags: Array<{
        /**
         * The dictionary slug. Absent only for global tags; codes are unique within a dictionary and category.
         */
        dictionary?: string;
        code: string;
        category: string;
        label: string;
        description?: string;
    }>;
};
/**
 * Dictionaries available to this credential.
 */
export type DictionaryList = {
    dictionaries: Array<Dictionary>;
};
export type Dictionary = {
    slug: string;
    name: string;
    /**
     * The content this dictionary contributes.
     */
    kind: 'definition' | 'name' | 'encyclopedia' | 'kanji' | 'sentence' | 'pitch' | 'frequency' | 'jlpt' | 'metadata';
    visibility: 'official' | 'personal';
    languages: Array<string>;
    entryCount: number | null;
    capabilities: Array<'search' | 'definitions' | 'names' | 'encyclopedia' | 'kanji' | 'sentences' | 'pitch' | 'frequency' | 'jlpt' | 'metadata' | 'offline'>;
    attribution: DictionaryAttribution | null;
};
export type DictionaryAttribution = {
    text?: string;
    source: {
        name: string;
        url: string;
    } | null;
    license: {
        name: string;
        url?: string;
    } | null;
};
export type DictionaryStack = {
    dictionaryStack: {
        fingerprint: string;
        sources: Array<DictionaryStackSource>;
    };
};
export type DictionaryStackSource = {
    /**
     * A slug returned by `GET /api/v1/dictionaries`.
     */
    dictionary: string;
    languages: Array<string>;
    reveal: 'show' | 'hover';
};
export type DictionaryImport = {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    phase: string | null;
    filename: string | null;
    progress: {
        processed: number;
        total: number;
        percent: number;
    } | null;
    dictionary: {
        slug: string;
        name: string;
    } | null;
    error: {
        code: string;
        message: string;
    } | null;
    createdAt: string;
    updatedAt: string;
};
export type DictionaryPackManifest = {
    kind?: 'base' | 'overlay';
    schemaVersion: number;
    buildRecipeVersion: number;
    minimumExtensionVersion: string;
    contentRevision: string;
    builtAt: string;
    artifact: string;
    compression: 'gzip';
    mediaType: 'application/x-ndjson';
    bytes: number;
    sha256: string;
    downloadUrl: string;
    counts: {
        terms: number;
        kanji: number;
        sentences: number;
    };
    /**
     * How to name a pronunciation clip, instead of shipping a pre-hashed URL on
     * every pitch row. The client hashes `reading · accent · speaker ·
     * engineVersion · salt` (joined by `separator`, SHA-256, hex) and builds
     * `{baseUrl}/{path}/{digest}.{extension}`. None of it is secret: the pack
     * published every URL it named, against a public-read bucket.
     *
     */
    audio: {
        baseUrl: string;
        path: string;
        extension: string;
        separator: string;
        engineVersion: number;
        salt: string;
        defaultVoice: string;
        voices: {
            [key: string]: number;
        };
    };
    languages: Array<string>;
    dictionaries: Array<{
        slug: string;
        version?: string | null;
        languages?: Array<string>;
    }>;
    modifications: Array<string>;
    sources: Array<{
        name: string;
        url: string;
        license: string;
        licenseUrl?: string;
    }>;
};
export type DictionaryStackManifest = {
    dictionaryStack: DictionaryStack2;
    packs: Array<DictionaryPackManifest & {
        kind: 'base' | 'overlay';
    }>;
    /**
     * Personal dictionary slugs whose offline pack is building. The dictionary remains available for online lookup.
     */
    pendingPacks?: Array<string>;
};
/**
 * One official-corpus example sentence.
 */
export type Sentence = {
    /**
     * Stable sentence handle accepted by `GET /api/v1/sentences/{id}`.
     */
    id: string;
    japanese: string;
    translations: Array<{
        lang: string;
        text: string;
    }>;
    source: SentenceSource;
    /**
     * Japanese spans responsible for this result. Empty for translation searches and direct retrieval.
     */
    matches: Array<SentenceMatch>;
    /**
     * Present only with `include=tokens`. Offsets use inclusive/exclusive UTF-16 code units.
     */
    tokens?: Array<SentenceToken>;
};
export type SentenceSource = {
    dictionary: string;
    name: string;
    sourceId: string;
    url?: string;
};
export type SentenceMatch = {
    surface: string;
    startOffset: number;
    endOffset: number;
    /**
     * Word handle accepted by `GET /api/v1/words/{id}`.
     */
    wordId?: string;
};
export type SentenceToken = {
    surface: string;
    lemma: string;
    /**
     * Word handle accepted by `GET /api/v1/words/{id}`.
     */
    wordId?: string;
    startOffset: number;
    endOffset: number;
    content: boolean;
    matched: boolean;
};
/**
 * Paginated example-sentence search results.
 */
export type SentenceList = {
    /**
     * The submitted text query, or null when searching only by word ID.
     */
    query: string | null;
    sentences: Array<Sentence>;
    pagination: CursorPagination;
};
export type SentenceResponse = {
    sentence: Sentence;
};
/**
 * Full detail for one selected word.
 */
export type WordDetail = {
    word: WordCard;
    /**
     * Other words written with the same headword, ordered by their dictionary ranking. Each id appears once.
     */
    homographs: Array<{
        /**
         * Word handle accepted by `GET /api/v1/words/{id}`.
         */
        id: string;
        headword: string;
        reading?: string | null;
    }>;
    /**
     * Up to 20 preview sentences, present only with `include=sentences`. Use `/sentences` for filtering and pagination.
     */
    sentences?: Array<Sentence>;
};
/**
 * A word card merged from the API key owner's active dictionary stack.
 */
export type WordCard = {
    /**
     * Word handle accepted by `GET /api/v1/words/{id}`.
     */
    id: string;
    headword: string;
    reading?: string | null;
    /**
     * Reading aligned to the headword. Kana-only runs omit `ruby`.
     */
    furigana: Array<{
        text: string;
        ruby?: string;
    }>;
    common: boolean;
    jlpt?: string | null;
    /**
     * Corpus rank, where a lower number is more common.
     */
    frequency?: number | null;
    pitch: Array<{
        downstep: number;
        pattern: 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka';
        /**
         * Pre-generated recording of this reading and accent, or null when unavailable.
         */
        audioUrl?: string | null;
        /**
         * Verified published MP3 for offline use. Absent when unavailable.
         */
        audioDownloadUrl?: string;
        /**
         * True when the accent is an automatic estimate rather than a dictionary record.
         */
        autogenerated?: boolean;
    }>;
    forms: Array<Form>;
    /**
     * Dictionary contributions in the owner's source-stack order.
     */
    entries: Array<Entry>;
};
/**
 * A cross-reference to another entry (related word, antonym, see-also).
 */
export type CrossReference = {
    text: string;
    reading?: string | null;
    /**
     * Publisher's target-sense marker. Display separately from the text used for lookup.
     */
    label?: string;
};
/**
 * Signed opaque pagination. Echo `cursor` back for the next page without inspecting
 * or changing it, using the same operation and filters. Ranked collections tie
 * cursors to the data version that produced them. If that data changes, the
 * endpoint returns `409 CURSOR_EXPIRED` and the client must restart from the first page.
 * Offset-backed collections stop after 10000 results with `400 CURSOR_TOO_DEEP`.
 *
 */
export type CursorPagination = {
    hasMore: boolean;
    /**
     * Opaque token. Send it in the next request's `cursor` field or query
     * parameter, as documented by that operation. Null when there are no more
     * pages. Do not reuse it with another operation or another set of filters.
     *
     */
    cursor: string | null;
};
/**
 * RFC 9457 "Problem Details" response body. Switch on `code` for
 * programmatic handling; `type`/`title`/`detail` are for humans.
 *
 */
export type ErrorBase = {
    /**
     * URI identifying the error category.
     */
    type: string;
    title: string;
    status: number;
    detail?: string;
    code: string;
    /**
     * Request ID, useful for support correlation.
     */
    instance: string;
};
/**
 * RFC 9457 "Problem Details" response body. Switch on `code` for
 * programmatic handling; `type`/`title`/`detail` are for humans. Per-status
 * schemas (Error400…Error429) narrow `code`/`status` to that status.
 *
 */
export type Error = {
    type: string;
    title: string;
    status: number;
    detail?: string;
    code: string;
    /**
     * Request ID, useful for support correlation.
     */
    instance: string;
    /**
     * Optional field→message map for validation failures.
     */
    errors?: {
        [key: string]: string;
    };
};
/**
 * Bad request / validation failure.
 */
export type Error400 = {
    type: string;
    title: string;
    status: 400;
    detail?: string;
    code: 'BAD_REQUEST' | 'VALIDATION_FAILED' | 'DECK_IMPORTING' | 'INVALID_CURSOR' | 'CURSOR_TOO_DEEP';
    instance: string;
    /**
     * Field errors keyed by attribute, or schema-validation errors with JSON pointers.
     */
    errors?: {
        [key: string]: string;
    } | Array<{
        message: string;
        code: string;
        pointer?: string;
        parameter?: string;
        header?: string;
        cookie?: string;
    }>;
};
/**
 * Missing, invalid, expired, or revoked bearer token (API key or OAuth access token).
 */
export type Error401 = {
    type: string;
    title: string;
    status: 401;
    detail?: string;
    code: 'TOKEN_REQUIRED' | 'INVALID_TOKEN';
    instance: string;
};
/**
 * The action needs a paid plan. The SRS is Pro (docs/srs.md §10).
 */
export type Error402 = {
    type: string;
    title: string;
    status: 402;
    detail?: string;
    code: 'PRO_REQUIRED';
    instance: string;
};
/**
 * The API key lacks a scope required for this operation.
 */
export type Error403 = {
    type: string;
    title: string;
    status: 403;
    detail?: string;
    code: 'INSUFFICIENT_SCOPE' | 'FEATURE_DISABLED' | 'ORIGIN_NOT_ALLOWED';
    instance: string;
};
/**
 * Resource not found.
 */
export type Error404 = {
    type: string;
    title: string;
    status: 404;
    detail?: string;
    code: 'NOT_FOUND';
    instance: string;
};
/**
 * The path exists, but not for this request method.
 */
export type Error405 = {
    type: string;
    title: string;
    status: 405;
    detail?: string;
    code: 'METHOD_NOT_ALLOWED';
    instance: string;
};
/**
 * The request body uses a media type this operation does not accept.
 */
export type Error415 = {
    type: string;
    title: string;
    status: 415;
    detail?: string;
    code: 'UNSUPPORTED_MEDIA_TYPE';
    instance: string;
};
/**
 * Tokenization input exceeds the per-request character limit, which bounds the
 * work and the memory of ONE request.
 *
 * This is a validation failure, not a throttle, and the difference decides what a
 * client should do about it. There is no `Retry-After`, waiting changes nothing,
 * and the identical request will fail identically forever: split the text and
 * send it as several requests, or as a `texts` batch, where the limit applies to
 * the combined length. The limit that DOES refill answers 429 with
 * `RATE_LIMIT_EXCEEDED` and a `Retry-After`.
 *
 */
export type Error413 = {
    type: string;
    title: string;
    status: 413;
    detail?: string;
    code: 'TEXT_TOO_LARGE';
    instance: string;
};
/**
 * Too many requests. `RATE_LIMIT_EXCEEDED` is the per-minute limit;
 *
 */
export type Error429 = {
    type: string;
    title: string;
    status: 429;
    detail?: string;
    code: 'RATE_LIMIT_EXCEEDED';
    instance: string;
};
/**
 * Opaque installation, snapshot or idempotency key.
 */
export type AnkiSyncKey = string;
export type AnkiSyncProfile = {
    id: number;
    collection_key: string;
    installation_id: string | null;
    snapshot_key: string | null;
    sync_state: 'unpaired' | 'snapshotting' | 'ready' | 'unlinked';
    server_cursor: number;
    delivered_cursor: number;
    acknowledged_cursor: number;
};
/**
 * A submitted revision, identity or retry receipt conflicts with current state.
 */
export type Error409 = {
    type: string;
    title: string;
    status: 409;
    detail?: string;
    code: 'SYNC_CONFLICT' | 'STALE_REVIEW' | 'UNDO_UNAVAILABLE' | 'SESSION_EXPIRED' | 'IMPORT_IN_PROGRESS' | 'CURSOR_EXPIRED' | 'IDEMPOTENCY_CONFLICT' | 'STALE_RESOURCE';
    instance: string;
};
export type ErrorMediaQuota = {
    type: string;
    title: string;
    status: 413;
    code: 'MEDIA_QUOTA_EXCEEDED';
    detail?: string;
    instance: string;
};
/**
 * A durable, atomic batch of source entities. Anki definitions and rows retain
 * unknown properties. Domain validation returns per-entity results; the batch
 * key cannot be reused for different content. Maximum serialized size is 4 MiB.
 *
 */
export type AnkiSyncBatchRequest = {
    key: AnkiSyncKey;
    request_key: AnkiSyncKey;
    /**
     * Native creation rows bound to the dispatched request before acknowledgement. A new Shirabe-owned type also returns owned_type_id and its actual native definition. A mismatched receipt rejects the entire batch.
     */
    creations?: Array<{
        key: AnkiSyncKey;
        delivery_cursor: number;
        captured_at: string;
        owned_type_id?: number;
        definition?: {
            [key: string]: unknown;
        };
        note: {
            [key: string]: unknown;
        };
        cards: Array<{
            [key: string]: unknown;
        }>;
    }>;
    note_types?: Array<{
        [key: string]: unknown;
    }>;
    notes?: Array<{
        [key: string]: unknown;
    }>;
    /**
     * A source deletion sets deleted to true and sends the last source row,
     * the card's base snapshot and its note_base snapshot. Conflicting Shirabe
     * edits require reconciliation. An Anki undo sends the restored row with
     * the accepted deletion snapshot as its base.
     *
     */
    cards?: Array<{
        [key: string]: unknown;
    }>;
    /**
     * Returned Shirabe review receipts include their original delivery_cursor
     * alongside row and sync_id. This distinguishes delivery acknowledgement
     * from source-history capture; it cannot restore an archived review.
     *
     */
    history?: Array<{
        [key: string]: unknown;
    }>;
};
export type Result2 = {
    id: number | null;
    status: 'accepted' | 'rejected' | 'conflict';
    code?: string;
    snapshot?: string;
    conflict_id?: number;
    revision?: number;
    /**
     * Changes through this cursor are included in the accepted card state. Later changes still require delivery. Omitted when the state includes the batch cursor.
     */
    applied_cursor?: number;
    sync_id?: string | null;
    /**
     * True when a late review receipt is accepted for an archived event without restoring its history or schedule.
     */
    removed?: boolean;
    /**
     * The dispatched Undo request whose event removal and schedule were reconciled by this card result.
     */
    review_undo_cursor?: number;
    definition?: {
        [key: string]: unknown;
    };
    /**
     * Advisory source checks for this accepted note-type revision. These do not execute scripts or inspect actual note values or media, and do not change acceptance or establish rendering compatibility.
     */
    template_diagnostics?: Array<{
        template: number;
        side: 'question' | 'answer';
        code: string;
        detail: string;
    }>;
    note?: {
        [key: string]: unknown;
    };
    card?: {
        [key: string]: unknown;
    };
    /**
     * True only when the receipt accepts absence from Anki. A card's deleted field alone describes Shirabe trash, including local hiding.
     */
    source_deleted?: boolean;
    anki?: {
        card_before: {
            [key: string]: unknown;
        };
        card_after: {
            [key: string]: unknown;
        };
        note_guid: string;
        anki_type_id: number;
    };
};
export type AnkiSyncBatchResult = {
    creations?: Array<{
        key: string;
        delivery_cursor: number;
        request_digest: string;
        status: 'accepted';
        note_type?: {
            id: number;
            note_type_id: number;
            revision: number;
            definition: {
                [key: string]: unknown;
            };
        };
        note: {
            id: number;
            snapshot: string;
            note: {
                [key: string]: unknown;
            };
        };
        cards: Array<{
            id: number;
            snapshot: string;
            card: {
                [key: string]: unknown;
            };
        }>;
    }>;
    note_types: Array<Result2>;
    notes: Array<Result2>;
    cards: Array<Result2>;
    history: Array<Result2>;
    cursor: number;
};
export type AnkiSyncReceiptPart = {
    receipt: {
        id: number;
        offset: number;
        total_bytes: number;
        sha256: string;
        /**
         * Up to 4 MiB of the immutable JSON receipt, encoded as base64. Verify its total byte count and SHA-256 before applying any result.
         */
        data: string;
    };
};
export type AnkiMediaFile = {
    id: number;
    filename: string;
    digest: string;
    bytes: number;
    deleted: boolean;
};
export type AnkiCardConflictDetail = {
    id: number;
    key: string;
    code: string;
    resolved: boolean;
    snapshot: string;
    card: {
        [key: string]: unknown;
    };
    history_removal?: {
        rows: Array<{
            [key: string]: unknown;
        }>;
        restored?: Array<{
            row: {
                [key: string]: unknown;
            };
            removal_id: number;
        }>;
    };
    deletion?: {
        note_base: string;
        note: {
            [key: string]: unknown;
        };
    };
    anki: {
        note_guid: string;
        anki_type_id: number;
        card_after: {
            [key: string]: unknown;
        };
    };
};
export type Receipt = {
    id: number;
    offset: number;
    total_bytes: number;
    sha256: string;
    /**
     * Up to 4 MiB of the immutable JSON receipt, encoded as base64. Verify its total byte count and SHA-256 before applying any result.
     */
    data: string;
};
export type AnkiNoteDeletion = {
    id: number;
    note_id: number;
    status: 'pending' | 'dispatched' | 'reconciled' | 'cancelled';
};
export type AnkiReviewUndo = {
    id: number;
    review_id: number;
    status: 'pending' | 'dispatched' | 'cancelled' | 'reconciled';
};
export type ErrorMediaNotReady = {
    type: string;
    title: string;
    status: 503;
    code: 'MEDIA_NOT_READY';
    detail?: string;
    instance: string;
};
export type McpRequest = {
    jsonrpc: '2.0';
    id?: string | number;
    method: string;
    params?: {
        [key: string]: unknown;
    };
};
export type McpResponse = unknown & {
    jsonrpc: '2.0';
    id: string | number;
    result?: {
        [key: string]: unknown;
    };
    error?: {
        code: number;
        message: string;
    };
};
/**
 * A publisher-defined tag, separate from Shirabe's grammatical and usage codes.
 */
export type SourceTag = {
    /**
     * The publisher's visible tag name, including any suffix.
     */
    name: string;
    /**
     * The publisher's category. It does not imply a JMdict grammatical code.
     */
    category: string;
    /**
     * Explanatory text supplied by the dictionary.
     */
    notes?: string;
    /**
     * The publisher's tag sorting order.
     */
    order: number;
    /**
     * The publisher's popularity score, retained without changing Shirabe's ranking rules.
     */
    score: number;
};
/**
 * A source spelling and reading pair with its own tags and deinflection rules.
 */
export type SourceHeadword = {
    text: string;
    reading: string;
    tags: Array<SourceTag>;
    /**
     * Source deinflection identifiers, not display tags.
     */
    rules: Array<string>;
    /**
     * The publisher's score for this spelling and reading pair.
     */
    score: number;
};
/**
 * Positioned source text with ranked word-card matches. Search segments form
 * one preferred interpretation; identify spans may overlap at one start offset.
 *
 */
export type SearchSegment = {
    /**
     * Exact text covered by this segment.
     */
    surface: string;
    /**
     * Inclusive UTF-16 offset into `query`.
     */
    startOffset: number;
    /**
     * Exclusive UTF-16 offset into `query`.
     */
    endOffset: number;
    /**
     * Distinct word cards in preferred-first order.
     */
    matches: Array<Result>;
};
/**
 * One example sentence for the card. Mining the same text twice reuses the
 * owner's sentence-bank record rather than storing it again, so a line mined for
 * two words is one row backing both cards.
 *
 */
export type SaveSentence = {
    /**
     * The complete sentence containing the target word.
     */
    text: string;
    translation?: string;
    /**
     * Where the line came from, `browser_extension` for one mined off a page
     * (the default here), `manual` for one the learner typed, `tatoeba` for one
     * picked off the corpus list.
     *
     */
    origin?: string;
    /**
     * Page URL at capture time.
     */
    url?: string;
    /**
     * Page title at capture time.
     */
    title?: string;
    capturedAt?: string;
    /**
     * Capture adapter, such as web_page, article_reader, pdf_reflow, or asbplayer.
     */
    integration?: string;
    /**
     * User-visible media position at capture time, when a subtitle adapter provides one.
     */
    mediaTimestampMs?: number;
    /**
     * End of the line in the media. Both ends, because a start alone can seek to
     * the moment but neither stop at it nor re-cut the clip.
     *
     */
    mediaEndMs?: number;
    /**
     * Which token in `tokens` the learner mined. A word is not a position: a line
     * saying the same word twice cannot say which one was clicked without this.
     * Stored on the link and used to highlight the sentence on the card.
     *
     */
    targetIndex?: number;
    /**
     * How the client cut this line into words, in order. Only the client ever
     * held the page, so its cut is the one stored, and the server fills in
     * readings, part of speech and dictionary form around it rather than reading
     * the line again with its own tokenizer.
     *
     * Optional and advisory. Omit it and the server segments the line itself, as
     * it always has. A cut whose surfaces do not rejoin to `text` exactly is
     * dropped whole rather than partly believed.
     *
     */
    tokens?: Array<{
        /**
         * The characters of this token, in order, joining to `text`.
         */
        surface: string;
    }>;
    /**
     * This line's screenshot, as a base64 data URL; size-limited by the media ingress.
     */
    imageDataUrl?: string;
    /**
     * This line's audio clip, as a base64 data URL; size-limited by the media ingress.
     */
    audioDataUrl?: string;
};
/**
 * What the API key owner knows about one word, however many cards it holds. Returned by every word-level endpoint, the batch lookup, setting a state, and saving, so a client reads the same shape wherever a word changes.
 *
 */
export type WordStateEntry = {
    lemma: string;
    state: WordState;
    /**
     * Every deck holding a card for this word.
     */
    decks: Array<{
        id: number;
        name: string;
    }>;
    /**
     * Id of the owner's most recently updated card for this lemma, when any exist. Only meaningful alongside `cardCount`: a word can hold a card per meaning, and this names one of them. Open it at `/study/cards?card_id=…`.
     *
     */
    cardId?: number;
    /**
     * How many cards the owner holds for this lemma, present whenever `cardId` is. `> 1` means `cardId` reaches only one of them, link to the card browser filtered by the word (`/study/cards?q=…`) instead.
     *
     */
    cardCount?: number;
    /**
     * The earliest due card, with the revision to submit when grading it. Absent when no card is due.
     */
    reviewCard?: {
        id: number;
        revision: string;
    };
    /**
     * The senses this word already has cards for, as the same `"<dictionary slug>#<its own sense number>"` refs a client passes as `senses[]` when saving. A picker uses it to mark meanings that are already taken instead of offering them again. Absent when only a whole-word card exists (see `savedWholeWord`) or nothing is saved.
     *
     */
    savedSenses?: Array<string>;
    /**
     * True when a card covers the whole word rather than particular meanings, it covers every sense, so there is nothing left to add. Absent otherwise.
     *
     */
    savedWholeWord?: boolean;
    /**
     * What each grade would cost on the card a review would actually land on: the scheduled one, never a retired or suspended sibling. Absent when the word has no scheduled card.
     *
     */
    intervals?: {
        again: string;
        hard: string;
        good: string;
        easy: string;
    };
};
/**
 * An idempotent save result: the card that was written, whether it was created, and the word it belongs to. `word` replaces the old `memberships` (now `word.decks`) and top-level `intervals` (now `word.intervals`), and adds the card count, how a client learns that a second meaning now exists.
 *
 */
export type SaveResponse = {
    card: Card;
    /**
     * Whether THIS card was inserted. A word can hold a card per meaning, so saving a second meaning creates a card even though the word was already saved.
     *
     */
    created: boolean;
    word: WordStateEntry;
};
/**
 * A graded card plus the four next-grade interval previews.
 */
export type ReviewResponse = {
    /**
     * Retain this ID to undo this review. An undo request never selects a different review.
     */
    reviewId: number;
    card: Card;
    /**
     * Human-readable interval each button would schedule next ("5h", "1d", "3mo").
     */
    intervals: {
        again?: string;
        hard?: string;
        good?: string;
        easy?: string;
    };
};
export type StudySession = {
    sessionId: number;
    /**
     * Selected deck, or null for all eligible decks.
     */
    deckId: number | null;
    /**
     * The next card to grade, or null when none is eligible. Fetch the session after grading or Undo.
     */
    card: Card | null;
    counts: {
        due: number;
        new: number;
    };
    /**
     * Latest review in this session. Dispatched reviews require confirmation through the Anki review-undo resources.
     */
    undoReviewId: number | null;
    /**
     * True when Anki daily limits exclude otherwise eligible cards. This can be true while a card remains available.
     */
    limited: boolean;
};
export type UndoReviewRequest = {
    /**
     * API study session that owns the review. Required when the grade was made within a session.
     */
    sessionId?: number;
    /**
     * The reviewId returned by the grade being undone.
     */
    reviewId: number;
};
/**
 * The API key owner's FSRS study settings (docs/srs.md §4, §7).
 */
export type SrsSettings = {
    /**
     * Target recall probability (0.70–0.97).
     */
    desiredRetention: number;
    /**
     * Ceiling on any scheduled interval, in days (30–36500).
     */
    maxIntervalDays: number;
    /**
     * Default new cards introduced per day (a deck can override).
     */
    newPerDay: number;
    /**
     * How new cards interleave with due reviews.
     */
    queueOrder: 'due_first' | 'new_first' | 'mixed';
    /**
     * Per-weekday load-balancing preference, Sunday first.
     */
    easyDays: Array<'normal' | 'reduced' | 'minimum'>;
    /**
     * IANA timezone for the day boundary. Null until captured.
     */
    timezone: string | null;
    /**
     * Hour (0–23) a study day rolls over.
     */
    dayCutoffHour: number;
};
/**
 * Partial update to the owner's FSRS settings.
 */
export type SrsSettingsUpdate = {
    desiredRetention?: number;
    maxIntervalDays?: number;
    newPerDay?: number;
    queueOrder?: 'due_first' | 'new_first' | 'mixed';
    easyDays?: [
        'normal' | 'reduced' | 'minimum',
        'normal' | 'reduced' | 'minimum',
        'normal' | 'reduced' | 'minimum',
        'normal' | 'reduced' | 'minimum',
        'normal' | 'reduced' | 'minimum',
        'normal' | 'reduced' | 'minimum',
        'normal' | 'reduced' | 'minimum'
    ];
    timezone?: string | null;
    dayCutoffHour?: number;
};
/**
 * Ordered dictionary slugs for this request. Overrides saved dictionary preferences without changing them. Only dictionaries available to this credential are used; an unavailable selection never falls back to other dictionaries.
 */
export type DictionarySelection = Array<string>;
/**
 * Parsed tokens to identify.
 */
export type WordIdentifyRequest = {
    /**
     * Required with `include=contextualRanking`; the sentence containing the requested token occurrences.
     */
    sentence?: string;
    dictionaries?: DictionarySelection;
    /**
     * Fold word-level data onto every candidate, so a client rendering the one
     * the reader picked needs no follow-up call. Off by default: a caller that
     * only wants to know which words a token could be needs none of it.
     *
     * `pitch` adds the accent patterns and their audio, `frequency` the corpus
     * rank, `furigana` the reading aligned to the headword, and `jlpt` the level.
     *
     * `forms` adds every spelling the word is written with, which is the
     * question a reader asks the moment the headword is not the spelling they
     * just met (開く is also 空く). `notes` adds the usage notes attached to a
     * sense -- "usu. in kana", "after the -te form of a verb" -- and only the
     * notes. A sense with no note carries no key.
     *
     * `relations` adds `related`, `antonyms`, and `seeAlso` to each sense,
     * using the same target text, optional reading, and optional label as
     * `GET /api/v1/words/{id}`. These arrays are absent unless requested and
     * empty when the sense has no references of that kind. It does not add
     * notes, restrictions, or loanword sources; `notes` remains independent.
     * `restrictions` and `loanwordSource` stay on `GET /api/v1/words/{id}`.
     *
     * `parts` adds the words a multi-word expression is MADE OF. It exists
     * because a merged expression resolves to exactly one candidate: 男を知る
     * leaves a reader no way to reach 男 or 知る -- not by hovering, since the
     * chip spans them, and not through the picker, since the expression is the
     * only candidate. Each part carries an `id`, so a client can open it. A
     * grammatical expression carries no parts at all (について would otherwise
     * offer つく), and neither does a single word.
     *
     * This is what makes a popup one round trip instead of two. Without it a
     * client has to follow every identify with `GET /api/v1/words/{id}` purely
     * to draw a pitch diagram and a badge, and the card visibly rebuilds itself
     * when the second answer lands. `GET /api/v1/words/{id}` remains the way to
     * get the full detail, including homographs, restrictions, loanword sources,
     * and optional sentences, for a word somebody already picked.
     *
     */
    include?: Array<'pitch' | 'frequency' | 'furigana' | 'jlpt' | 'forms' | 'notes' | 'relations' | 'parts' | 'contextualRanking'>;
    /**
     * The tokens to identify, in the order you want them answered. These are the
     * lookup fields derived from a parse token. Send its `lemma`, `surface`, and
     * `reading`, and map the parse token's `partOfSpeech` to `pos`.
     *
     * A caller with its own tokenizer can skip `/api/v1/parse` entirely and send
     * these four fields directly. `pos` has to use our short vocabulary and
     * `reading` has to be katakana, or the ranking loses the signal it needs.
     *
     * Capped at 200 because the answer carries definitions: measured at roughly
     * 1 KB per token for a word with two candidates and three senses each, so a
     * full batch is a few hundred KB and a page's worth of taps is well inside
     * it. Chunk a longer document rather than asking for it in one call.
     *
     */
    tokens: Array<{
        /**
         * The dictionary form the token reduces to, and the only required field. A row without one keeps its slot in the answer as `null`.
         *
         */
        lemma: string;
        /**
         * The token as it appeared in the text. Defaults to `lemma`.
         */
        surface?: string;
        /**
         * The reading of the SURFACE in context, katakana. This is what separates homographs: 開いた read ヒライタ is ひらく, read アイタ is あく, and neither can be told from the spelling alone.
         *
         */
        reading?: string;
        /**
         * The token's part of speech in our short vocabulary (`noun`, `verb`, `adj`, `adv`, `pron`, `prt`, `aux`, `conj`, `intj`, `det`, `pref`, `suf`, `exp`), NOT a UniDic or JMdict code.
         *
         * It decides where a closed class names exactly one candidate: 君 merely READS きみ, so a spelling-only ranking answers the grain that is filed there, and `pos=pron` is what says otherwise.
         *
         */
        pos?: string;
        /**
         * Start offset in `sentence`, in UTF-16 code units. Required for contextual ranking and must select `surface` with `length`.
         */
        position?: number;
        /**
         * Surface length in UTF-16 code units. Required for contextual ranking and must select `surface` from `sentence`.
         */
        length?: number;
    }>;
};
/**
 * One answer per requested token, in the order they were sent.
 */
export type WordIdentify = {
    /**
     * Which dictionary stack these answers came out of, digested. The same value
     * `GET /api/v1/dictionary-stack` reports under `dictionaryStack.fingerprint`.
     *
     * For a client that CACHES lookups. The events that make a cached answer
     * untrue all happen here -- the key owner switches off a dictionary,
     * reorders their stack, or one is re-imported -- and this is how you find
     * out without polling `/api/v1/dictionary-stack` to be told "nothing changed". Compare it
     * to the last one you saw; when it moves, your cached answers for this key
     * are stale.
     *
     * Sound to use as a cache key. It is derived from the stack and the
     * dictionary content version, never from anything the caller sends.
     *
     */
    stackFingerprint?: string | null;
    /**
     * Index-aligned with `tokens`. `null` wherever nothing resolves, which is
     * ordinary for names, numbers, coined words and most symbols, and means
     * "show it, do not link it".
     *
     */
    words: Array<{
        /**
         * Every word this token's spelling can name, best first.
         * `candidates[0]` is our answer; the rest are what a reader may pick
         * instead.
         *
         * A list rather than one word, because one answer is a claim we often
         * cannot support: きみ can be 君, 黄身 or 黍, and only the reader knows
         * which they meant. We lead with the best reading of the sentence.
         *
         * Ranked, never filtered. A token we read badly costs a word its place
         * in the list, never its place in the dictionary.
         *
         * Link with `id`. STORE `sourceId` and `dictionary`: that pair is an
         * identity and survives a re-import, where the slug is a handle
         * derived from dictionary content and moves when a headword, a
         * commonness flag or one of our resolution rules moves.
         *
         */
        candidates: Array<{
            /**
             * Opens the word at `GET /api/v1/words/{id}`. A SLUG, not a
             * number: the word's own spelling, plus `-<reading>` and
             * `-<sourceId>` only where the spelling alone is ambiguous
             * (`猫`, `私-わたくし`, `開く-ひらく-1202650`).
             *
             * Link with this. It is derived from dictionary content, so it
             * moves when a headword, a commonness flag or one of our
             * resolution rules moves. Store `sourceId` and `dictionary`.
             *
             */
            id: string;
            headword: string;
            /**
             * What to CALL this candidate, when its own headword is a kana
             * form the reader never typed. `null` for almost every word.
             *
             * A word "usually written in kana" leads with its own kana, and
             * a word can read more than one way. 彼方 is called かなた and
             * also reads あなた, so a token あなた offers a candidate
             * labelled かなた -- which reads nothing like what was asked
             * about, and says nothing about why it is in the list. Here that
             * candidate carries `彼方`, the spelling both readings share.
             *
             * A LABEL, and nothing else. `id` and `headword` are unaffected,
             * so a stored id still resolves to the same word. Render this
             * where you show the candidate's name; keep using `id` to open
             * it.
             *
             */
            matchedHeadword?: string | null;
            reading?: string | null;
            common?: boolean;
            /**
             * The dictionary's own id, stable across re-imports.
             */
            sourceId?: string;
            /**
             * Slug of the dictionary `sourceId` belongs to.
             */
            dictionary?: string;
            /**
             * Only with `include=furigana`. The headword's reading aligned to its writing, kanji run by kanji.
             *
             */
            furigana?: Array<{
                text: string;
                ruby?: string | null;
            }>;
            /**
             * Only with `include=jlpt`. e.g. `N5`.
             */
            jlpt?: string | null;
            /**
             * Only with `include=frequency`. Corpus rank, lower is commoner.
             *
             */
            frequency?: number | null;
            /**
             * Only with `include=pitch`. One entry per accent pattern, with a pre-generated clip where one exists for that (reading, accent).
             *
             */
            pitch?: Array<{
                downstep: number;
                pattern: string;
                audioUrl?: string | null;
                /**
                 * Verified published MP3 copy of this recording for offline use; absent when unavailable.
                 */
                audioDownloadUrl?: string;
                autogenerated?: boolean;
            }>;
            /**
             * Only with `include=forms`. Every spelling this word is written with, kanji and kana alike.
             *
             */
            forms?: Array<{
                text: string;
                script: string;
                common?: boolean;
                tags?: Array<{
                    category?: string;
                    code?: string;
                    label?: string;
                }>;
            }>;
            /**
             * True when this candidate is a PERSON or a place rather than a
             * word.
             *
             * Published because a client cannot work it out. The obvious test
             * -- `dictionary == "jmnedict"` -- is wrong, and wrong quietly:
             * JMdict carries ~7,300 JMnedict rows under its own slug, so a
             * caller filtering on the slug keeps every one of them and never
             * finds out.
             *
             * Names are ranked, never filtered, here: a token really can be a
             * name, and which of the two a client wants is a question about
             * its corpus rather than about the dictionary.
             *
             */
            name?: boolean;
            /**
             * Only with `include=parts`. The words this expression is made
             * of, each with an `id` that opens it.
             *
             * Absent unless the candidate is a multi-word expression whose
             * every component resolves to something the dictionary can open.
             * That gate is why について carries none: its morphemes are
             * grammar, and offering つく would be worse than offering
             * nothing.
             *
             */
            parts?: Array<{
                /**
                 * The part as written in the expression.
                 */
                text: string;
                /**
                 * What it is filed under.
                 */
                lemma: string;
                reading?: string;
                /**
                 * Opens the part at `GET /api/v1/words/{id}`. Absent when the part resolves to no word, which a client should read as "print it, do not link it".
                 */
                id?: string;
            }>;
            /**
             * Only with `include=contextualRanking`. Ordered sense refs for
             * this occurrence. `contextual=false` means the refs retain
             * canonical order because the provider was unavailable,
             * uncertain, invalid, or failed.
             *
             */
            contextualRanking?: {
                refs: Array<string>;
                confidence?: number;
                contextual: boolean;
                reason?: 'unavailable' | 'invalid' | 'uncertain' | 'limit' | 'failed';
            };
            /**
             * This candidate's definitions, in the same shape a search result
             * carries them, so one component renders both.
             *
             * They come with the candidates on purpose. A popup showing
             * "君 or きみ?" with no meanings asks the reader to pick blind,
             * and fetching each definition to decide would turn one tap into
             * several round trips.
             *
             * One per dictionary that defines this word in the key owner's
             * stack, in stack order: a
             * reader who put a monolingual dictionary above JMdict gets it
             * first. Each entry names the `dictionary` it came from.
             *
             * A key whose owner has never chosen a stack -- every service
             * identity, and any reader who has not been to their settings --
             * gets exactly one: the entry the candidate is filed under. The
             * default stack is deliberately NOT used to widen this, because
             * it carries dictionaries (wikipedia) nobody asked for.
             *
             */
            entries?: Array<Entry>;
        }>;
    } | null>;
};
export type DictionaryStack2 = {
    fingerprint: string;
    sources: Array<DictionaryStackSource>;
};
/**
 * A dictionary operation is temporarily unavailable.
 */
export type Error503 = {
    type: string;
    title: string;
    status: 503;
    detail?: string;
    code: 'DICTIONARY_PACK_UNAVAILABLE';
    instance: string;
};
export type ReaderHostRules = {
    version: number;
    rules: Array<{
        host: string | Array<string>;
        mode?: 'auto' | 'off';
        parse?: string;
        filter?: string;
        allFrames?: boolean;
        collapseWhitespace?: boolean;
        custom?: 'youtube' | 'netflix' | 'mokuro';
    }>;
};
/**
 * A conservative Sudachi B-mode lexical word inside a lookup chip.
 */
export type TokenComponent = {
    /**
     * Component surface form as it appeared inside the chip.
     */
    surface: string;
    /**
     * Independently searchable dictionary form.
     */
    lemma?: string | null;
    /**
     * Katakana reading of the component surface.
     */
    reading?: string | null;
    /**
     * Full Sudachi POS chain.
     */
    pos: Array<string>;
    role: 'word' | 'numeric' | 'counter';
    /**
     * UTF-16 offset relative to the start of the outer chip.
     */
    offset: number;
    /**
     * Component length in UTF-16 code units.
     */
    length: number;
};
/**
 * Maximum number of results to return.
 */
export type Limit = number;
/**
 * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
 * back exactly what `pagination.cursor` gave you with the same operation and
 * filters. Some ranked collections expire cursors when their data changes;
 * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
 * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
 * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
 *
 */
export type Cursor = string;
/**
 * Preferred language for Shirabe-owned labels. Regional tags and weighted
 * language lists are accepted; unsupported languages fall back to English.
 * Dictionary definition languages are selected separately by each operation.
 *
 */
export type AcceptLanguage = string;
/**
 * Unique retry key, scoped to this credential and operation for 24 hours.
 * Repeating the same request returns the original response without applying it
 * again. Reusing the key with another body returns `409`.
 *
 */
export type IdempotencyKey = string;
export type PairAnkiProfileData = {
    body: {
        collection_key: AnkiSyncKey;
        installation_id: AnkiSyncKey;
        key: AnkiSyncKey;
        /**
         * Total saved media bytes in the initial snapshot. Retries must keep this declaration unchanged.
         */
        media_bytes: number;
        source_metadata: {
            crt: number;
            decks: {
                [key: string]: {
                    id: number;
                    name: string;
                    dyn?: 0 | 1;
                };
            };
            dconf?: {
                [key: string]: unknown;
            };
            conf: {
                [key: string]: unknown;
            };
        };
    };
    path?: never;
    query?: never;
    url: '/api/v1/srs/anki/profiles';
};
export type PairAnkiProfileErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Initial media exceeds the remaining account storage.
     */
    413: ErrorMediaQuota;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type PairAnkiProfileError = PairAnkiProfileErrors[keyof PairAnkiProfileErrors];
export type PairAnkiProfileResponses = {
    /**
     * Sync result.
     */
    200: AnkiSyncProfile;
};
export type PairAnkiProfileResponse = PairAnkiProfileResponses[keyof PairAnkiProfileResponses];
export type UnlinkAnkiProfileData = {
    body?: never;
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}';
};
export type UnlinkAnkiProfileErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UnlinkAnkiProfileError = UnlinkAnkiProfileErrors[keyof UnlinkAnkiProfileErrors];
export type UnlinkAnkiProfileResponses = {
    /**
     * The profile was unlinked without deleting study data.
     */
    204: void;
};
export type UnlinkAnkiProfileResponse = UnlinkAnkiProfileResponses[keyof UnlinkAnkiProfileResponses];
export type FinishAnkiSnapshotData = {
    body: {
        key: AnkiSyncKey;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/snapshot';
};
export type FinishAnkiSnapshotErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type FinishAnkiSnapshotError = FinishAnkiSnapshotErrors[keyof FinishAnkiSnapshotErrors];
export type FinishAnkiSnapshotResponses = {
    /**
     * Sync result.
     */
    200: AnkiSyncProfile;
};
export type FinishAnkiSnapshotResponse = FinishAnkiSnapshotResponses[keyof FinishAnkiSnapshotResponses];
export type StartAnkiSnapshotData = {
    body: {
        installation_id: AnkiSyncKey;
        key: AnkiSyncKey;
        previous_key?: string | null;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/snapshot';
};
export type StartAnkiSnapshotErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type StartAnkiSnapshotError = StartAnkiSnapshotErrors[keyof StartAnkiSnapshotErrors];
export type StartAnkiSnapshotResponses = {
    /**
     * Sync result.
     */
    200: AnkiSyncProfile;
};
export type StartAnkiSnapshotResponse = StartAnkiSnapshotResponses[keyof StartAnkiSnapshotResponses];
export type RefreshAnkiCollectionSettingsData = {
    body: {
        key: AnkiSyncKey;
        request_key: AnkiSyncKey;
        base_revision: number;
        source_metadata: {
            crt: number;
            conf: {
                [key: string]: unknown;
            };
            decks: {
                [key: string]: unknown;
            };
            dconf: {
                [key: string]: unknown;
            };
            capture: {
                captured_at: string;
                days_elapsed: number;
                next_day_at: number;
                acknowledged_cursor: number;
            };
        };
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/collection_settings';
};
export type RefreshAnkiCollectionSettingsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type RefreshAnkiCollectionSettingsError = RefreshAnkiCollectionSettingsErrors[keyof RefreshAnkiCollectionSettingsErrors];
export type RefreshAnkiCollectionSettingsResponses = {
    /**
     * Immutable receipt for the accepted settings revision.
     */
    200: {
        request_key: AnkiSyncKey;
        revision: number;
    };
};
export type RefreshAnkiCollectionSettingsResponse = RefreshAnkiCollectionSettingsResponses[keyof RefreshAnkiCollectionSettingsResponses];
export type PrepareAnkiPublicationsData = {
    body: {
        key: AnkiSyncKey;
        request_key: AnkiSyncKey;
        after?: number;
        through?: number | null;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/publications';
};
export type PrepareAnkiPublicationsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Media or account storage limit exceeded.
     */
    413: ErrorMediaQuota;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type PrepareAnkiPublicationsError = PrepareAnkiPublicationsErrors[keyof PrepareAnkiPublicationsErrors];
export type PrepareAnkiPublicationsResponses = {
    /**
     * Immutable receipt for this page. Newly created note IDs above through wait until the next preparation pass.
     */
    200: {
        request_key: string;
        after: number;
        through: number;
        complete: boolean;
    };
};
export type PrepareAnkiPublicationsResponse = PrepareAnkiPublicationsResponses[keyof PrepareAnkiPublicationsResponses];
export type SelectAnkiDeckData = {
    body: {
        key: AnkiSyncKey;
        anki_id: number;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/deck_links';
};
export type SelectAnkiDeckErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type SelectAnkiDeckError = SelectAnkiDeckErrors[keyof SelectAnkiDeckErrors];
export type SelectAnkiDeckResponses = {
    /**
     * Sync result.
     */
    200: {
        id: number;
        anki_id: number;
        deck_id: number;
    };
};
export type SelectAnkiDeckResponse = SelectAnkiDeckResponses[keyof SelectAnkiDeckResponses];
export type ApplyAnkiBatchData = {
    body: AnkiSyncBatchRequest;
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/batches';
};
export type ApplyAnkiBatchErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ApplyAnkiBatchError = ApplyAnkiBatchErrors[keyof ApplyAnkiBatchErrors];
export type ApplyAnkiBatchResponses = {
    /**
     * Sync result, or the first byte range of an oversized immutable receipt. Retrieve further ranges using getAnkiBatchReceipt before applying the result.
     */
    200: AnkiSyncBatchResult | AnkiSyncReceiptPart;
};
export type ApplyAnkiBatchResponse = ApplyAnkiBatchResponses[keyof ApplyAnkiBatchResponses];
export type GetAnkiBatchReceiptData = {
    body?: never;
    path: {
        profile_id: number;
        id: number;
    };
    query: {
        key: string;
        offset: number;
    };
    url: '/api/v1/srs/anki/profiles/{profile_id}/batches/{id}';
};
export type GetAnkiBatchReceiptErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetAnkiBatchReceiptError = GetAnkiBatchReceiptErrors[keyof GetAnkiBatchReceiptErrors];
export type GetAnkiBatchReceiptResponses = {
    /**
     * A bounded receipt part. A retry returns the same bytes; the next offset is this offset plus the decoded data length.
     */
    200: AnkiSyncReceiptPart;
};
export type GetAnkiBatchReceiptResponse = GetAnkiBatchReceiptResponses[keyof GetAnkiBatchReceiptResponses];
export type ListAnkiMediaFilesData = {
    body?: never;
    path: {
        profile_id: number;
    };
    query: {
        key: AnkiSyncKey;
        after?: number;
    };
    url: '/api/v1/srs/anki/profiles/{profile_id}/media_files';
};
export type ListAnkiMediaFilesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListAnkiMediaFilesError = ListAnkiMediaFilesErrors[keyof ListAnkiMediaFilesErrors];
export type ListAnkiMediaFilesResponses = {
    /**
     * Up to 200 files ordered by ID. Restart a full scan if the revision changes between pages.
     */
    200: {
        files: Array<AnkiMediaFile>;
        cursor: number;
        revision: number;
    };
};
export type ListAnkiMediaFilesResponse = ListAnkiMediaFilesResponses[keyof ListAnkiMediaFilesResponses];
export type UploadAnkiMediaFileData = {
    body: {
        key: AnkiSyncKey;
        request_key: AnkiSyncKey;
        filename: string;
        digest: string;
        /**
         * Last acknowledged digest, or an empty string for an absent file.
         */
        base: string;
        file: Blob | File;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/media_files';
};
export type UploadAnkiMediaFileErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Media or account storage limit exceeded.
     */
    413: ErrorMediaQuota;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UploadAnkiMediaFileError = UploadAnkiMediaFileErrors[keyof UploadAnkiMediaFileErrors];
export type UploadAnkiMediaFileResponses = {
    /**
     * Immutable upload receipt. A replay returns this result even after a later edit.
     */
    200: AnkiMediaFile;
};
export type UploadAnkiMediaFileResponse = UploadAnkiMediaFileResponses[keyof UploadAnkiMediaFileResponses];
export type DeleteAnkiMediaFileData = {
    body: {
        key: AnkiSyncKey;
        request_key: AnkiSyncKey;
        base: string;
    };
    path: {
        profile_id: number;
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/media_files/{id}';
};
export type DeleteAnkiMediaFileErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DeleteAnkiMediaFileError = DeleteAnkiMediaFileErrors[keyof DeleteAnkiMediaFileErrors];
export type DeleteAnkiMediaFileResponses = {
    /**
     * Immutable deletion receipt. Repeating it does not delete a later restoration.
     */
    200: AnkiMediaFile;
};
export type DeleteAnkiMediaFileResponse = DeleteAnkiMediaFileResponses[keyof DeleteAnkiMediaFileResponses];
export type DownloadAnkiMediaFileData = {
    body?: never;
    path: {
        profile_id: number;
        id: number;
    };
    query: {
        key: AnkiSyncKey;
        digest: string;
    };
    url: '/api/v1/srs/anki/profiles/{profile_id}/media_files/{id}';
};
export type DownloadAnkiMediaFileErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DownloadAnkiMediaFileError = DownloadAnkiMediaFileErrors[keyof DownloadAnkiMediaFileErrors];
export type DownloadAnkiMediaFileResponses = {
    /**
     * The original media bytes, never publicly cacheable.
     */
    200: Blob | File;
};
export type DownloadAnkiMediaFileResponse = DownloadAnkiMediaFileResponses[keyof DownloadAnkiMediaFileResponses];
export type GetAnkiNoteConflictData = {
    body?: never;
    path: {
        profile_id: number;
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/note_conflicts/{id}';
};
export type GetAnkiNoteConflictErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetAnkiNoteConflictError = GetAnkiNoteConflictErrors[keyof GetAnkiNoteConflictErrors];
export type GetAnkiNoteConflictResponses = {
    /**
     * One conflict and the current Shirabe note, limited to 8 MiB of JSON.
     */
    200: {
        id: number;
        key: string;
        code: string;
        resolved: boolean;
        snapshot: string;
        note: {
            [key: string]: unknown;
        };
    };
};
export type GetAnkiNoteConflictResponse = GetAnkiNoteConflictResponses[keyof GetAnkiNoteConflictResponses];
export type GetAnkiCardConflictData = {
    body?: never;
    path: {
        profile_id: number;
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/card_conflicts/{id}';
};
export type GetAnkiCardConflictErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetAnkiCardConflictError = GetAnkiCardConflictErrors[keyof GetAnkiCardConflictErrors];
export type GetAnkiCardConflictResponses = {
    /**
     * Current conflict details, or the first bounded part of a saved comparison when the details exceed 8 MiB.
     */
    200: AnkiCardConflictDetail | {
        key: string;
        receipt: Receipt;
    };
};
export type GetAnkiCardConflictResponse = GetAnkiCardConflictResponses[keyof GetAnkiCardConflictResponses];
export type GetAnkiCardConflictComparisonData = {
    body?: never;
    path: {
        profile_id: number;
        card_conflict_id: number;
        id: number;
    };
    query: {
        key: string;
        offset: number;
    };
    url: '/api/v1/srs/anki/profiles/{profile_id}/card_conflicts/{card_conflict_id}/comparisons/{id}';
};
export type GetAnkiCardConflictComparisonErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetAnkiCardConflictComparisonError = GetAnkiCardConflictComparisonErrors[keyof GetAnkiCardConflictComparisonErrors];
export type GetAnkiCardConflictComparisonResponses = {
    /**
     * A bounded part of the saved comparison. Its bytes do not change when the current card changes.
     */
    200: AnkiSyncReceiptPart;
};
export type GetAnkiCardConflictComparisonResponse = GetAnkiCardConflictComparisonResponses[keyof GetAnkiCardConflictComparisonResponses];
export type RequestAnkiNoteDeletionData = {
    body: {
        request_key: string;
    };
    path: {
        profile_id: number;
        note_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/notes/{note_id}/deletions';
};
export type RequestAnkiNoteDeletionErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type RequestAnkiNoteDeletionError = RequestAnkiNoteDeletionErrors[keyof RequestAnkiNoteDeletionErrors];
export type RequestAnkiNoteDeletionResponses = {
    /**
     * The new request, or the retained request for this key.
     */
    201: AnkiNoteDeletion;
};
export type RequestAnkiNoteDeletionResponse = RequestAnkiNoteDeletionResponses[keyof RequestAnkiNoteDeletionResponses];
export type CancelAnkiNoteDeletionData = {
    body?: never;
    path: {
        profile_id: number;
        note_id: number;
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/notes/{note_id}/deletions/{id}';
};
export type CancelAnkiNoteDeletionErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type CancelAnkiNoteDeletionError = CancelAnkiNoteDeletionErrors[keyof CancelAnkiNoteDeletionErrors];
export type CancelAnkiNoteDeletionResponses = {
    /**
     * Retained request after cancellation. Repeated cancellation is safe.
     */
    200: AnkiNoteDeletion;
};
export type CancelAnkiNoteDeletionResponse = CancelAnkiNoteDeletionResponses[keyof CancelAnkiNoteDeletionResponses];
export type GetAnkiNoteDeletionData = {
    body?: never;
    path: {
        profile_id: number;
        note_id: number;
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/notes/{note_id}/deletions/{id}';
};
export type GetAnkiNoteDeletionErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetAnkiNoteDeletionError = GetAnkiNoteDeletionErrors[keyof GetAnkiNoteDeletionErrors];
export type GetAnkiNoteDeletionResponses = {
    /**
     * Current deletion state. Acknowledgement alone does not mean source absence was reconciled.
     */
    200: AnkiNoteDeletion;
};
export type GetAnkiNoteDeletionResponse = GetAnkiNoteDeletionResponses[keyof GetAnkiNoteDeletionResponses];
export type RequestAnkiReviewUndoData = {
    body: {
        request_key: string;
        review_id: number;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/review_undos';
};
export type RequestAnkiReviewUndoErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type RequestAnkiReviewUndoError = RequestAnkiReviewUndoErrors[keyof RequestAnkiReviewUndoErrors];
export type RequestAnkiReviewUndoResponses = {
    /**
     * The new request, or the retained request for this key.
     */
    201: AnkiReviewUndo;
};
export type RequestAnkiReviewUndoResponse = RequestAnkiReviewUndoResponses[keyof RequestAnkiReviewUndoResponses];
export type CancelAnkiReviewUndoData = {
    body?: never;
    path: {
        profile_id: number;
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/review_undos/{id}';
};
export type CancelAnkiReviewUndoErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type CancelAnkiReviewUndoError = CancelAnkiReviewUndoErrors[keyof CancelAnkiReviewUndoErrors];
export type CancelAnkiReviewUndoResponses = {
    /**
     * Retained request after cancellation. Repeated cancellation is safe.
     */
    200: AnkiReviewUndo;
};
export type CancelAnkiReviewUndoResponse = CancelAnkiReviewUndoResponses[keyof CancelAnkiReviewUndoResponses];
export type GetAnkiReviewUndoData = {
    body?: never;
    path: {
        profile_id: number;
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/review_undos/{id}';
};
export type GetAnkiReviewUndoErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetAnkiReviewUndoError = GetAnkiReviewUndoErrors[keyof GetAnkiReviewUndoErrors];
export type GetAnkiReviewUndoResponses = {
    /**
     * Current Undo state. Acknowledgement alone does not mean the review was removed.
     */
    200: AnkiReviewUndo;
};
export type GetAnkiReviewUndoResponse = GetAnkiReviewUndoResponses[keyof GetAnkiReviewUndoResponses];
export type DeliverAnkiChangesData = {
    body: {
        key: AnkiSyncKey;
        cursor: number;
        limit?: number;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/deliveries';
};
export type DeliverAnkiChangesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Media or account storage limit exceeded.
     */
    413: ErrorMediaQuota;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
    /**
     * Referenced media is not available yet. This attempt does not advance delivery; retry the same cursor.
     */
    503: ErrorMediaNotReady;
};
export type DeliverAnkiChangesError = DeliverAnkiChangesErrors[keyof DeliverAnkiChangesErrors];
export type DeliverAnkiChangesResponses = {
    /**
     * Ordered changes. An oversized change is an immutable receipt part; retrieve its remaining bytes using getAnkiDeliveryReceipt before applying or acknowledging the page.
     */
    200: {
        cursor: number;
        changes: Array<AnkiSyncReceiptPart | {
            cursor: number;
            entity_kind: 'note_type' | 'note' | 'card' | 'review' | 'media' | 'deck';
            entity_id: number;
            operation: 'upsert' | 'delete';
            payload: {
                [key: string]: unknown;
            };
        }>;
    };
};
export type DeliverAnkiChangesResponse = DeliverAnkiChangesResponses[keyof DeliverAnkiChangesResponses];
export type GetAnkiDeliveryReceiptData = {
    body?: never;
    path: {
        profile_id: number;
        /**
         * The cursor of a change already dispatched by deliverAnkiChanges.
         */
        id: number;
    };
    query: {
        key: string;
        offset: number;
    };
    url: '/api/v1/srs/anki/profiles/{profile_id}/deliveries/{id}';
};
export type GetAnkiDeliveryReceiptErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetAnkiDeliveryReceiptError = GetAnkiDeliveryReceiptErrors[keyof GetAnkiDeliveryReceiptErrors];
export type GetAnkiDeliveryReceiptResponses = {
    /**
     * A bounded immutable change part. Retry by cursor and offset; validate the complete size and digest before applying or acknowledging.
     */
    200: AnkiSyncReceiptPart;
};
export type GetAnkiDeliveryReceiptResponse = GetAnkiDeliveryReceiptResponses[keyof GetAnkiDeliveryReceiptResponses];
export type AcknowledgeAnkiChangesData = {
    body: {
        key: AnkiSyncKey;
        cursor: number;
        /**
         * Deletion cursors the learner chose to withdraw in Anki. The add-on must durably skip these deletions before sending acknowledgement. Already-applied deletions cannot be reinterpreted as kept.
         */
        kept_notes?: Array<number>;
        /**
         * Review Undo cursors the learner chose to withdraw in Anki. An already-reconciled Undo cannot be reinterpreted as keeping its review.
         */
        kept_reviews?: Array<number>;
    };
    path: {
        profile_id: number;
    };
    query?: never;
    url: '/api/v1/srs/anki/profiles/{profile_id}/acknowledgements';
};
export type AcknowledgeAnkiChangesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type AcknowledgeAnkiChangesError = AcknowledgeAnkiChangesErrors[keyof AcknowledgeAnkiChangesErrors];
export type AcknowledgeAnkiChangesResponses = {
    /**
     * Sync result.
     */
    200: AnkiSyncProfile;
};
export type AcknowledgeAnkiChangesResponse = AcknowledgeAnkiChangesResponses[keyof AcknowledgeAnkiChangesResponses];
export type InspectMcpTransportData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/mcp';
};
export type InspectMcpTransportErrors = {
    /**
     * Standalone SSE sessions are not supported.
     */
    405: unknown;
};
export type CallMcpData = {
    body: McpRequest;
    path?: never;
    query?: never;
    url: '/api/v1/mcp';
};
export type CallMcpErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The client must accept both application/json and text/event-stream.
     */
    406: unknown;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type CallMcpError = CallMcpErrors[keyof CallMcpErrors];
export type CallMcpResponses = {
    /**
     * JSON-RPC response.
     */
    200: McpResponse;
    /**
     * Notification accepted without a response body.
     */
    202: unknown;
};
export type CallMcpResponse = CallMcpResponses[keyof CallMcpResponses];
export type OauthTokenData = {
    body: OauthTokenRequest;
    path?: never;
    query?: never;
    url: '/api/v1/oauth/token';
};
export type OauthTokenErrors = {
    /**
     * The request could not be granted (RFC 6749 §5.2 vocabulary).
     */
    400: ErrorOauth;
    /**
     * Unknown client, or a confidential client that did not prove itself.
     */
    401: ErrorOauth;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type OauthTokenError = OauthTokenErrors[keyof OauthTokenErrors];
export type OauthTokenResponses = {
    /**
     * A fresh access token, and a refresh token for user-delegated grants.
     */
    200: OauthTokenResponse;
};
export type OauthTokenResponse2 = OauthTokenResponses[keyof OauthTokenResponses];
export type OauthRevokeData = {
    body: OauthRevokeRequest;
    path?: never;
    query?: never;
    url: '/api/v1/oauth/revoke';
};
export type OauthRevokeErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Unknown client, or a confidential client that did not prove itself.
     */
    401: ErrorOauth;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type OauthRevokeError = OauthRevokeErrors[keyof OauthRevokeErrors];
export type OauthRevokeResponses = {
    /**
     * Revoked, or nothing to revoke.
     */
    200: unknown;
};
export type OauthDeviceAuthorizationData = {
    body: OauthDeviceAuthorizationRequest;
    path?: never;
    query?: never;
    url: '/api/v1/oauth/device_authorization';
};
export type OauthDeviceAuthorizationErrors = {
    /**
     * The request could not be granted (RFC 6749 §5.2 vocabulary).
     */
    400: ErrorOauth;
    /**
     * Unknown client, or a confidential client that did not prove itself.
     */
    401: ErrorOauth;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type OauthDeviceAuthorizationError = OauthDeviceAuthorizationErrors[keyof OauthDeviceAuthorizationErrors];
export type OauthDeviceAuthorizationResponses = {
    /**
     * The handshake was started.
     */
    200: OauthDeviceAuthorization;
};
export type OauthDeviceAuthorizationResponse = OauthDeviceAuthorizationResponses[keyof OauthDeviceAuthorizationResponses];
export type SearchData = {
    body: SearchRequest;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/search';
};
export type SearchErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type SearchError = SearchErrors[keyof SearchErrors];
export type SearchResponses = {
    /**
     * Search results.
     */
    200: SearchResults;
};
export type SearchResponse = SearchResponses[keyof SearchResponses];
export type IdentifyWordData = {
    body: IdentifyRequest;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/identify';
};
export type IdentifyWordErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Text exceeds this user's per-request limit.
     */
    413: Error413;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type IdentifyWordError = IdentifyWordErrors[keyof IdentifyWordErrors];
export type IdentifyWordResponses = {
    /**
     * Ranked dictionary spans beginning at the requested position.
     */
    200: IdentifyResults;
};
export type IdentifyWordResponse = IdentifyWordResponses[keyof IdentifyWordResponses];
export type ParseData = {
    body: ParseRequest;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
        /**
         * Queue an authenticated parse when set to `respond-async`.
         */
        Prefer?: 'respond-async';
    };
    path?: never;
    query?: never;
    url: '/api/v1/parse';
};
export type ParseErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Text exceeds the caller's per-request limit.
     */
    413: Error413;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ParseError = ParseErrors[keyof ParseErrors];
export type ParseResponses = {
    /**
     * One preferred parse for each submitted text.
     */
    200: Parse;
    /**
     * The parse was queued. Poll the `Location` URL.
     */
    202: ParseOperation;
};
export type ParseResponse = ParseResponses[keyof ParseResponses];
export type GetParseOperationData = {
    body?: never;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path: {
        id: string;
    };
    query?: never;
    url: '/api/v1/parse/{id}';
};
export type GetParseOperationErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetParseOperationError = GetParseOperationErrors[keyof GetParseOperationErrors];
export type GetParseOperationResponses = {
    /**
     * Current operation state, including the parse when complete.
     */
    200: ParseOperation;
};
export type GetParseOperationResponse = GetParseOperationResponses[keyof GetParseOperationResponses];
export type UnsaveWordData = {
    body: {
        /**
         * Dictionary form (card front).
         */
        lemma: string;
        /**
         * The card's reading; omit for a card saved without one.
         */
        reading?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/srs/saves';
};
export type UnsaveWordErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UnsaveWordError = UnsaveWordErrors[keyof UnsaveWordErrors];
export type UnsaveWordResponses = {
    /**
     * The word after removal, `state` is `none` once its last card is gone. Removing a word with no cards is not an error; the answer simply says so.
     *
     */
    200: {
        word: WordStateEntry;
    };
};
export type UnsaveWordResponse = UnsaveWordResponses[keyof UnsaveWordResponses];
export type SaveCardData = {
    body: SaveRequest;
    path?: never;
    query?: never;
    url: '/api/v1/srs/saves';
};
export type SaveCardErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The sync epoch, collection identity or idempotency key conflicts with stored state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type SaveCardError = SaveCardErrors[keyof SaveCardErrors];
export type SaveCardResponses = {
    /**
     * Word already saved; the existing card.
     */
    200: SaveResponse;
    /**
     * A new card was created.
     */
    201: SaveResponse;
};
export type SaveCardResponse = SaveCardResponses[keyof SaveCardResponses];
export type GradeCardData = {
    body: ReviewRequest;
    path?: never;
    query?: never;
    url: '/api/v1/srs/reviews';
};
export type GradeCardErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The card changed after it was displayed. Read it again before grading.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GradeCardError = GradeCardErrors[keyof GradeCardErrors];
export type GradeCardResponses = {
    /**
     * The graded card with its new schedule, plus the next interval previews.
     */
    200: ReviewResponse;
};
export type GradeCardResponse = GradeCardResponses[keyof GradeCardResponses];
export type StartStudySessionData = {
    body: {
        deckId?: number;
    };
    headers?: {
        /**
         * Unique retry key, scoped to this credential and operation for 24 hours.
         * Repeating the same request returns the original response without applying it
         * again. Reusing the key with another body returns `409`.
         *
         */
        'Idempotency-Key'?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/srs/sessions';
};
export type StartStudySessionErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The study session has ended or expired. Start a new session.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type StartStudySessionError = StartStudySessionErrors[keyof StartStudySessionErrors];
export type StartStudySessionResponses = {
    /**
     * The new session and its next card.
     */
    201: StudySession;
};
export type StartStudySessionResponse = StartStudySessionResponses[keyof StartStudySessionResponses];
export type EndStudySessionData = {
    body?: never;
    path: {
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/sessions/{id}';
};
export type EndStudySessionErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type EndStudySessionError = EndStudySessionErrors[keyof EndStudySessionErrors];
export type EndStudySessionResponses = {
    /**
     * The session has ended.
     */
    204: void;
};
export type EndStudySessionResponse = EndStudySessionResponses[keyof EndStudySessionResponses];
export type GetStudySessionData = {
    body?: never;
    path: {
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/sessions/{id}';
};
export type GetStudySessionErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The study session has ended or expired. Start a new session.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetStudySessionError = GetStudySessionErrors[keyof GetStudySessionErrors];
export type GetStudySessionResponses = {
    /**
     * The current session queue.
     */
    200: StudySession;
};
export type GetStudySessionResponse = GetStudySessionResponses[keyof GetStudySessionResponses];
export type UndoLatestReviewData = {
    body: UndoReviewRequest;
    path?: never;
    query?: never;
    url: '/api/v1/srs/reviews/latest';
};
export type UndoLatestReviewErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The specified review is no longer undoable. No other review was changed.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UndoLatestReviewError = UndoLatestReviewErrors[keyof UndoLatestReviewErrors];
export type UndoLatestReviewResponses = {
    /**
     * The restored card with its reverted schedule.
     */
    200: CardResponse;
};
export type UndoLatestReviewResponse = UndoLatestReviewResponses[keyof UndoLatestReviewResponses];
export type SetWordStateData = {
    body: StateRequest;
    path?: never;
    query?: never;
    url: '/api/v1/srs/states';
};
export type SetWordStateErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type SetWordStateError = SetWordStateErrors[keyof SetWordStateErrors];
export type SetWordStateResponses = {
    /**
     * The word after the change, every card it holds moved to that state.
     */
    200: {
        word: WordStateEntry;
    };
};
export type SetWordStateResponse = SetWordStateResponses[keyof SetWordStateResponses];
export type LookupWordStatesData = {
    body: StateLookupRequest;
    path?: never;
    query?: never;
    url: '/api/v1/srs/states/lookup';
};
export type LookupWordStatesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type LookupWordStatesError = LookupWordStatesErrors[keyof LookupWordStatesErrors];
export type LookupWordStatesResponses = {
    /**
     * Per-word state.
     */
    200: StateList;
};
export type LookupWordStatesResponse = LookupWordStatesResponses[keyof LookupWordStatesResponses];
export type ListDecksData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/srs/decks';
};
export type ListDecksErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListDecksError = ListDecksErrors[keyof ListDecksErrors];
export type ListDecksResponses = {
    /**
     * The owner's decks.
     */
    200: DeckList;
};
export type ListDecksResponse = ListDecksResponses[keyof ListDecksResponses];
export type CreateDeckData = {
    body: DeckRequest;
    headers?: {
        /**
         * Unique retry key, scoped to this credential and operation for 24 hours.
         * Repeating the same request returns the original response without applying it
         * again. Reusing the key with another body returns `409`.
         *
         */
        'Idempotency-Key'?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/srs/decks';
};
export type CreateDeckErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type CreateDeckError = CreateDeckErrors[keyof CreateDeckErrors];
export type CreateDeckResponses = {
    /**
     * The created deck.
     */
    201: DeckResponse;
};
export type CreateDeckResponse = CreateDeckResponses[keyof CreateDeckResponses];
export type DeleteDeckData = {
    body?: never;
    path: {
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/decks/{id}';
};
export type DeleteDeckErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DeleteDeckError = DeleteDeckErrors[keyof DeleteDeckErrors];
export type DeleteDeckResponses = {
    /**
     * The deck was deleted.
     */
    204: void;
};
export type DeleteDeckResponse = DeleteDeckResponses[keyof DeleteDeckResponses];
export type UpdateDeckData = {
    body: DeckRequest;
    path: {
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/decks/{id}';
};
export type UpdateDeckErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UpdateDeckError = UpdateDeckErrors[keyof UpdateDeckErrors];
export type UpdateDeckResponses = {
    /**
     * The updated deck.
     */
    200: DeckResponse;
};
export type UpdateDeckResponse = UpdateDeckResponses[keyof UpdateDeckResponses];
export type ListCardsData = {
    body?: never;
    path?: never;
    query?: {
        /**
         * Restrict to one deck (its id).
         */
        deck?: number;
        /**
         * Restrict by card state. Scheduled cards group by the learner-facing stability ladder (`apprentice` / `proficient` / `master`), not FSRS's internal learning/review/relearning states. `linked` returns cards that follow a dictionary entry and `unlinked` those that need a dictionary-link review. `ignored` is always empty because an ignored word is deliberately not a card. An unknown value is a 400.
         *
         */
        state?: 'all' | 'due' | 'new' | 'apprentice' | 'proficient' | 'master' | 'retired' | 'suspended' | 'leech' | 'linked' | 'unlinked' | 'trash' | 'ignored';
        /**
         * Exact dictionary form (card front). Returns every card the word holds :  one per saved meaning, plus a whole-word card if there is one.
         *
         */
        lemma?: string;
        /**
         * Exact reading, to disambiguate a front that is read more than one way (生: なま / せい). Only meaningful alongside `lemma`.
         *
         */
        reading?: string;
        /**
         * Text search across front, reading and meaning: the website card browser's search. For "every card of this word", use `lemma` instead.
         *
         */
        q?: string;
        /**
         * Maximum number of results to return.
         */
        limit?: number;
        /**
         * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
         * back exactly what `pagination.cursor` gave you with the same operation and
         * filters. Some ranked collections expire cursors when their data changes;
         * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
         * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
         * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
         *
         */
        cursor?: string;
    };
    url: '/api/v1/srs/cards';
};
export type ListCardsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListCardsError = ListCardsErrors[keyof ListCardsErrors];
export type ListCardsResponses = {
    /**
     * A page of cards.
     */
    200: CardList;
};
export type ListCardsResponse = ListCardsResponses[keyof ListCardsResponses];
export type BulkUpdateCardsData = {
    body: {
        /**
         * The card ids to act on.
         */
        ids: Array<number>;
        /**
         * `refresh` recomposes the meanings of cards that match a dictionary entry with that entry's current definition ("use Shirabe definition").
         *
         */
        cardAction: 'suspend' | 'unsuspend' | 'retire' | 'reset' | 'refresh' | 'move' | 'delete' | 'restore' | 'purge';
        /**
         * Target deck for cardAction=move.
         */
        deckId?: number;
    };
    path?: never;
    query?: never;
    url: '/api/v1/srs/cards';
};
export type BulkUpdateCardsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type BulkUpdateCardsError = BulkUpdateCardsErrors[keyof BulkUpdateCardsErrors];
export type BulkUpdateCardsResponses = {
    /**
     * How many cards were updated.
     */
    200: {
        updated: number;
    };
};
export type BulkUpdateCardsResponse = BulkUpdateCardsResponses[keyof BulkUpdateCardsResponses];
export type DeleteCardData = {
    body?: never;
    path: {
        /**
         * The card id.
         */
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/cards/{id}';
};
export type DeleteCardErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DeleteCardError = DeleteCardErrors[keyof DeleteCardErrors];
export type DeleteCardResponses = {
    /**
     * The card was moved to trash.
     */
    204: void;
};
export type DeleteCardResponse = DeleteCardResponses[keyof DeleteCardResponses];
export type GetCardData = {
    body?: never;
    path: {
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/cards/{id}';
};
export type GetCardErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetCardError = GetCardErrors[keyof GetCardErrors];
export type GetCardResponses = {
    /**
     * The card.
     */
    200: CardResponse;
};
export type GetCardResponse = GetCardResponses[keyof GetCardResponses];
export type UpdateCardData = {
    body: CardUpdateRequest;
    path: {
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/cards/{id}';
};
export type UpdateCardErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UpdateCardError = UpdateCardErrors[keyof UpdateCardErrors];
export type UpdateCardResponses = {
    /**
     * The updated card.
     */
    200: CardResponse;
};
export type UpdateCardResponse = UpdateCardResponses[keyof UpdateCardResponses];
export type DueQueueData = {
    body?: never;
    path?: never;
    query?: {
        /**
         * Maximum number of results to return.
         */
        limit?: number;
    };
    url: '/api/v1/srs/due';
};
export type DueQueueErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DueQueueError = DueQueueErrors[keyof DueQueueErrors];
export type DueQueueResponses = {
    /**
     * The study queue.
     */
    200: DueQueue;
};
export type DueQueueResponse = DueQueueResponses[keyof DueQueueResponses];
export type StudyStatsData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/srs/stats';
};
export type StudyStatsErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type StudyStatsError = StudyStatsErrors[keyof StudyStatsErrors];
export type StudyStatsResponses = {
    /**
     * Study stats.
     */
    200: Stats;
};
export type StudyStatsResponse = StudyStatsResponses[keyof StudyStatsResponses];
export type GetSettingsData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/srs/settings';
};
export type GetSettingsErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetSettingsError = GetSettingsErrors[keyof GetSettingsErrors];
export type GetSettingsResponses = {
    /**
     * The current settings.
     */
    200: {
        settings: SrsSettings;
    };
};
export type GetSettingsResponse = GetSettingsResponses[keyof GetSettingsResponses];
export type UpdateSettingsData = {
    body: SrsSettingsUpdate;
    path?: never;
    query?: never;
    url: '/api/v1/srs/settings';
};
export type UpdateSettingsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UpdateSettingsError = UpdateSettingsErrors[keyof UpdateSettingsErrors];
export type UpdateSettingsResponses = {
    /**
     * The updated settings.
     */
    200: {
        settings: SrsSettings;
    };
};
export type UpdateSettingsResponse = UpdateSettingsResponses[keyof UpdateSettingsResponses];
export type GetForecastData = {
    body?: never;
    path?: never;
    query?: {
        /**
         * Horizon in days (1–90, default 30).
         */
        days?: number;
    };
    url: '/api/v1/srs/forecast';
};
export type GetForecastErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetForecastError = GetForecastErrors[keyof GetForecastErrors];
export type GetForecastResponses = {
    /**
     * Per-day due counts.
     */
    200: {
        forecast: Array<{
            date: string;
            young: number;
            mature: number;
        }>;
    };
};
export type GetForecastResponse = GetForecastResponses[keyof GetForecastResponses];
export type ListWordNotesData = {
    body?: never;
    path?: never;
    query?: {
        /**
         * Restrict to notes on this headword.
         */
        text?: string;
        /**
         * Narrow to this reading (with `text`).
         */
        reading?: string;
        /**
         * Maximum number of results to return.
         */
        limit?: number;
        /**
         * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
         * back exactly what `pagination.cursor` gave you with the same operation and
         * filters. Some ranked collections expire cursors when their data changes;
         * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
         * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
         * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
         *
         */
        cursor?: string;
    };
    url: '/api/v1/srs/word_notes';
};
export type ListWordNotesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListWordNotesError = ListWordNotesErrors[keyof ListWordNotesErrors];
export type ListWordNotesResponses = {
    /**
     * The owner's notes.
     */
    200: WordNoteList;
};
export type ListWordNotesResponse = ListWordNotesResponses[keyof ListWordNotesResponses];
export type UpsertWordNoteData = {
    body: WordNoteRequest;
    path?: never;
    query?: never;
    url: '/api/v1/srs/word_notes';
};
export type UpsertWordNoteErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UpsertWordNoteError = UpsertWordNoteErrors[keyof UpsertWordNoteErrors];
export type UpsertWordNoteResponses = {
    /**
     * The note was updated.
     */
    200: WordNoteResponse;
    /**
     * The note was created.
     */
    201: WordNoteResponse;
};
export type UpsertWordNoteResponse = UpsertWordNoteResponses[keyof UpsertWordNoteResponses];
export type DeleteWordNoteData = {
    body?: never;
    path: {
        id: number;
    };
    query?: never;
    url: '/api/v1/srs/word_notes/{id}';
};
export type DeleteWordNoteErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DeleteWordNoteError = DeleteWordNoteErrors[keyof DeleteWordNoteErrors];
export type DeleteWordNoteResponses = {
    /**
     * The note was deleted.
     */
    204: void;
};
export type DeleteWordNoteResponse = DeleteWordNoteResponses[keyof DeleteWordNoteResponses];
export type IgnoreWordData = {
    body: {
        text: string;
        reading?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/srs/word-ignores';
};
export type IgnoreWordErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type IgnoreWordError = IgnoreWordErrors[keyof IgnoreWordErrors];
export type IgnoreWordResponses = {
    /**
     * The word is now ignored.
     */
    201: {
        ignore: {
            text: string;
            reading: string;
        };
    };
};
export type IgnoreWordResponse = IgnoreWordResponses[keyof IgnoreWordResponses];
export type BulkAddSearchData = {
    body: {
        /**
         * The search query, filters and all (e.g. "#jlpt:N3", "食べ").
         */
        query: string;
        /**
         * Target deck; omit to create a new one.
         */
        deckId?: number;
        deckName?: string;
        /**
         * Seed as already known (the terminal `retired` tier) instead of new.
         */
        known?: boolean;
    };
    headers?: {
        /**
         * Unique retry key, scoped to this credential and operation for 24 hours.
         * Repeating the same request returns the original response without applying it
         * again. Reusing the key with another body returns `409`.
         *
         */
        'Idempotency-Key'?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/srs/search-additions';
};
export type BulkAddSearchErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * This action requires Pro, the SRS is the paid product (docs/srs.md §10).
     */
    402: Error402;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type BulkAddSearchError = BulkAddSearchErrors[keyof BulkAddSearchErrors];
export type BulkAddSearchResponses = {
    /**
     * The deck and the seed counts.
     */
    200: {
        deck: Deck;
        added: number;
        skipped: number;
        capped: boolean;
    };
};
export type BulkAddSearchResponse = BulkAddSearchResponses[keyof BulkAddSearchResponses];
export type IdentifyWordsData = {
    body: WordIdentifyRequest;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path?: never;
    query?: never;
    url: '/api/v1/words/identify';
};
export type IdentifyWordsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type IdentifyWordsError = IdentifyWordsErrors[keyof IdentifyWordsErrors];
export type IdentifyWordsResponses = {
    /**
     * One answer per requested token, in the order they were sent.
     */
    200: WordIdentify;
};
export type IdentifyWordsResponse = IdentifyWordsResponses[keyof IdentifyWordsResponses];
export type GetWordData = {
    body?: never;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path: {
        /**
         * **This is a slug, not a number.** It is the word's own spelling, so
         * `願望` and `猫` really are complete, valid ids. If you were expecting
         * something numeric you are thinking of `sourceId`, which is the
         * dictionary's own record number and a different thing (see below).
         *
         * The scheme is `headword`, plus `-<reading>` and `-<sourceId>` only where
         * the headword alone would be ambiguous. Nothing is added that is not
         * needed to name one word:
         *
         * | id | why |
         * |----|-----|
         * | `猫` | one word is written this way |
         * | `私-わたくし` | 私 is also わたし, so the reading names which |
         * | `開く-ひらく-1202650` | both readings are common AND ambiguous |
         *
         * The reading is accepted in hiragana or katakana (`私-わたくし`,
         * `私-ワタクシ`), so a caller holding a morphological analyser's katakana
         * output looks a word up without converting first. An exact kana spelling
         * wins where a homograph writes the same reading both ways.
         *
         * The id is a word handle returned by Search or Identify. Ordinary handles
         * may change when dictionary data or disambiguation changes. A handle
         * carrying a source id (`開く-ひらく-1202650`) continues to resolve that
         * exact dictionary record.
         *
         */
        id: string;
    };
    query?: {
        /**
         * Comma-separated optional blocks. Currently only `sentences` is supported.
         */
        include?: 'sentences';
    };
    url: '/api/v1/words/{id}';
};
export type GetWordErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetWordError = GetWordErrors[keyof GetWordErrors];
export type GetWordResponses = {
    /**
     * Word detail.
     */
    200: WordDetail;
};
export type GetWordResponse = GetWordResponses[keyof GetWordResponses];
export type ListSentencesData = {
    body?: never;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path?: never;
    query?: {
        /**
         * Japanese text or translated text. Required unless `filter[wordId]` is present.
         */
        query?: string;
        filter?: {
            wordId?: string;
            translationLanguages?: Array<string>;
            sources?: Array<string>;
        };
        include?: Array<'tokens'>;
        /**
         * Maximum number of results to return.
         */
        limit?: number;
        /**
         * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
         * back exactly what `pagination.cursor` gave you with the same operation and
         * filters. Some ranked collections expire cursors when their data changes;
         * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
         * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
         * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
         *
         */
        cursor?: string;
    };
    url: '/api/v1/sentences';
};
export type ListSentencesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListSentencesError = ListSentencesErrors[keyof ListSentencesErrors];
export type ListSentencesResponses = {
    /**
     * Matching sentences.
     */
    200: SentenceList;
};
export type ListSentencesResponse = ListSentencesResponses[keyof ListSentencesResponses];
export type GetSentenceData = {
    body?: never;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path: {
        /**
         * URL-encoded sentence handle such as `tatoeba:123456`.
         */
        id: string;
    };
    query?: {
        include?: Array<'tokens'>;
    };
    url: '/api/v1/sentences/{id}';
};
export type GetSentenceErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetSentenceError = GetSentenceErrors[keyof GetSentenceErrors];
export type GetSentenceResponses = {
    /**
     * Sentence detail.
     */
    200: SentenceResponse;
};
export type GetSentenceResponse = GetSentenceResponses[keyof GetSentenceResponses];
export type ListTagsData = {
    body?: never;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path?: never;
    query?: {
        /**
         * Filter to one category (case-insensitive), e.g. `part_of_speech`.
         */
        category?: string;
    };
    url: '/api/v1/tags';
};
export type ListTagsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListTagsError = ListTagsErrors[keyof ListTagsErrors];
export type ListTagsResponses = {
    /**
     * Code definitions.
     */
    200: TagList;
};
export type ListTagsResponse = ListTagsResponses[keyof ListTagsResponses];
export type ListDictionariesData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/dictionaries';
};
export type ListDictionariesErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListDictionariesError = ListDictionariesErrors[keyof ListDictionariesErrors];
export type ListDictionariesResponses = {
    /**
     * Available dictionaries. Returns an ETag for conditional requests.
     */
    200: DictionaryList;
};
export type ListDictionariesResponse = ListDictionariesResponses[keyof ListDictionariesResponses];
export type DeleteDictionaryData = {
    body?: never;
    path: {
        slug: string;
    };
    query?: never;
    url: '/api/v1/dictionaries/{slug}';
};
export type DeleteDictionaryErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DeleteDictionaryError = DeleteDictionaryErrors[keyof DeleteDictionaryErrors];
export type DeleteDictionaryResponses = {
    /**
     * Dictionary access removed.
     */
    204: void;
};
export type DeleteDictionaryResponse = DeleteDictionaryResponses[keyof DeleteDictionaryResponses];
export type GetDictionaryStackData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/dictionary-stack';
};
export type GetDictionaryStackErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetDictionaryStackError = GetDictionaryStackErrors[keyof GetDictionaryStackErrors];
export type GetDictionaryStackResponses = {
    /**
     * Current dictionary stack. Returns an ETag for conditional requests.
     */
    200: DictionaryStack;
};
export type GetDictionaryStackResponse = GetDictionaryStackResponses[keyof GetDictionaryStackResponses];
export type ReplaceDictionaryStackData = {
    body: {
        /**
         * Fingerprint returned by the latest GET. A stale value returns `409`.
         */
        fingerprint: string;
        sources: Array<DictionaryStackSource>;
    };
    path?: never;
    query?: never;
    url: '/api/v1/dictionary-stack';
};
export type ReplaceDictionaryStackErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ReplaceDictionaryStackError = ReplaceDictionaryStackErrors[keyof ReplaceDictionaryStackErrors];
export type ReplaceDictionaryStackResponses = {
    /**
     * Updated dictionary stack.
     */
    200: DictionaryStack;
};
export type ReplaceDictionaryStackResponse = ReplaceDictionaryStackResponses[keyof ReplaceDictionaryStackResponses];
export type ListDictionaryImportsData = {
    body?: never;
    path?: never;
    query?: {
        /**
         * Maximum number of results to return.
         */
        limit?: number;
        /**
         * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
         * back exactly what `pagination.cursor` gave you with the same operation and
         * filters. Some ranked collections expire cursors when their data changes;
         * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
         * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
         * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
         *
         */
        cursor?: string;
    };
    url: '/api/v1/dictionary-imports';
};
export type ListDictionaryImportsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListDictionaryImportsError = ListDictionaryImportsErrors[keyof ListDictionaryImportsErrors];
export type ListDictionaryImportsResponses = {
    /**
     * Imports, newest first.
     */
    200: {
        imports: Array<DictionaryImport>;
        pagination: CursorPagination;
    };
};
export type ListDictionaryImportsResponse = ListDictionaryImportsResponses[keyof ListDictionaryImportsResponses];
export type DeleteDictionaryImportData = {
    body?: never;
    path: {
        id: string;
    };
    query?: never;
    url: '/api/v1/dictionary-imports/{id}';
};
export type DeleteDictionaryImportErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The import is already running and cannot be cancelled safely.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type DeleteDictionaryImportError = DeleteDictionaryImportErrors[keyof DeleteDictionaryImportErrors];
export type DeleteDictionaryImportResponses = {
    /**
     * Import deleted.
     */
    204: void;
};
export type DeleteDictionaryImportResponse = DeleteDictionaryImportResponses[keyof DeleteDictionaryImportResponses];
export type GetDictionaryImportData = {
    body?: never;
    path: {
        id: string;
    };
    query?: never;
    url: '/api/v1/dictionary-imports/{id}';
};
export type GetDictionaryImportErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetDictionaryImportError = GetDictionaryImportErrors[keyof GetDictionaryImportErrors];
export type GetDictionaryImportResponses = {
    /**
     * Import state.
     */
    200: {
        import: DictionaryImport;
    };
};
export type GetDictionaryImportResponse = GetDictionaryImportResponses[keyof GetDictionaryImportResponses];
export type ListDictionaryPacksData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/dictionary-packs';
};
export type ListDictionaryPacksErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
    /**
     * The requested generated artifact is not currently available.
     */
    503: Error503;
};
export type ListDictionaryPacksError = ListDictionaryPacksErrors[keyof ListDictionaryPacksErrors];
export type ListDictionaryPacksResponses = {
    /**
     * Current account stack and its downloadable artifacts. Returns an ETag for conditional requests.
     */
    200: DictionaryStackManifest;
    /**
     * The account stack is current, but one or more private offline packs are building.
     */
    202: DictionaryStackManifest;
};
export type ListDictionaryPacksResponse = ListDictionaryPacksResponses[keyof ListDictionaryPacksResponses];
export type GetCurrentDictionaryPackData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/dictionary-packs/current';
};
export type GetCurrentDictionaryPackErrors = {
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The requested generated artifact is not currently available.
     */
    503: Error503;
};
export type GetCurrentDictionaryPackError = GetCurrentDictionaryPackErrors[keyof GetCurrentDictionaryPackErrors];
export type GetCurrentDictionaryPackResponses = {
    /**
     * Current pack manifest. Returns an ETag for conditional requests.
     */
    200: DictionaryPackManifest;
};
export type GetCurrentDictionaryPackResponse = GetCurrentDictionaryPackResponses[keyof GetCurrentDictionaryPackResponses];
export type DownloadShirabeDictionaryPackData = {
    body?: never;
    path: {
        revision: string;
    };
    query?: never;
    url: '/api/v1/dictionary-packs/shirabe/{revision}';
};
export type DownloadShirabeDictionaryPackErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
    /**
     * The requested generated artifact is not currently available.
     */
    503: Error503;
};
export type DownloadShirabeDictionaryPackError = DownloadShirabeDictionaryPackErrors[keyof DownloadShirabeDictionaryPackErrors];
export type DownloadShirabeDictionaryPackResponses = {
    /**
     * Gzip-compressed newline-delimited JSON records.
     */
    200: Blob | File;
};
export type DownloadShirabeDictionaryPackResponse = DownloadShirabeDictionaryPackResponses[keyof DownloadShirabeDictionaryPackResponses];
export type GetDictionaryPackData = {
    body?: never;
    path: {
        slug: string;
        revision: string;
    };
    query?: never;
    url: '/api/v1/dictionary-packs/{slug}/{revision}';
};
export type GetDictionaryPackErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
    /**
     * The requested generated artifact is not currently available.
     */
    503: Error503;
};
export type GetDictionaryPackError = GetDictionaryPackErrors[keyof GetDictionaryPackErrors];
export type GetDictionaryPackResponses = {
    /**
     * Gzip-compressed newline-delimited JSON records.
     */
    200: Blob | File;
};
export type GetDictionaryPackResponse = GetDictionaryPackResponses[keyof GetDictionaryPackResponses];
export type GetReaderHostRulesData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/reader/host-rules';
};
export type GetReaderHostRulesErrors = {
    /**
     * Resource not found.
     */
    404: Error404;
};
export type GetReaderHostRulesError = GetReaderHostRulesErrors[keyof GetReaderHostRulesErrors];
export type GetReaderHostRulesResponses = {
    /**
     * Current host-rule data.
     */
    200: ReaderHostRules;
};
export type GetReaderHostRulesResponse = GetReaderHostRulesResponses[keyof GetReaderHostRulesResponses];
export type GetMeData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/me';
};
export type GetMeErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetMeError = GetMeErrors[keyof GetMeErrors];
export type GetMeResponses = {
    /**
     * Account profile and usage.
     */
    200: Me;
};
export type GetMeResponse = GetMeResponses[keyof GetMeResponses];
export type RevokeOwnKeyData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/me/key';
};
export type RevokeOwnKeyErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type RevokeOwnKeyError = RevokeOwnKeyErrors[keyof RevokeOwnKeyErrors];
export type RevokeOwnKeyResponses = {
    /**
     * The credential is revoked. Nothing is returned.
     */
    204: void;
};
export type RevokeOwnKeyResponse = RevokeOwnKeyResponses[keyof RevokeOwnKeyResponses];
export type GetPreferencesData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/preferences';
};
export type GetPreferencesErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetPreferencesError = GetPreferencesErrors[keyof GetPreferencesErrors];
export type GetPreferencesResponses = {
    /**
     * Reader preferences.
     */
    200: {
        preferences: {
            uiLocale: string;
            sentenceLanguages: Array<string>;
            sentenceTranslation: 'show' | 'hover' | 'hide';
        };
    };
};
export type GetPreferencesResponse = GetPreferencesResponses[keyof GetPreferencesResponses];
export type UpdatePreferencesData = {
    body: {
        /**
         * Ordered example-sentence languages; `ja` is the immersion marker.
         */
        sentenceLanguages?: Array<'ja' | 'en' | 'es' | 'fr' | 'de' | 'nl' | 'ru' | 'sv' | 'hu' | 'sl'>;
        /**
         * How an example sentence's translation is revealed.
         */
        sentenceTranslation?: 'show' | 'hover' | 'hide';
    };
    path?: never;
    query?: never;
    url: '/api/v1/preferences';
};
export type UpdatePreferencesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request body uses an unsupported media type.
     */
    415: Error415;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type UpdatePreferencesError = UpdatePreferencesErrors[keyof UpdatePreferencesErrors];
export type UpdatePreferencesResponses = {
    /**
     * Updated reader preferences.
     */
    200: {
        preferences: {
            sentenceLanguages: Array<string>;
            sentenceTranslation: 'show' | 'hover' | 'hide';
        };
    };
};
export type UpdatePreferencesResponse = UpdatePreferencesResponses[keyof UpdatePreferencesResponses];
export type ListKanjiData = {
    body?: never;
    path?: never;
    query?: {
        /**
         * Which field to group + sort by.
         */
        groupBy?: 'jlpt' | 'kanken' | 'strokes' | 'radical' | 'frequency';
        /**
         * Index filters. `group` uses the value format selected by `groupBy`.
         */
        filter?: {
            group?: string;
        };
        /**
         * Maximum number of results to return.
         */
        limit?: number;
        /**
         * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
         * back exactly what `pagination.cursor` gave you with the same operation and
         * filters. Some ranked collections expire cursors when their data changes;
         * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
         * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
         * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
         *
         */
        cursor?: string;
    };
    url: '/api/v1/kanji';
};
export type ListKanjiErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListKanjiError = ListKanjiErrors[keyof ListKanjiErrors];
export type ListKanjiResponses = {
    /**
     * Grouped kanji index.
     */
    200: KanjiIndex;
};
export type ListKanjiResponse = ListKanjiResponses[keyof ListKanjiResponses];
export type ListKanjiRadicalsData = {
    body?: never;
    path?: never;
    query?: {
        groupBy?: 'strokes' | 'number' | 'position';
    };
    url: '/api/v1/kanji/radicals';
};
export type ListKanjiRadicalsErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListKanjiRadicalsError = ListKanjiRadicalsErrors[keyof ListKanjiRadicalsErrors];
export type ListKanjiRadicalsResponses = {
    /**
     * Grouped radical forms.
     */
    200: RadicalIndex;
};
export type ListKanjiRadicalsResponse = ListKanjiRadicalsResponses[keyof ListKanjiRadicalsResponses];
export type GetKanjiRadicalData = {
    body?: never;
    path: {
        /**
         * Radical number, 1-214.
         */
        number: number;
    };
    query?: {
        /**
         * Maximum number of results to return.
         */
        limit?: number;
        /**
         * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
         * back exactly what `pagination.cursor` gave you with the same operation and
         * filters. Some ranked collections expire cursors when their data changes;
         * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
         * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
         * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
         *
         */
        cursor?: string;
    };
    url: '/api/v1/kanji/radicals/{number}';
};
export type GetKanjiRadicalErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetKanjiRadicalError = GetKanjiRadicalErrors[keyof GetKanjiRadicalErrors];
export type GetKanjiRadicalResponses = {
    /**
     * Radical and member kanji.
     */
    200: RadicalResponse;
};
export type GetKanjiRadicalResponse = GetKanjiRadicalResponses[keyof GetKanjiRadicalResponses];
export type ListKanjiComponentsData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/api/v1/kanji/components';
};
export type ListKanjiComponentsErrors = {
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListKanjiComponentsError = ListKanjiComponentsErrors[keyof ListKanjiComponentsErrors];
export type ListKanjiComponentsResponses = {
    /**
     * Components grouped by stroke count.
     */
    200: KanjiComponentIndex;
};
export type ListKanjiComponentsResponse = ListKanjiComponentsResponses[keyof ListKanjiComponentsResponses];
export type ListKanjiComponentMatchesData = {
    body?: never;
    path?: never;
    query?: {
        /**
         * Component glyphs that every returned character must contain.
         */
        components?: Array<string>;
        /**
         * Maximum number of results to return.
         */
        limit?: number;
        /**
         * Signed pagination cursor returned by a previous response. Treat it as opaque: pass
         * back exactly what `pagination.cursor` gave you with the same operation and
         * filters. Some ranked collections expire cursors when their data changes;
         * `409 CURSOR_EXPIRED` means to restart from the first page. A malformed or
         * cross-operation cursor returns `400 INVALID_CURSOR`. Offset-backed collections
         * stop after 10000 results and return `400 CURSOR_TOO_DEEP`.
         *
         */
        cursor?: string;
    };
    url: '/api/v1/kanji/component-matches';
};
export type ListKanjiComponentMatchesErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * The request conflicts with the current resource state.
     */
    409: Error409;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type ListKanjiComponentMatchesError = ListKanjiComponentMatchesErrors[keyof ListKanjiComponentMatchesErrors];
export type ListKanjiComponentMatchesResponses = {
    /**
     * Matching kanji and available components.
     */
    200: KanjiComponentMatches;
};
export type ListKanjiComponentMatchesResponse = ListKanjiComponentMatchesResponses[keyof ListKanjiComponentMatchesResponses];
export type GetKanjiData = {
    body?: never;
    headers?: {
        /**
         * Preferred language for Shirabe-owned labels. Regional tags and weighted
         * language lists are accepted; unsupported languages fall back to English.
         * Dictionary definition languages are selected separately by each operation.
         *
         */
        'Accept-Language'?: string;
    };
    path: {
        /**
         * Exactly one Unicode grapheme. URL-encode the kanji when needed.
         */
        character: string;
    };
    query?: {
        /**
         * Optional character detail blocks.
         */
        include?: Array<'compounds' | 'readingExamples' | 'lookalikes' | 'relatedKanji' | 'radicalMembers' | 'strokeOrder' | 'references' | 'foreignReadings'>;
    };
    url: '/api/v1/kanji/{character}';
};
export type GetKanjiErrors = {
    /**
     * Malformed request or failed validation.
     */
    400: Error400;
    /**
     * Missing, invalid, expired, or revoked bearer token. Carries a
     * `WWW-Authenticate: Bearer` challenge (RFC 6750); an OAuth client that reads
     * `error="invalid_token"` should renew with its refresh token and retry once.
     *
     */
    401: Error401;
    /**
     * The API key lacks a scope required for this operation.
     */
    403: Error403;
    /**
     * Resource not found.
     */
    404: Error404;
    /**
     * Too many requests; back off and retry after `Retry-After` seconds.
     *
     * There is one kind of 429 now. It comes from in front of the application, which
     * is why the answer is a wait and nothing else: the budget it names refills on a
     * fixed 60-second window, so retrying after the header says is enough. There is
     * no monthly quota and no `RateLimit-*` fields to read.
     *
     * A request that is too LARGE is not this: that answers 413 with no
     * `Retry-After`, because waiting cannot make it acceptable. `GET /api/v1/me` reports
     * both ceilings, under `rateLimit` and `payloadLimit`.
     *
     */
    429: Error429;
};
export type GetKanjiError = GetKanjiErrors[keyof GetKanjiErrors];
export type GetKanjiResponses = {
    /**
     * Kanji entry.
     */
    200: KanjiResponse;
};
export type GetKanjiResponse = GetKanjiResponses[keyof GetKanjiResponses];
//# sourceMappingURL=types.gen.d.ts.map