/**
 * How a word looks on the page, as opposed to how the card looks.
 *
 * The card lives in a shadow root and brings its own styling. The words do not:
 * they are spans in the host's own DOM, and without this they are indent-for-
 * indent identical to the text around them. A reader then has no way to know a
 * word can be hovered, no feedback while hovering it, and no sign of what they
 * already know, which is most of what the reader is for.
 *
 * The extension has its own, richer version of this (`content.css`) covering
 * i+1 marks, per-site suspension and its own settings. This is the shared floor
 * for a host that has none of that: an Anki card, a web page.
 *
 * Same browser floor as the card: no `light-dark()`, no `oklch()`, no
 * `color-mix()`. See `test/css-baseline.test.ts`.
 */

const STYLE_ID = "shirabe-word-styles";

export const PAGE_CSS = `
.sb-word {
  cursor: pointer;
  border-radius: 3px;
  /* The cue is a decoration rather than a border: a border changes the size of
     a word, and a line of subtitles cannot afford to reflow under the pointer.
     A decoration also follows the text through a line wrap. */
  text-decoration-line: underline;
  text-decoration-style: var(--sb-cue-style, solid);
  text-decoration-color: var(--sb-cue, transparent);
  text-underline-offset: 0.16em;
  text-decoration-thickness: 0.1em;
  /* Japanese descends into the underline; skipping ink would break the line
     under half the glyphs on the page. */
  text-decoration-skip-ink: none;
  transition: background-color 0.12s ease;
}

/* The one thing a reader needs before they know anything else: that this is a
   word they can ask about. */
.sb-word:hover {
  background-color: rgba(3, 105, 161, 0.14);
}

/* The word the card is currently about, held for as long as it is open.
   Stronger than the hover tint, because it answers a different question: hover
   says "you could ask about this", and this says "this is the one you asked
   about". It is also the only feedback a touch reader gets, and the only one
   that survives moving the pointer onto the card to read it. */
.sb-word.sb-word-open {
  background-color: rgba(3, 105, 161, 0.24);
}

/* The same answer for the other path. A raw-text scan has no span to mark, so
   the matched run is drawn with the CSS Custom Highlight API, which never
   disturbs the reader's own text selection. Registering it without this rule
   drew nothing at all: the extension styles this in content.css and every
   other host was left with an invisible highlight. */
::highlight(sb-scan) {
  background-color: rgba(3, 105, 161, 0.24);
}

/* What you already know, left to right from "learn this" to "got it". A word
   you have finished with is deliberately unmarked: the marks are the exceptions,
   and a page where everything is marked says nothing. */
.sb-word[data-state="new"] { --sb-cue: #0369a1; }
.sb-word[data-state="learning"] { --sb-cue: #f59e0b; }
.sb-word[data-state="due"] { --sb-cue: #ef4444; }
.sb-word[data-state="retired"] { --sb-cue: transparent; }

@media (prefers-color-scheme: dark) {
  .sb-word:hover { background-color: rgba(125, 211, 252, 0.18); }
  .sb-word.sb-word-open { background-color: rgba(125, 211, 252, 0.30); }
  ::highlight(sb-scan) { background-color: rgba(125, 211, 252, 0.30); }
  .sb-word[data-state="new"] { --sb-cue: #38bdf8; }
  .sb-word[data-state="learning"] { --sb-cue: #fbbf24; }
  .sb-word[data-state="due"] { --sb-cue: #f87171; }
}

@media (prefers-reduced-motion: reduce) {
  .sb-word { transition: none; }
}

/* Forced colours replaces our hues with system ones, so every state would
   collapse to the same line. The STYLE is what still separates them. */
@media (forced-colors: active) {
  /* A tint is not guaranteed to survive here, so the open word is named with a
     system pair that is. */
  .sb-word.sb-word-open { background-color: Highlight; color: HighlightText; }
  ::highlight(sb-scan) { background-color: Highlight; color: HighlightText; }
  .sb-word[data-state="new"] { --sb-cue: LinkText; --sb-cue-style: double; }
  .sb-word[data-state="learning"] { --sb-cue: LinkText; --sb-cue-style: dashed; }
  .sb-word[data-state="due"] { --sb-cue: LinkText; --sb-cue-style: dotted; }
}
`;

/**
 * Put the word styles on a page, once.
 *
 * Appended to `<head>` rather than injected per word, and marked by id so a host
 * that re-attaches (an Anki card re-rendering as you flip it) does not stack
 * copies. Returns whether it added anything, which is only useful to a test.
 */
export function installPageStyles(doc: Document = document): boolean {
  if (doc.getElementById(STYLE_ID)) return false;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PAGE_CSS;
  (doc.head ?? doc.documentElement).append(style);
  return true;
}
