import assert from "node:assert/strict";
import test from "node:test";
import { pitchCategory, renderDefinitionHtml, renderPitchHtml } from "../src/word-card/export-html.js";
import type { Sense } from "../src/word-card/types.js";

test("definition export escapes dictionary content and keeps language, usage, and note rows", () => {
  const sense = {
    position: 0, partsOfSpeech: [], tags: [],
    glosses: [{ lang: "jpn", tag: "JA", text: "<script>bad</script>", title: "意味" }],
    usages: [{ lang: "jpn", tag: "JA", text: "用例 & 説明" }],
    notes: ["<note>"],
  } as Sense;
  const html = renderDefinitionHtml([sense], "card");
  assert.match(html, /class="card-senses"/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html, /用例 &amp; 説明/);
  assert.match(html, /&lt;note&gt;/);
  assert.doesNotMatch(html, /<script>|<note>/);
  assert.throws(() => renderDefinitionHtml([sense], "x\" onclick=\"bad"));
});

test("pitch export uses the same mora boundaries for category and HTML", () => {
  assert.equal(pitchCategory("きょう", 2), "odaka");
  assert.match(renderPitchHtml("きょう", 2, "card"), /class="card-mora">きょ<\/span><span class="card-mora card-mora--high card-mora--drop">う/);
});
