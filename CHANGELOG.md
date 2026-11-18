# Changelog

## Unreleased

- API 0.8.0: `setWordState` is gone. Mark a word known with `markWordKnown` and take it back with `unmarkWordKnown`; stop ignoring a word with `unignoreWord`. `ignoreWord`, `markWordKnown` and `gradeCard` take an `Idempotency-Key`. `saveCard` and `markWordKnown` no longer take `newDeckName`: create the deck first with `createDeck`. A parsed token's `study` block is typed as the word state it carries.
- Card: `escapeHtml`, `renderDefinitionHtml`, `renderPitchHtml` and `pitchCategory` are gone. Nothing called them.
- Card 0.3.0: a host with `study.unmarkKnown` offers Not known on a known word, and one with `study.unignore` offers Stop ignoring on an ignored word, each in place of the button that set it.
- Card: a host with `study.ignore` gets an Ignore button beside Known for an unsaved word. `WordState` gains `ignored`, a word with no card the learner chose never to study; it is unmarked and can still be saved.
- Card: `Sense.ref` is required, and the sense picker no longer guesses `jmdict#<position>` for a sense without one. A host names each sense by its own dictionary, so a pick from a second stacked dictionary saves and shows as saved under that dictionary.
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
