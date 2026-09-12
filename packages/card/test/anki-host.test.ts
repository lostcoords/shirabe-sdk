import assert from "node:assert/strict";
import test from "node:test";
import { createAnkiHost } from "../src/word-card/anki-host.js";
import type { Link } from "../src/word-card/link.js";

function setup(scope = true) {
  const calls: string[] = [];
  let connected = true;
  let time = 0;
  let signedOut = 0;
  const detail = {
    id: "猫-ねこ", dictionary: "personal", sourceId: "1", headword: "猫", reading: "ねこ",
    common: true, forms: [], pitch: [], entries: [
      { order: 0, dictionary: "personal", type: "definition", sourceId: "1", senses: [
        { position: 3, definitions: [{ lang: "es", text: "gato" }, { lang: "en", text: "cat" }], tags: [] },
      ] },
    ],
  };
  const link: Link = {
    linked: () => connected,
    signOut: () => { connected = false; signedOut++; },
    signIn: async () => { connected = true; },
    fetch: async (input) => {
      const path = String(input);
      calls.push(path);
      if (path.endsWith("/me")) return new Response(JSON.stringify({
        credential: { scopes: scope ? ["READ_ACCOUNT"] : [] },
        preferences: { languages: ["es", "en"], stackFingerprint: "stack1", dictionaryReveal: { "personal:es": "hover" } },
      }));
      if (path.includes("/sentences?")) return new Response(JSON.stringify({
        sentences: [{ id: "tatoeba:1", japanese: "猫だ。", source: "Tatoeba", translations: [
          { lang: "en", text: "A cat." }, { lang: "es", text: "Un gato." },
        ] }], pagination: { hasMore: false, cursor: null },
      }));
      return new Response(JSON.stringify({ words: [{ candidates: [detail] }] }));
    },
  };
  const host = createAnkiHost({ apiBase: "https://shirabe.org", link, now: () => time });
  return { host, link, calls, setTime: (value: number) => { time = value; }, signedOut: () => signedOut };
}

test("Anki reads dictionary preferences on demand, preserving language, reveal mode and sense identity", async () => {
  const { host, calls } = setup();
  assert.equal(calls.length, 0);
  const result = await host.lookup("猫", "word");
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.definition?.senses[0].glosses[0].text, "gato");
  assert.equal(result.definition?.senses[0].covered, true);
  assert.equal(result.definition?.senses[0].ref, "personal#3");
  assert.match(calls[1], /locale=es/);
  assert.equal(host.study?.save, undefined);
});

test("old Anki sessions explicitly reconnect instead of silently ignoring uploaded dictionaries", async () => {
  const fixture = setup(false);
  const result = await fixture.host.lookup("猫", "word");
  assert.equal(result.status, "pending");
  assert.equal(fixture.calls.length, 1);
  await fixture.host.resolvePending!(() => {});
  assert.equal(fixture.signedOut(), 1);
});

test("cached private results are not returned after sign-out, and preferences refresh after a minute", async () => {
  const fixture = setup();
  assert.equal(fixture.host.account?.connected?.(), true);
  await fixture.host.lookup("猫", "word");
  await fixture.host.lookup("猫", "word");
  assert.equal(fixture.calls.length, 2);
  fixture.setTime(61_000);
  await fixture.host.lookup("猫", "word");
  assert.equal(fixture.calls.length, 4);
  fixture.link.signOut();
  assert.equal(fixture.host.account?.connected?.(), false);
  assert.equal((await fixture.host.lookup("猫", "word")).status, "pending");
  assert.equal(fixture.calls.length, 4);
});

test("signing out during a lookup cannot return the previous account's private definition", async () => {
  const fixture = setup();
  const original = fixture.link.fetch;
  let release!: () => void;
  const parked = new Promise<void>((resolve) => { release = resolve; });
  fixture.link.fetch = async (input, init) => {
    const response = await original(input, init);
    if (!String(input).endsWith("/me")) await parked;
    return response;
  };
  const result = fixture.host.lookup("猫", "word");
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.link.signOut();
  release();
  assert.equal((await result).status, "pending");
});

test("Anki corpus search uses saved translation preferences and loses access after sign-out", async () => {
  const fixture = setup();
  const result = await fixture.host.exampleSearch!({ query: "猫" });
  assert.equal(result.examples[0].translation, "Un gato.");
  assert.equal(result.examples[0].translationLanguage, "es");
  assert.equal(result.examples[0].reference, "tatoeba:1");
  assert.equal(fixture.calls.length, 2);
  fixture.host.account!.signOut();
  await assert.rejects(fixture.host.exampleSearch!({ query: "猫" }), /Sign in/);
  assert.equal(fixture.calls.length, 2);
});
