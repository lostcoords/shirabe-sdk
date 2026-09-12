import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const compiled = await build({
  stdin: {
    contents: 'export {snapshotHost,validateSnapshot} from "./src/word-card/snapshot-host.ts"; export {toDefinition} from "./src/word-card/api-host.ts"; export {glossLanguagesFrom} from "./src/word-card/languages.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true, platform: "node", format: "esm", write: false,
});
const { snapshotHost, validateSnapshot, toDefinition, glossLanguagesFrom } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
const { snapshot, identify, parse } = JSON.parse(readFileSync(0, "utf8"));
assert.deepEqual(validateSnapshot(snapshot), snapshot);
const token = snapshot.segments[0].tokens.find((item) => item.content !== false);
const parsed = parse.tokens.find((item) => item.position === token.start);
const candidate = identify.words[0].candidates.find((item) => `${item.dictionary}:${item.sourceId}` === token.entry);
assert.ok(candidate);
const apiBase = "https://fixture.invalid";
const languages = glossLanguagesFrom(snapshot.preferences.languages);
const expected = toDefinition(candidate, apiBase, languages);
Object.assign(expected, { offline: true, preparedAt: snapshot.createdAt });
if (parsed.inflection?.labels.length) Object.assign(expected, {
  sourceForm: parsed.surface, inflection: parsed.inflection.labels, inflectionBase: parsed.inflection.base,
});
expected.pitch = expected.pitch.map((pitch) => ({ ...pitch, audioUrl: null }));
expected.senses = expected.senses.map((sense) => ({ ...sense, covered: snapshot.preferences.dictionaryReveal[sense.ref.split("#")[0]] === "hover" }));
const text = snapshot.segments[0].text;
const host = snapshotHost(undefined, snapshot, { apiBase, contentVersion: snapshot.contentVersion, texts: [text] });
const savedToken = (await host.tokenize(text)).find((item) => item.start === token.start);
assert.deepEqual(savedToken.inflection, parsed.inflection?.labels);
assert.equal(savedToken.inflectionBase, parsed.inflection?.base);
const result = await host.lookupEntry(token.entry, parsed.surface);
assert.equal(result.status, "found");
assert.deepEqual(result.definition, expected);
assert.equal(result.definition.examples.length, 0);
for (const language of ["ja", "es"]) {
  const wanted = candidate.entries.flatMap((entry) => entry.senses.flatMap((sense) => sense.definitions)).filter((definition) => definition.lang === language);
  assert.ok(wanted.length);
  for (const definition of wanted) assert.ok(result.definition.senses.some((sense) => sense.glosses.some((gloss) => gloss.text === definition.text)));
}
assert.deepEqual((await host.lookup(text, "text")).definition, expected);
process.stdout.write(JSON.stringify({ offlineContentParity: true, snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)) }));
