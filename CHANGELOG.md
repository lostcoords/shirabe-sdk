# Changelog

## Card 0.4.0

Depends on exactly `@shirabe-org/api` 0.10.0. Breaks hosts that compared `candidateHost`'s `Definition.entry` with a candidate `id`.

- An element with `data-entry` is looked up with its whole token. `lookupEntry(entry, surface, word, context)` receives the span's `lemma`, `surface`, `reading` and `pos`, and the built-in hosts rank by them. Before, they asked with the surface as the lemma and no reading or part of speech, so 開いた read ヒライタ could open あく.
- `data-entry` takes a parse token's `wordId` (`開く-ひらく`) as well as a `slug:sourceId` handle. `apiHost.tokenize` carries each token's `wordId` as its `entry`.
- An entry no candidate carries any more, as after a dictionary re-import renamed it, opens the top-ranked candidate instead of "No entry".
- `candidateHost` sets `Definition.entry` to the candidate's `slug:sourceId`, as `apiHost` does, in place of its word handle. The card writes that back to `data-entry`, so a host's save gets the `dictionarySlug` and `sourceId` `POST /srs/saves` links by.
- `apiHost` asks identify once per token, and a picked chip or entry reuses that answer.
- The results overview names each word's part of speech (Pronoun, Interjection) in place of a "Word" badge on every row. Names and articles keep their badges. `TokenCandidate.pos` names a candidate chip's part of speech, and the chip shows it when another chip is spelled and read alike.
- `--sb-popup-radius`, `--sb-popup-padding`, `--sb-font-family` and `--sb-font-size` style the card's shell, defaulting to 18px, 16px 18px, the system font stack and 15px. A host no longer needs `customCss` on `.sb-popup`.
- `candidateHost` takes `presentationForTag` and `labelForTag`, as `apiHost` does.
- A usage note in none of the reader's `languages` is dropped. Glosses keep their fallback to every language. `candidateHost`'s `filterDefinitions` also receives each sense's usages, and `hiddenGlossLanguages` folds usage notes with the glosses of those languages.

## API 0.10.0

Generated from Shirabe contract 0.10.0. This is the first API release since 0.6.1, and it breaks callers. Contract 0.9.0 was never published on its own, so its changes are listed here too.

- A card's lifecycle, senses and field sources are resources of their own: `suspendCard` and `resumeCard`, `rescopeCard`, and `setCardSources`. `updateCard` takes only the card's own `meaning`, which is now required, and `CardUpdateRequest` loses `refresh`, `keepMine`, `senses` and `lifecycle`.
- `Card.note` carries its `kind` (`vocab`, `kanji` or `writing`) in place of a note `type` and `fields`. `Card.template` loses `id`, and `Card` loses `clozeNumber`.
- A parsed token can carry its `wordId`.
- `syncAnkiCollection` (`POST /srs/anki/sync`) and its `AnkiSync*` types are generated from the contract, where the endpoint is marked planned. Shirabe does not serve it yet.
- The Anki sync operations are gone: all 25 calls under `/srs/anki/profiles`, among them `pairAnkiProfile`, `unlinkAnkiProfile`, `startAnkiSnapshot`, `applyAnkiBatch`, `deliverAnkiChanges`, `acknowledgeAnkiChanges` and the media, conflict, note deletion and review undo calls, with their types (`AnkiSyncProfile`, `AnkiSyncBatchRequest`, `AnkiMediaFile`, `AnkiNoteDeletion`, `AnkiReviewUndo` and the rest).
- `saveCard` no longer answers 409, `Error409.code` no longer includes `SYNC_CONFLICT`, and `StudySession` no longer has `limited`.
- `setWordState` is gone. Mark a word known with `markWordKnown` and take it back with `unmarkWordKnown`; stop ignoring a word with `unignoreWord`. `ignoreWord`, `markWordKnown` and `gradeCard` take an `Idempotency-Key`. `saveCard` and `markWordKnown` no longer take `newDeckName`: create the deck first with `createDeck`. A parsed token's `study` block is typed as the word state it carries.

## Card 0.3.0

Depends on exactly `@shirabe-org/api` 0.10.0. Breaks hosts that relied on a guessed sense ref or the removed helpers.

- `Sense.ref` is required, and the sense picker no longer guesses `jmdict#<position>` for a sense without one. A host names each sense by its own dictionary, so a pick from a second stacked dictionary saves and shows as saved under that dictionary.
- A host with `study.ignore` gets an Ignore button beside Known for an unsaved word. `WordState` gains `ignored`, a word with no card the learner chose never to study; it is unmarked and can still be saved.
- A host with `study.unmarkKnown` offers Not known on a known word, and one with `study.unignore` offers Stop ignoring on an ignored word, each in place of the button that set it.
- `escapeHtml`, `renderDefinitionHtml`, `renderPitchHtml` and `pitchCategory` are gone. Nothing called them.
- Sign-in polls the device flow at the interval the server states, and never more than once a second. The 5 second default applies only when the server gives none.
- The "Saved in" line names the decks a host returns from `study.deckNames(word)`. The card no longer reads `data-deck-names` from the word's span, where the page's own scripts could read it.

## Release workflow

- Publish API and card SDK releases from a verified Shirabe production commit when its OpenAPI version increases. Backend dispatch replaces daily spec polling; manual package releases remain available.
- Reject contract edits without an API version bump, wait for the API dependency before publishing the card, and resume partially completed releases without bumping versions again.

## Card 0.2.1

- Republish the lookup-only SDK after npm published the 0.2.0 metadata without making its archive available.

## Card 0.2.0

- Remove copy, field-selection, and example-search controls from the dictionary popup. Native Anki note tools remain in the add-on.
- Remove the authoring and example-search host APIs and the `showAuthoring` option.
- Keep lookup retry, saved-lookup labels, and read-only study status independent of the removed controls.
- Keep keyboard focus in the popup when retrying a raw-text lookup after a temporary failure.

## Card 0.1.5

- Keep the signed-out offline label and account connection action on one line.
- Hide the separator together with the connection action after signing in.

## Card 0.1.4

- A signed-out lookup offers a connect action instead of a sentence the reader cannot click.
- Show the offline mode label for local lookups and allow hosts to hide lookup history controls.
- The pronunciation button uses Shirabe's speaker icon instead of an emoji.

## Card 0.1.3

- Keep raw-text lookups hidden until the matched headword is known, instead of showing the full sentence while loading.
- Keep dictionary results in one continuous scroll area without resizing the popup on wheel input.
- Match Shirabe's default light and dark theme colors.
