import assert from "node:assert/strict";
import test from "node:test";
import type { CardToken, WordCardHost } from "../src/word-card/host.js";

// Wrapping edits a real DOM, so the test needs one.
let shared: Promise<typeof import("../src/word-card/wrap.js")> | null = null;
async function load() {
  if (!shared) {
    shared = (async () => {
      const { Window } = await import("happy-dom");
      const window = new Window({ url: "https://anki.test/card" });
      Object.assign(globalThis, {
        window, document: window.document, HTMLElement: window.HTMLElement,
        Node: window.Node, NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment,
        getComputedStyle: window.getComputedStyle.bind(window),
      });
      return import("../src/word-card/wrap.js");
    })();
  }
  return shared;
}

/** Cuts on a fixed vocabulary, so a test says what it means about boundaries. */
function tokenizer(words: string[]): WordCardHost {
  return {
    lookup: async () => ({ status: "found", definition: null }),
    lookupEntry: async () => ({ status: "found", definition: null }),
    async tokenize(text) {
      const tokens: CardToken[] = [];
      let cursor = 0;
      while (cursor < text.length) {
        const word = words.find((w) => text.startsWith(w, cursor));
        if (word) {
          tokens.push({ surface: word, start: cursor, length: word.length, lemma: word, pos: "noun", content: true });
          cursor += word.length;
        } else {
          tokens.push({ surface: text[cursor]!, start: cursor, length: 1, content: false });
          cursor += 1;
        }
      }
      return tokens;
    },
  };
}

async function wrapped(html: string, words: string[]) {
  const { wrapWords } = await load();
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  await wrapWords(root, tokenizer(words));
  return root;
}

test("each word gets its own span, so a hover is a word rather than a guess", async () => {
  const root = await wrapped("<p>猫が窓に座る。</p>", ["猫", "窓", "座る"]);
  const spans = [...root.querySelectorAll(".sb-word")].map((s) => s.textContent);
  assert.deepEqual(spans, ["猫", "窓", "座る"]);
  assert.equal(root.textContent, "猫が窓に座る。", "and the reader's text is unchanged");
});

test("the span carries what makes a lookup about THIS word, not just its spelling", async () => {
  // 開いた read ヒライタ is ひらく; asked with the spelling alone the server
  // answers あく, confidently and wrongly.
  const root = await wrapped("<p>猫</p>", ["猫"]);
  const span = root.querySelector(".sb-word") as HTMLElement;
  assert.equal(span.dataset.surface, "猫");
  assert.equal(span.dataset.lemma, "猫");
  assert.equal(span.dataset.pos, "noun");
});

test("punctuation is cut like anything else and is not made hoverable", async () => {
  const root = await wrapped("<p>猫が</p>", ["猫"]);
  assert.deepEqual([...root.querySelectorAll(".sb-word")].map((s) => s.textContent), ["猫"]);
  assert.match(root.innerHTML, /が/);
});

test("a resolved token carries its dictionary pin into the clickable span", async () => {
  const { wrapWords } = await load();
  const root = document.createElement("div");
  root.textContent = "猫";
  document.body.append(root);
  const host: WordCardHost = {
    ...tokenizer(["猫"]),
    tokenize: async () => [{ surface: "猫", start: 0, length: 1, entry: "personal:cat:1" }],
  };
  await wrapWords(root, host);
  assert.equal((root.querySelector(".sb-word") as HTMLElement).dataset.entry, "personal:cat:1");
});

test("the page's own markup survives, and script and ruby text are left alone", async () => {
  const root = await wrapped(
    '<p><b>猫</b>が<script>var x = "猫";</script><ruby>窓<rt>まど</rt></ruby></p>',
    ["猫", "窓", "まど"],
  );
  assert.match(root.innerHTML, /<b>.*猫.*<\/b>/, "the bold tag still holds its word");
  assert.match(root.innerHTML, /var x = "猫"/, "a script is code, not prose");
  assert.match(root.innerHTML, /<rt>まど<\/rt>/, "ruby text is already a reading");
});

test("running twice does not nest a span inside a span", async () => {
  const { wrapWords } = await load();
  const root = document.createElement("div");
  root.innerHTML = "<p>猫が座る。</p>";
  document.body.append(root);
  const host = tokenizer(["猫", "座る"]);
  await wrapWords(root, host);
  const first = root.innerHTML;
  await wrapWords(root, host);
  assert.equal(root.innerHTML, first, "a page that adds content can re-run this");
});

test("a host that cannot tokenize is left to scan, rather than half-wrapping", async () => {
  const { wrapWords } = await load();
  const root = document.createElement("div");
  root.innerHTML = "<p>猫が座る。</p>";
  const noParser: WordCardHost = {
    lookup: async () => ({ status: "found", definition: null }),
    lookupEntry: async () => ({ status: "found", definition: null }),
  };
  assert.equal(await wrapWords(root, noParser), 0);
  assert.equal(root.querySelectorAll(".sb-word").length, 0);
});

test("text with no Japanese is never sent to the tokenizer", async () => {
  const { wrapWords } = await load();
  const asked: string[] = [];
  const host = tokenizer(["猫"]);
  const spy: WordCardHost = { ...host, tokenize: async (t) => { asked.push(t); return host.tokenize!(t); } };
  const root = document.createElement("div");
  root.innerHTML = "<p>Level 5 &mdash; deck stats</p><p>猫</p>";
  document.body.append(root);
  await wrapWords(root, spy);
  assert.deepEqual(asked, ["猫"], "an English line is not a parse request");
});

test("a touch reader gets the same words, which is the half a phone can use", async () => {
  // AnkiDroid and AnkiMobile have no hover at all, and a phone is where most
  // Anki reviewing happens. Wrapping is what makes a tap targetable: without a
  // span there is nothing under the finger to look up.
  const root = await wrapped("<p>猫が窓に座る。</p>", ["猫", "窓", "座る"]);
  const spans = [...root.querySelectorAll(".sb-word")] as HTMLElement[];
  assert.equal(spans.length, 3);
  for (const span of spans) {
    assert.ok(span.dataset.lemma, "a tap needs something to look up");
  }
});

// Wrapping happens to every Japanese run as the page renders, without anyone
// asking for it. A host that cannot cut right now must not throw out of it: in
// an Anki card that lands as an unhandled rejection inside somebody else's deck.
test("a host that cannot cut wraps nothing instead of throwing", async () => {
  const { wrapWords } = await load();
  document.body.innerHTML = "<div>猫が窓に座る。</div>";

  const refusing: WordCardHost = {
    lookup: async () => ({ status: "found", definition: null }),
    lookupEntry: async () => ({ status: "found", definition: null }),
    tokenize: async () => { throw new Error("Bearer token required."); },
  };

  assert.equal(await wrapWords(document.body, refusing), 0);
});

test("parsing excludes hidden answers, controls, ruby readings and opted-out fields", async () => {
  const { wrapWords, collectReadableRuns } = await load();
  document.body.innerHTML = `<div id="review">
    <span hidden><b>秘密</b></span><span style="display:none">秘密</span>
    <span style="visibility:hidden">秘密</span><span aria-hidden="true">秘密</span>
    <span inert>秘密</span><button><b>秘密</b></button><a href="/answer">秘密</a>
    <span contenteditable>秘密</span><ruby>猫<rt><b>秘密</b></rt></ruby>
    <details><summary>見出し</summary>秘密</details><span class="excluded">秘密</span>
    <span class="cloze">[...]</span><span class="cloze">犬</span>
  </div>`;
  const asked: string[] = [];
  const host = tokenizer(["猫", "犬", "見出し", "秘密"]);
  const spy = { ...host, tokenize: async (text: string) => { asked.push(text.trim()); return host.tokenize!(text); } };
  assert.deepEqual(collectReadableRuns(document.querySelector("#review")!, { skip: ".excluded" }), ["猫\n    ", "\n    [...]犬\n  "]);
  await wrapWords(document.querySelector("#review")!, spy, { skip: ".excluded" });
  assert.deepEqual(asked, ["猫", "[...]犬"]);
  assert.deepEqual([...document.querySelectorAll(".sb-word")].map((word) => word.textContent), ["猫", "犬"]);
});

test("offline collection and parsing see the same exact mixed-markup runs", async () => {
  const { collectReadableRuns, wrapWords } = await load();
  document.body.innerHTML = '<div>  猫と<ruby>犬<rt>いぬ</rt></ruby><em>が座る。</em><span class="cloze">[...]</span></div>';
  const root = document.body.firstElementChild!;
  const markup = root.innerHTML;
  const runs = collectReadableRuns(root);
  assert.deepEqual(runs, ["  猫と犬が座る。[...]"]);
  assert.equal(root.innerHTML, markup);
  const asked: string[] = [];
  const host = { ...tokenizer([]), tokenize: async (text: string) => { asked.push(text); return []; } };
  await wrapWords(root, host);
  assert.deepEqual(asked, runs);
});

test("one token crosses inline and ruby markup without losing its identity or changing the markup", async () => {
  const { collectReadableRuns, wrapWords } = await load();
  document.body.innerHTML = '<p>勉<span><ruby>強<rt>きょう</rt></ruby></span>する。</p>';
  const root = document.body.firstElementChild!;
  const inline = root.querySelector("span")!;
  const ruby = root.querySelector("ruby")!;
  const reading = root.querySelector("rt")!;
  let clicked = 0;
  inline.addEventListener("click", () => clicked++);
  assert.deepEqual(collectReadableRuns(root), ["勉強する。"]);
  const parsed: string[] = [];
  const host = { ...tokenizer([]), tokenize: async (text: string) => {
    parsed.push(text);
    return [{ surface: "勉強", lemma: "勉強", reading: "ベンキョウ", entry: "jmdict:study", start: 0, length: 2 }];
  } };
  assert.equal(await wrapWords(root, host), 1, "one token, even when it has two DOM fragments");
  assert.deepEqual(parsed, ["勉強する。"]);
  const fragments = [...root.querySelectorAll<HTMLElement>(".sb-word")];
  assert.deepEqual(fragments.map((fragment) => fragment.textContent), ["勉", "強"]);
  for (const fragment of fragments) {
    assert.equal(fragment.dataset.surface, "勉強");
    assert.equal(fragment.dataset.lemma, "勉強");
    assert.equal(fragment.dataset.reading, "ベンキョウ");
    assert.equal(fragment.dataset.entry, "jmdict:study");
    assert.equal(fragment.dataset.sentence, "勉強する。");
    assert.equal(fragment.dataset.targetStart, "0");
    assert.equal(fragment.dataset.targetEnd, "2");
  }
  assert.equal(root.querySelector("ruby"), ruby);
  assert.equal(root.querySelector("rt"), reading);
  assert.equal(reading.textContent, "きょう");
  inline.dispatchEvent(new window.Event("click"));
  assert.equal(clicked, 1);
  assert.equal(root.textContent, "勉強きょうする。");
  const markup = root.innerHTML;
  await wrapWords(root, host);
  assert.equal(root.innerHTML, markup);
});

test("logical runs stop at block, line-break and hidden-answer boundaries", async () => {
  const { collectReadableRuns } = await load();
  document.body.innerHTML = '<div>猫<br>犬<p>勉<span>強</span></p><span>強</span><span hidden>秘密</span><span>調</span></div>';
  assert.deepEqual(collectReadableRuns(document.body.firstElementChild!), ["猫", "犬", "勉強", "強", "調"]);
});

test("inflection metadata follows every fragment of a token across inline markup", async () => {
  const { wrapWords } = await load();
  document.body.innerHTML = '<p>食<em>べた</em>猫</p>';
  const root = document.body.firstElementChild!;
  const inflection = ["past", "polite"];
  const host = { ...tokenizer([]), tokenize: async () => [
    { surface: "食べた", lemma: "食べる", entry: "jmdict:eat", start: 0, length: 3, inflection, inflectionBase: "食べる" },
    { surface: "猫", lemma: "猫", start: 3, length: 1 },
  ] };
  assert.equal(await wrapWords(root, host), 2);
  const words = [...root.querySelectorAll<HTMLElement>(".sb-word")];
  assert.deepEqual(words.map(word => word.textContent), ["食", "べた", "猫"]);
  for (const word of words.slice(0, 2)) {
    assert.equal(word.dataset.inflection, JSON.stringify(inflection));
    assert.equal(word.dataset.inflectionBase, "食べる");
    assert.equal(word.dataset.surface, "食べた");
    assert.equal(word.dataset.entry, "jmdict:eat");
  }
  assert.equal(words[2]!.dataset.inflection, undefined);
  assert.equal(words[2]!.dataset.inflectionBase, undefined);
});

test("selected lookup reads one bounded visible run without changing selection or markup", async () => {
  const { readableSelection } = await load();
  document.body.innerHTML = '<div><p>前。 <ruby>勉<rt>べん</rt></ruby><em>強する</em>。<span hidden>秘密</span></p></div>';
  const root = document.body.firstElementChild!;
  const ruby = root.querySelector("ruby")!;
  const range = document.createRange();
  range.setStart(ruby.firstChild!, 0);
  range.setEnd(root.querySelector("em")!.firstChild!, 2);
  const markup = root.innerHTML;
  const selected = readableSelection(range, root)!;
  assert.equal(selected.query, "勉強す");
  assert.equal(selected.node, ruby.firstChild);
  assert.equal(selected.offset, 0);
  assert.equal(selected.sentence, "勉強する。");
  assert.equal(selected.targetStart, 0);
  assert.equal(root.innerHTML, markup);
  assert.equal(range.endOffset, 2);
  range.selectNodeContents(root);
  assert.equal(readableSelection(range, root)?.query, "前。 勉強する。");
});

test("selection lookup rejects hidden, control, cross-root, disjoint and overlong text", async () => {
  const { readableSelection } = await load();
  for (const html of ['<p hidden>秘密</p>', '<p style="opacity:0">秘密</p>', '<button>猫</button>',
    '<p>猫<span hidden>秘密</span>犬</p>', '<p>猫</p><p>犬</p>', `<p>${"猫".repeat(33)}</p>`, '<p>English</p>']) {
    document.body.innerHTML = `<div>${html}</div>`;
    const root = document.body.firstElementChild!;
    const range = document.createRange();
    range.selectNodeContents(root);
    assert.equal(readableSelection(range, root), null, html);
  }
  document.body.innerHTML = '<p>猫</p><p>犬</p>';
  const range = document.createRange();
  range.selectNodeContents(document.body);
  assert.equal(readableSelection(range, document.body.firstElementChild!), null);
  range.selectNodeContents(document.body.firstElementChild!);
  range.collapse(true);
  assert.equal(readableSelection(range, document.body), null);
});

test("a wrapped token carries its own sentence and offsets after earlier sentences", async () => {
  const root = await wrapped("猫が座る。  犬が鳴く。", ["犬"]);
  const word = root.querySelector<HTMLElement>(".sb-word")!;
  assert.equal(word.dataset.sentence, "犬が鳴く。");
  assert.equal(word.dataset.targetStart, "0");
  assert.equal(word.dataset.targetEnd, "1");
});

test("editing another inline fragment during parsing invalidates the entire token", async () => {
  const { wrapWords } = await load();
  document.body.innerHTML = '<p>勉<span>強</span></p>';
  const root = document.body.firstElementChild!;
  let finish!: (tokens: CardToken[]) => void;
  const host = { ...tokenizer([]), tokenize: () => new Promise<CardToken[]>((resolve) => { finish = resolve; }) };
  const pending = wrapWords(root, host);
  root.querySelector("span")!.after(document.createTextNode("する"));
  finish([{ surface: "勉強", start: 0, length: 2 }]);
  assert.equal(await pending, 0);
  assert.equal(root.innerHTML, "勉<span>強</span>する");
});

test("an answer hidden while parsing is pending stays untouched", async () => {
  const { wrapWords } = await load();
  document.body.innerHTML = "<div>猫</div>";
  const root = document.body.firstElementChild as HTMLElement;
  let resolve!: (tokens: CardToken[]) => void;
  const host = { ...tokenizer(["猫"]), tokenize: () => new Promise<CardToken[]>((done) => { resolve = done; }) };
  const pending = wrapWords(root, host);
  root.hidden = true;
  resolve([{ surface: "猫", start: 0, length: 1 }]);
  assert.equal(await pending, 0);
  assert.equal(root.innerHTML, "猫");
});

test("invalid token offsets cannot replace the learner's text", async () => {
  const { wrapWords } = await load();
  for (const tokens of [
    [{ surface: "犬", start: 0, length: 1 }],
    [{ surface: "猫", start: -1, length: 1 }],
    [{ surface: "猫", start: 0, length: 3 }],
    [{ surface: "猫", start: 0, length: 1 }, { surface: "猫", start: 0, length: 1 }],
  ]) {
    document.body.innerHTML = "<div>猫</div>";
    const root = document.body.firstElementChild!;
    const host = { ...tokenizer(["猫"]), tokenize: async () => tokens };
    assert.equal(await wrapWords(root, host), 0);
    assert.equal(root.innerHTML, "猫");
  }
});

test("a failed study request does not reject page attachment", async () => {
  const { paintStates } = await load();
  const root = await wrapped("猫", ["猫"]);
  const host = { ...tokenizer(["猫"]), study: {
    states: async () => { throw new Error("Offline"); },
    urlForWord: async () => undefined,
    apply: () => { throw new Error("must not paint"); },
  } };
  assert.equal(await paintStates(root, host), 0);
});

test("a delayed study answer cannot paint a replaced word identity", async () => {
  const { paintStates } = await load();
  const root = await wrapped("猫", ["猫"]);
  let finish!: () => void;
  let painted = 0;
  const host = { ...tokenizer(["猫"]), study: {
    states: () => new Promise<{ 猫: { state: "new"; decks: [] } }>((resolve) => { finish = () => resolve({ 猫: { state: "new", decks: [] } }); }),
    urlForWord: async () => undefined,
    apply: () => { painted++; },
  } };
  const pending = paintStates(root, host);
  root.querySelector<HTMLElement>(".sb-word")!.dataset.lemma = "犬";
  finish();
  assert.equal(await pending, 0);
  assert.equal(painted, 0);
});
