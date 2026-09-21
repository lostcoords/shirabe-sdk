# @shirabe-org/card

The Shirabe word card, and nothing about where it runs.

`word-card` renders one word: its headword and reading, pitch, senses, forms,
kanji, examples, and the controls for saving it. It reaches the world through a
`WordCardHost` that whoever mounts it provides, so the same card runs in the
browser extension over a local dictionary pack, in a web page over
`/api/v1`, and on an Anki template over a script tag.

There is deliberately no lookup engine here: deinflection and the pack live in
the extension, which is what the card is a consumer of rather than a part of.

See [`docs/plans/word-card-library.md`](../../docs/plans/word-card-library.md).

## What a host has to answer

[`src/word-card/host.ts`](src/word-card/host.ts) is the contract, and it carries
its own reasoning member by member: why `study` is absent rather than empty on a
host with no account, why `audio` exists at all, why `save`, `markKnown` and
`grade` are each optional. Read it there. A copy of the type in this file was
wrong on nearly every line within a day the last time one was written.

Two methods are required and the rest are capabilities. A host that cannot do
something omits it, and the card draws no control for it rather than a control
that refuses.

## Mount it over your own lookup

The card does not find words. You mark them, and you tell it when to open.

```ts
import {
  DEFAULT_CARD_OPTIONS,
  scheduleShow,
  setCardHost,
  setPopupOptions,
  setWriteState,
} from "@shirabe-org/card/word-card";
import type { Definition, WordCardHost } from "@shirabe-org/card/word-card";

declare function myDictionary(query: string): Promise<Definition | null>;

const host: WordCardHost = {
  async lookup(query) {
    return { status: "found", definition: await myDictionary(query) };
  },
  async lookupEntry(entry) {
    return { status: "found", definition: await myDictionary(entry) };
  },
};

setCardHost(host);
setWriteState({ canWrite: false, connected: false });
setPopupOptions(DEFAULT_CARD_OPTIONS);

document.body.addEventListener("mouseover", (event) => {
  const word = (event.target as Element | null)?.closest?.(".sb-word");
  if (word) scheduleShow(word as HTMLElement);
});
```

A word is any element with class `sb-word` and a `data-lemma`. Add
`data-surface` where the text on the page differs from the dictionary form, and
`data-entry` where you already know which dictionary word it is: the card calls
`lookupEntry` for those and `lookup` for the rest.

[`playground/main.ts`](playground/main.ts) is this snippet as a page you can
open, and [`test/fake-host.ts`](test/fake-host.ts) is a whole host in 40 lines.

## Back it with Shirabe's API instead

`apiHost` is the mapping from our API onto the card, so a second consumer does
not write it again.

```ts
import { apiHost, withFallback } from "@shirabe-org/card/word-card";
import type { WordCardHost } from "@shirabe-org/card/word-card";

declare const readerToken: string | undefined;

const online = apiHost({
  apiBase: "https://shirabe.org",
  token: readerToken,
  languages: ["eng"],
});

declare const pack: WordCardHost;
const host = withFallback(pack, online);
```

`withFallback(primary, fallback)` asks the second host only when the first has
no answer, and takes everything except lookups from the first: a save never goes
somewhere else because a lookup missed.

Three things about this API cost real bugs before they were written down, and
`apiHost` already does all three:

- **A tapped word is `POST /words/identify`, not `GET /words/{id}`.** The id
  lookup resolves a spelling against headwords and ignores the reading, so 開いた
  read ヒライタ comes back as あく. It answers confidently and nothing alerts.
- **`pos` must be the server's own short tag** (`noun`, `verb`, `prt`). A tag
  from another vocabulary does not skip a ranking rung, it returns no candidates
  at all. That was live in Nadeshiko until 2.4.1.
- **Identify returns a ranked list, not a verdict.** Rendering
  `candidates.first` is what made 宿主 offer しゅくしゅ and never やどぬし.

Pass `fetch` to route requests somewhere else, which is how the Anki add-on
keeps its credential in Python. Pass `link` to let the card sign a reader in by
itself, for a surface with nowhere else to do it.

## Load it from one script tag

For an Anki card template, a userscript, or a plain HTML page: no build, no
package manager, one global.

```html
<script src="https://cdn.shirabe.org/card/v1/shirabe-card.js"></script>
<script>
  ShirabeCard.attach({
    api: { apiBase: "https://shirabe.org" },
    canWrite: false,
  });
</script>
```

`attach` does the whole job the two snippets above do by hand: it builds the
host, cuts the text into words where the host can (`POST /api/v1/parse`), falls
back to reading raw text under the pointer where it cannot, and binds hover,
modifier, click and touch. [`examples/anki-card.html`](examples/anki-card.html)
is the entire integration, and
[`src/standalone.ts`](src/standalone.ts) documents every option.

Keep the handle returned by `attach` and call `handle.detach()` when removing
that area of the page. Each root has its own host and settings; they share one
visible popup. `handle.show(word)` opens a word through that root's host.
Calling `attach` again on the same root replaces its configuration and detaches
the previous handle. Use `handle.reread()` to process new text without changing
the configuration.
`ShirabeCard.detach()` removes all attachments.

**It must stay an IIFE.** A card template is loaded from `file://`, where a
module script is a cross-origin load and fails silently. Anything that turns
this build back into a module breaks every Anki deck at once and looks like
nothing happening.

Build it with `npm run build:cdn` (`dist/shirabe-card.js`), and publish it with
`bin/rails card_bundle:publish` from the repository root.

## Theming

The card builds into a shadow root, so a host's stylesheet cannot reach inside
it, including the `!important` a shared Anki deck carries. You set tokens, never
templates.

There are 33 of them, all named `--sb-*`:

```sh
grep -o -- "--sb-[a-z0-9-]*" src/word-card/card.ts | sort -u
```

Set them on the element the card mounts under. `data-sb-theme` takes `light` or
`dark` and overrides the reader's OS setting; without it the card follows
`prefers-color-scheme`. `--sb-definition-size` is set from
`setPopupOptions({ definitionSize })` rather than by hand.

**The oldest browser that renders this card decides what CSS it may use.** Anki
25.09 draws cards in Qt WebEngine 6.9, which is Chromium 122, so the palette is
plain sRGB with no `light-dark()`, `oklch()` or `color-mix()`. An unsupported
colour function does not degrade: the declaration is invalid, `var()` on it
computes to inherit, and the card draws in the host page's colour.
[`test/css-baseline.test.ts`](test/css-baseline.test.ts) fails on any feature
newer than the declared baseline. Raise that baseline deliberately, with the
add-on's `min_point_version` in the same change.

## Distribution

The library build emits JavaScript and declarations into `dist`, and the npm
archive contains only that build, its MIT license, this README, and the package
manifest. The
repository root owns the release check. `bin/package-check` packs both Shirabe packages,
installs their tarballs into a clean consumer, exercises the root and deep
runtime exports, and type-checks their public declarations.

```sh
bin/package-check
```

Publish a GitHub release whose tag matches the manifest version, for example
`card-v<version>`. `.github/workflows/npm-release.yml` checks that the exact API
version this package depends on is already on npm, verifies both tarballs, and
publishes the card through npm trusted publishing.

## License

The renderer is available under the [MIT License](LICENSE). Content and data
rendered by the package retain their own terms.

**Nothing is at `cdn.shirabe.org/card/v1/` yet**, so the script tag above is
written and unreachable until `card_bundle:publish` has run.

**Import it deeply, not through the barrel.** `src/word-card/index.ts`
re-exports every module, so `import { placeCard } from "@shirabe-org/card/word-card"`
pulls the whole card in, and a background worker would bundle the popup UI.
Inside this repository every non-card import goes straight at the module it
wants, [`src/word-card/placement.ts`](src/word-card/placement.ts) rather than the
barrel above it. The barrel is for consumers who want the card itself.

## Working on it

```sh
npm install
npm test          # the card, driven by a host with nothing behind it
npm run check     # types
npm run dev       # the playground: http://localhost:4477
```

**The playground is the second host.** It renders a few Japanese lines and opens
the real card over them, backed by `playground/host.ts`: no extension, no pack,
no account, no network, and every call the card makes to its host printed on the
page. That is the claim this package exists to make, so it is worth running
before believing a change is safe.

Its sentences are written out already cut into words (`playground/corpus.ts`).
The package renders a card; tokenizing a page is the extension's job, and
pretending to do it here would test the wrong thing.

`npm test` is the same idea without a browser: `test/fake-host.ts` is a host in
40 lines. If that file becomes hard to write, the contract has drifted, and the
right response is to fix the contract rather than the fake. It also typechecks
every TypeScript block in this file, so a snippet here cannot quietly stop
compiling.
