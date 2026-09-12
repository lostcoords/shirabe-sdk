import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The card renders inside browsers we do not choose, and the oldest of them is
// the one that decides what CSS we may write. Anki is the binding case: version
// 25.09 draws cards in Qt WebEngine 6.9, which is Chromium 122, and a Chromium
// that old is ordinary for a desktop app that bundles its own.
//
// This file exists because `light-dark()` (Chromium 123) shipped in the card and
// made EVERY colour variable invalid there. The card still rendered, so it did
// not look like a CSS problem: it looked like the stylesheet had failed to load,
// and the text drew in whatever colour the host page happened to be.
//
// Raise BASELINE_CHROMIUM deliberately, with the add-on's `min_point_version` in
// the same change. Never raise it to make this test pass.
const BASELINE_CHROMIUM = 111;

const TOO_NEW: Array<[RegExp, number, string]> = [
  [/light-dark\s*\(/, 123, "light-dark()"],
  [/field-sizing\s*:/, 123, "field-sizing"],
  [/\banchor-name\s*:/, 125, "anchor positioning"],
  [/@scope\b/, 118, "@scope"],
  [/@starting-style\b/, 117, "@starting-style"],
  [/text-wrap\s*:\s*(balance|pretty)/, 114, "text-wrap: balance/pretty"],
  [/color-mix\s*\(/, 111, "color-mix()"],
  [/oklch\s*\(/, 111, "oklch()"],
  [/::highlight\s*\(/, 105, "::highlight()"],
  [/@container\b/, 105, "@container"],
  [/:has\s*\(/, 105, ":has()"],
];

// Only the stylesheet, not the prose around it: the comment above names
// light-dark() on purpose, and a check that cannot tell those apart is one that
// punishes writing down why.
function stylesheet(): string {
  return blockIn("src/word-card/card.ts", "const CSS = `");
}

// The words on the page are styled by a second sheet, in the host's own DOM
// rather than the shadow root, and it renders in exactly the same browsers.
// It went unchecked until a rule was added to it.
function pageStyles(): string {
  return blockIn("src/word-card/page.ts", "export const PAGE_CSS = `");
}

function blockIn(path: string, opener: string): string {
  const source = readFileSync(path, "utf8");
  const opens = source.indexOf(opener);
  assert.ok(opens >= 0, `found the stylesheet in ${path}`);
  return source.slice(opens, source.indexOf("`;", opens)).replace(/\/\*[\s\S]*?\*\//g, "");
}

test("every stylesheet we ship stays inside the oldest browser that renders it", () => {
  for (const [where, css] of [["the card", stylesheet()], ["the page", pageStyles()]] as const) {
    const beyond = TOO_NEW.filter(([pattern, since]) => since > BASELINE_CHROMIUM && pattern.test(css));
    assert.deepEqual(
      beyond.map(([, since, name]) => `${name} needs Chromium ${since}`),
      [],
      `${where}: the baseline is Chromium ${BASELINE_CHROMIUM}`,
    );
  }
});

test("no colour depends on a function the baseline cannot parse", () => {
  const css = stylesheet();
  // The failure was silent rather than loud: an unsupported colour function makes
  // the whole declaration invalid, `var()` on it computes to inherit, and the
  // card draws in the page's colour rather than in none at all.
  const declarations = [...css.matchAll(/(--sb-[\w-]+)\s*:\s*([^;]+);/g)];
  assert.ok(declarations.length > 20, "found the palette");
  for (const [, name, value] of declarations) {
    assert.doesNotMatch(value!, /light-dark\s*\(/, `${name} would be invalid on the baseline`);
  }
});

test("dark is reached by a media query, so a browser without light-dark() still themes", () => {
  const css = stylesheet();
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /:host\(:not\(\[data-sb-theme="light"\]\)\)/, "the OS default, overridable to light");
  assert.match(css, /:host\(\[data-sb-theme="dark"\]\)/, "and the reader's own choice");
});
