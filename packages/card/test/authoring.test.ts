import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { authoringActions } from "../src/word-card/authoring.js";
import type { AuthoringPort, AuthoringSelection, ExampleSearch, ExampleSearchResult } from "../src/word-card/host.js";
import { apiHost } from "../src/word-card/api-host.js";
import type { Definition, Example, StudyDetails } from "../src/word-card/types.js";
import { fakeHost } from "./fake-host.js";
import { kimi, taberu } from "./fixtures.js";

const window = new Window({ url: "https://example.test" });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement,
  Node: window.Node, NodeFilter: window.NodeFilter, DOMRect: window.DOMRect,
  getComputedStyle: window.getComputedStyle.bind(window),
});

const definition: Definition = {
  ...taberu,
  baseForm: "食べる",
  senses: [taberu.senses[0], { ...taberu.senses[1], ref: "daijirin#7" }],
  examples: [
    { japanese: "ご飯を食べた。", translation: "I ate rice.", tokens: [{ surface: "食べた", lemma: "食べる" }] },
    { japanese: "パンを食べる。", translation: null },
  ],
};

function render(port?: AuthoringPort, def = definition, loadExamples?: (signal: AbortSignal) => Promise<Example[]>, search?: ExampleSearch) {
  const word = document.createElement("span");
  word.dataset.surface = "食べた";
  word.dataset.sentence = "昨日、ご飯を食べた。";
  const section = authoringActions(def, word, port, loadExamples, search);
  document.body.replaceChildren(section);
  return section;
}

function button(section: ParentNode, label: string): HTMLButtonElement {
  const found = [...section.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === label);
  assert.ok(found, `button ${label} exists`);
  return found;
}

function checks(section: ParentNode, title: string): HTMLInputElement[] {
  const fieldset = [...section.querySelectorAll("fieldset")].find((fieldset) => fieldset.querySelector("legend")?.textContent === title);
  assert.ok(fieldset, `fieldset ${title} exists`);
  return [...fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

test("each native capability independently offers its action, with copy available without a host", () => {
  for (const [port, expected] of [
    [undefined, []],
    [{ addNote() {} }, ["Add Anki note"]],
    [{ updateNote() {} }, ["Update this note"]],
    [{ findNotes() {} }, ["Find in Anki"]],
  ] as const) {
    const section = render(port);
    const labels = [...section.querySelectorAll("button")].map((button) => button.textContent);
    assert.deepEqual(labels.filter((label) => !label?.startsWith("Copy")), expected);
    assert.equal(button(section, "Copy expression").disabled, false);
    assert.equal(button(section, "Copy reading").disabled, false);
    assert.equal(button(section, "Copy selected definition").disabled, false);
    assert.equal(button(section, "Copy selected examples").disabled, true);
  }
});

test("choosing a surface, meaning and example sends the same exact selection to all native actions", async () => {
  const proposals: AuthoringSelection[] = [];
  const propose = (selection: AuthoringSelection) => { proposals.push(selection); };
  const section = render({ addNote: propose, updateNote: propose, findNotes: propose });
  const expression = section.querySelector("select")!;
  assert.equal(expression.closest("label")?.firstChild?.textContent, "Expression");
  expression.value = "食べた";
  expression.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event);
  checks(section, "Meanings")[0].closest("label")!.click();
  checks(section, "Examples")[0].closest("label")!.click();
  for (const label of ["Add Anki note", "Update this note", "Find in Anki"]) {
    button(section, label).click();
    await settle();
  }
  assert.deepEqual(proposals, Array.from({ length: 3 }, () => ({
    surface: "食べた", lemma: "食べる", entry: "jmdict:1358280", expression: "食べた", reading: "たべる",
    contextSentence: "昨日、ご飯を食べた。", senseRefs: ["daijirin#7"], definition: "to live on (e.g. a salary)",
    examples: [{ japanese: "ご飯を食べた。", translation: "I ate rice." }],
    sourceUrl: definition.url,
  })));
  assert.equal(section.querySelector('[aria-label="Copy and note status"]')?.textContent, "Request sent to Anki.");
});

test("copy uses selected plain text, never ruby, markup or unselected examples", async () => {
  const copied: string[] = [];
  window.navigator.clipboard.writeText = async (value) => { copied.push(value); };
  const section = render(undefined, { ...definition, senses: [
    definition.senses[0], { ...definition.senses[1], glosses: [{ lang: "eng", tag: "EN", text: "<script>literal</script>" }] },
  ] });
  checks(section, "Meanings")[0].click();
  checks(section, "Examples")[0].click();
  for (const label of ["Copy expression", "Copy reading", "Copy selected definition", "Copy selected examples"]) {
    button(section, label).click();
    await settle();
  }
  assert.deepEqual(copied, ["食べる", "たべる", "<script>literal</script>", "ご飯を食べた。\nI ate rice."]);
  assert.equal(section.querySelector("script"), null);
  assert.equal(section.querySelector('[aria-label="Copy and note status"]')?.textContent, "Copied.");
});

test("pitch and supported audio are opt-in independent selections with source provenance", async () => {
  const proposals: AuthoringSelection[] = [];
  const section = render({ insertableAudioUrls: [definition.pitch[0].audioUrl!], addNote: (selection) => { proposals.push(selection); } }, {
    ...definition, pitch: [...definition.pitch, { downstep: 0, audioUrl: "file:///secret.opus" }],
  });
  const picks = checks(section, "Pitch and audio");
  assert.equal(picks.length, 3);
  button(section, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].pitch, undefined);
  assert.equal(proposals[0].audioUrls, undefined);
  picks[0].click();
  button(section, "Add Anki note").click();
  await settle();
  assert.deepEqual(proposals[1].pitch, [2]);
  assert.equal(proposals[1].audioUrls, undefined);
  picks[0].click();
  picks[2].click();
  button(section, "Add Anki note").click();
  await settle();
  assert.equal(proposals[2].pitch, undefined);
  assert.deepEqual(proposals[2].audioUrls, [definition.pitch[0].audioUrl]);
  assert.equal(proposals[2].sourceUrl, definition.url);
});

test("note audio is unavailable unless the authoring host explicitly supports insertion", async () => {
  for (const insertableAudioUrls of [undefined, [], ["https://elsewhere.test/audio.opus"], [definition.pitch[0].audioUrl!]]) {
    const proposals: AuthoringSelection[] = [];
    const section = render({ insertableAudioUrls, addNote: (selection) => { proposals.push(selection); } });
    const allowed = insertableAudioUrls?.includes(definition.pitch[0].audioUrl!);
    const picks = checks(section, allowed ? "Pitch and audio" : "Pitch accent");
    assert.equal(picks.length, allowed ? 2 : 1);
    picks[0].click();
    button(section, "Add Anki note").click();
    await settle();
    assert.deepEqual(proposals[0].pitch, [2]);
    assert.equal(proposals[0].audioUrls, undefined);
  }
  const section = render({ insertableAudioUrls: [definition.pitch[0].audioUrl!], addNote() {} }, {
    ...definition, pitch: [{ downstep: 2, audioUrl: null }],
  });
  assert.equal(checks(section, "Pitch accent").length, 1, "missing clips never offer an empty media insertion");
});

test("choosing no meanings keeps an empty selection and disables copying the definition", async () => {
  const proposals: AuthoringSelection[] = [];
  const section = render({ addNote: (selection) => { proposals.push(selection); } });
  for (const pick of checks(section, "Meanings")) pick.click();
  assert.equal(button(section, "Copy selected definition").disabled, true);
  button(section, "Add Anki note").click();
  await settle();
  assert.deepEqual(proposals[0].senseRefs, []);
  assert.equal(proposals[0].definition, "");
  assert.deepEqual(proposals[0].examples, []);
});

test("all meanings remain selectable beyond the popup's collapsed list", async () => {
  const proposals: AuthoringSelection[] = [];
  const senses = Array.from({ length: 11 }, (_, position) => ({ ...definition.senses[0], position }));
  const section = render({ addNote: (selection) => { proposals.push(selection); } }, { ...definition, senses });
  const picks = checks(section, "Meanings");
  assert.equal(picks.length, 11);
  for (const pick of picks.slice(0, 10)) pick.click();
  button(section, "Add Anki note").click();
  await settle();
  assert.deepEqual(proposals[0].senseRefs, ["jmdict#10"]);
});

test("a pending proposal prevents double submission, and a refusal can be retried", async () => {
  let reject!: (error: Error) => void;
  let calls = 0;
  const section = render({ addNote: async () => {
    calls += 1;
    if (calls === 1) await new Promise<void>((_resolve, reject_) => { reject = reject_; });
  }, updateNote() {} });
  const add = button(section, "Add Anki note");
  add.click();
  add.click();
  assert.equal(calls, 1);
  assert.equal(add.disabled, true);
  assert.equal(button(section, "Update this note").disabled, true);
  assert.equal(add.parentElement?.getAttribute("aria-busy"), "true");
  reject(new Error("The Anki editor is still loading. Close and reopen it, then try again."));
  await settle();
  assert.equal(section.querySelector('[aria-label="Copy and note status"]')?.textContent, "The Anki editor is still loading. Close and reopen it, then try again.");
  assert.equal(add.disabled, false);
  assert.equal(add.parentElement?.hasAttribute("aria-busy"), false);
  add.click();
  await settle();
  assert.equal(calls, 2);
});

test("every native action displays recovery details as text and unknown failures retain a useful fallback", async () => {
  const message = 'Choose a note type in Shirabe settings. <img src=x onerror="alert(1)">';
  for (const [capability, label] of [["addNote", "Add Anki note"], ["updateNote", "Update this note"], ["findNotes", "Find in Anki"]] as const) {
    for (const error of [new Error(message), new Error("   "), { message: "not a native Error" }]) {
      const section = render({ [capability]: () => { throw error; } });
      button(section, label).click();
      await settle();
      assert.equal(section.querySelector('[aria-label="Copy and note status"]')?.textContent,
        error instanceof Error && error.message.trim() ? message : "Couldn't open Anki. Try again.");
      assert.equal(section.querySelector("img"), null);
      assert.equal(button(section, label).disabled, false);
    }
  }
});

test("clipboard refusal exposes focused selectable text instead of claiming a copy succeeded", async () => {
  window.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
  const section = render();
  button(section, "Copy expression").click();
  await settle();
  const text = section.querySelector("textarea")!;
  assert.equal(text.value, "食べる");
  assert.equal(text.readOnly, true);
  assert.equal(text.closest("label")?.hidden, false);
  assert.equal(text.closest("label")?.firstChild?.textContent, "Select and copy");
  assert.equal(document.activeElement, text);
  assert.equal(text.selectionStart, 0);
  assert.equal(text.selectionEnd, text.value.length);
  assert.equal(section.querySelector('[aria-label="Copy and note status"]')?.textContent, "Select the text and copy it.");
});

test("authoring controls contain review gestures but preserve native keys and Escape dismissal", () => {
  const section = render();
  let bubbled = 0;
  const listen = () => { bubbled += 1; };
  document.body.addEventListener("keydown", listen);
  document.body.addEventListener("pointerup", listen);
  document.body.addEventListener("click", listen);
  try {
    const expression = section.querySelector("select")!;
    for (const key of ["ArrowDown", "ArrowUp", "Enter", " ", "Tab"]) {
      const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      expression.dispatchEvent(event as unknown as Event);
      assert.equal(event.defaultPrevented, false, `${key} keeps its native behavior`);
    }
    checks(section, "Meanings")[0].dispatchEvent(new window.PointerEvent("pointerup", { pointerType: "touch", bubbles: true }) as unknown as Event);
    checks(section, "Meanings")[0].closest("label")!.click();
    assert.equal(bubbled, 0);
    expression.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
    assert.equal(bubbled, 1);
  } finally {
    document.body.removeEventListener("keydown", listen);
    document.body.removeEventListener("pointerup", listen);
    document.body.removeEventListener("click", listen);
  }
});

test("missing reading and examples do not offer empty copy actions", () => {
  const section = render(undefined, { ...definition, reading: null, examples: [] });
  assert.equal(button(section, "Copy reading").disabled, true);
  assert.equal(button(section, "Copy selected examples").disabled, true);
});

test("a detached scan retains its supplied sentence and a wrapped word can ask its host", async () => {
  const proposals: AuthoringSelection[] = [];
  let contextCalls = 0;
  const port: AuthoringPort = {
    addNote: (selection) => { proposals.push(selection); },
    contextSentence: () => { contextCalls += 1; return "朝ご飯を食べた。"; },
  };
  const word = document.createElement("span");
  word.dataset.sentence = "昨日、ご飯を食べた。";
  for (const supplied of [true, false]) {
    if (!supplied) delete word.dataset.sentence;
    const section = authoringActions(definition, word, port);
    button(section, "Add Anki note").click();
    await settle();
  }
  assert.equal(proposals[0].contextSentence, "昨日、ご飯を食べた。");
  assert.equal(proposals[1].contextSentence, "朝ご飯を食べた。");
  assert.equal(contextCalls, 1);
});

test("wrapped context quotes the visible sentence across markup and excludes hidden answers and controls", async () => {
  const proposals: AuthoringSelection[] = [];
  const paragraph = document.createElement("p");
  paragraph.innerHTML = '前の文。昨日、<ruby>ご飯<rt>ごはん</rt></ruby>を<em><span>食べた</span></em>。次の文。<span hidden>秘密の答え</span><span style="display:none">別の答え</span><input value="password"><button>答えを見る</button>';
  document.body.replaceChildren(paragraph);
  const word = paragraph.querySelector("em span") as HTMLElement;
  const section = authoringActions(definition, word, { addNote: (selection) => { proposals.push(selection); } });
  button(section, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].contextSentence, "昨日、ご飯を食べた。");
});

test("wrapped context without punctuation cannot include adjacent hidden answers or a different paragraph", async () => {
  const proposals: AuthoringSelection[] = [];
  const block = document.createElement("div");
  block.innerHTML = '<p>前の文</p>ご飯を<span class="target">食べた</span><span hidden>秘密</span><span style="visibility:hidden">答え</span><span aria-hidden="true">内緒</span><span data-sb-skip>除外</span><p>次の文</p>';
  document.body.replaceChildren(block);
  const word = block.querySelector(".target") as HTMLElement;
  const section = authoringActions(definition, word, { addNote: (selection) => { proposals.push(selection); } });
  button(section, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].contextSentence, "ご飯を食べた");
});

test("the actual read-only popup offers authoring independently of StudyPort and resets picks on candidate change", async () => {
  const card = await import("../src/word-card/card.js");
  const proposals: AuthoringSelection[] = [];
  const host = fakeHost({ study: false, definitions: { "食べる": definition, "君": kimi } });
  host.authoring = { addNote: (selection) => { proposals.push(selection); } };
  host.candidatesFor = () => [
    { entry: definition.entry!, headword: definition.headword, reading: definition.reading, common: true },
    { entry: kimi.entry!, headword: kimi.headword, reading: kimi.reading, common: true },
  ];
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: false, readOnly: true });
  const word = document.createElement("span");
  word.dataset.lemma = "食べる";
  word.dataset.surface = "食べた";
  document.body.append(word);
  card.showNow(word);
  await settle();
  const shadow = document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(shadow.querySelector(".sb-btn-save"), null);
  checks(shadow, "Meanings")[0].click();
  checks(shadow, "Examples")[0].click();
  button(shadow, "Add Anki note").click();
  await settle();
  assert.deepEqual(proposals[0].senseRefs, ["daijirin#7"]);
  (shadow.querySelectorAll<HTMLButtonElement>(".sb-candidate")[1]).click();
  await settle();
  button(shadow, "Add Anki note").click();
  await settle();
  assert.equal(proposals[1].entry, kimi.entry);
  assert.equal(proposals[1].lemma, "君");
  assert.deepEqual(proposals[1].senseRefs, ["jmdict#0"]);
  assert.deepEqual(proposals[1].examples, []);
  card.dismissPopup();
});

test("authoring preserves the original surface when a parsed lookup only returns the dictionary form", async () => {
  const card = await import("../src/word-card/card.js");
  const proposals: AuthoringSelection[] = [];
  const host = fakeHost({ study: false, definitions: { "食べる": { ...definition, sourceForm: undefined } } });
  host.authoring = { addNote: (selection) => { proposals.push(selection); } };
  card.setCardHost(host);
  const word = document.createElement("span");
  word.dataset.lemma = "食べる";
  word.dataset.surface = "食べました";
  document.body.append(word);
  card.showNow(word);
  await settle();
  button(document.querySelector(".sb-host")!.shadowRoot!, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].surface, "食べました");
  assert.equal(proposals[0].lemma, "食べる");
  card.dismissPopup();
});

test("finding examples loads on demand without resetting expression, meaning or existing example selections", async () => {
  const proposals: AuthoringSelection[] = [];
  let calls = 0;
  let resolve!: (examples: Example[]) => void;
  const section = render({ addNote: (selection) => { proposals.push(selection); } }, definition, async () => {
    calls += 1;
    return new Promise<Example[]>((resolve_) => { resolve = resolve_; });
  });
  assert.equal(calls, 0);
  section.querySelector("select")!.value = "食べた";
  checks(section, "Meanings")[0].click();
  checks(section, "Examples")[0].click();
  button(section, "Find examples").click();
  assert.equal(calls, 1);
  assert.equal(button(section, "Find examples").disabled, true);
  assert.equal(section.querySelector('[aria-label="Example search status"]')?.textContent, "Loading examples…");
  resolve([...definition.examples, { japanese: "ケーキを食べた。", translation: "I ate cake." }]);
  await settle();
  assert.equal(checks(section, "Examples").length, 3);
  assert.equal(checks(section, "Examples")[0].checked, true);
  checks(section, "Examples")[2].click();
  button(section, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].expression, "食べた");
  assert.deepEqual(proposals[0].senseRefs, ["daijirin#7"]);
  assert.deepEqual(proposals[0].examples, [
    { japanese: "ご飯を食べた。", translation: "I ate rice." },
    { japanese: "ケーキを食べた。", translation: "I ate cake." },
  ]);
});

test("example loading can fail, retry, cancel, and ignore the cancelled response", async () => {
  let calls = 0;
  let signal!: AbortSignal;
  let stale!: (examples: Example[]) => void;
  const section = render(undefined, { ...definition, examples: [] }, async (signal_) => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
    if (calls === 2) {
      signal = signal_;
      return new Promise<Example[]>((resolve) => { stale = resolve; });
    }
    return [definition.examples[1]];
  });
  button(section, "Find examples").click();
  await settle();
  assert.equal(section.querySelector('[aria-label="Example search status"]')?.textContent, "Couldn't load examples. Try again.");
  button(section, "Find examples").click();
  button(section, "Cancel loading examples").click();
  assert.equal(signal.aborted, true);
  assert.equal(document.activeElement, button(section, "Find examples"));
  assert.equal(section.querySelector('[aria-label="Example search status"]')?.textContent, "Example search cancelled.");
  button(section, "Find examples").click();
  await settle();
  stale([definition.examples[0]]);
  await settle();
  const picks = checks(section, "Examples");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].closest("label")?.textContent, definition.examples[1].japanese);
});

test("example filters narrow keyword, Unicode length and translation availability without losing selected examples", async () => {
  const proposals: AuthoringSelection[] = [];
  const section = render({ addNote: (selection) => { proposals.push(selection); } }, {
    ...definition, examples: [definition.examples[0], { japanese: "𠮟る。", translation: null }],
  });
  const picks = checks(section, "Examples");
  picks[0].click();
  const keyword = section.querySelector<HTMLInputElement>('input[type="search"]')!;
  const length = section.querySelector<HTMLInputElement>('input[type="number"]')!;
  const translation = section.querySelector<HTMLSelectElement>(".sb-authoring-filters select")!;
  const change = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
  };
  change(keyword, "RICE");
  assert.equal(picks[0].closest("label")!.hidden, false);
  assert.equal(picks[1].closest("label")!.hidden, true);
  change(keyword, "");
  change(length, "3");
  assert.equal(picks[0].closest("label")!.hidden, true);
  assert.equal(picks[1].closest("label")!.hidden, false);
  change(length, "");
  change(translation, "without");
  assert.equal(picks[0].closest("label")!.hidden, true);
  assert.equal(picks[1].closest("label")!.hidden, false);
  assert.match(section.querySelector('[aria-label="Example search status"]')!.textContent!, /1 selected \(1 hidden by filters\)/);
  button(section, "Add Anki note").click();
  await settle();
  assert.deepEqual(proposals[0].examples, [{ japanese: "ご飯を食べた。", translation: "I ate rice." }]);
  change(translation, "with");
  assert.equal(picks[0].closest("label")!.hidden, false);
  assert.equal(picks[0].checked, true);
});

test("a cursor result fetches pinned entry examples only after Find examples is pressed", async () => {
  const card = await import("../src/word-card/card.js");
  const calls: string[][] = [];
  const host = fakeHost({ study: false, definitions: { "食べる": { ...definition, examples: [] } } });
  host.lookupEntry = async (entry, surface) => {
    calls.push([entry, surface]);
    return { status: "found", definition };
  };
  card.setCardHost(host);
  const word = document.createElement("span");
  word.dataset.lemma = "食べる";
  document.body.append(word);
  card.showNow(word);
  await settle();
  const shadow = document.querySelector(".sb-host")!.shadowRoot!;
  assert.deepEqual(calls, []);
  button(shadow, "Find examples").click();
  await settle();
  assert.deepEqual(calls, [[definition.entry, definition.headword]]);
  assert.equal(checks(shadow, "Examples").length, 2);
  checks(shadow, "Examples")[0].click();
  assert.equal(button(shadow, "Copy selected examples").disabled, false);
  card.dismissPopup();
});

function field(section: ParentNode, name: string): HTMLInputElement | HTMLSelectElement {
  const label = [...section.querySelectorAll("label")].find((label) => label.firstChild?.textContent === name);
  assert.ok(label, `${name} is labelled`);
  return label.querySelector("input,select")!;
}

function change(section: ParentNode, name: string, value: string): void {
  const input = field(section, name);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
}

test("corpus API to popup to native proposal retains the selected language and displayed source", async () => {
  const card = await import("../src/word-card/card.js");
  const proposals: AuthoringSelection[] = [];
  const calls: URL[] = [];
  const corpus = apiHost({ apiBase: "https://dictionary.test", fetch: async (url) => {
    calls.push(new URL(String(url)));
    const next = calls[calls.length - 1].searchParams.has("cursor");
    return Response.json({
      sentences: [{ id: next ? "uploaded:8" : "tatoeba:7", ...(next ? { source: "<b>My dictionary</b>" } : {}),
        japanese: next ? "パンを食べる。" : "ご飯を食べた。",
        translations: [{ lang: "en", text: "I ate rice." }, { lang: "es", text: "Comí arroz." }] }],
      pagination: { hasMore: !next, cursor: next ? null : "next/+==" },
    });
  } });
  const host = fakeHost({ study: false, definitions: { "食べる": { ...definition, examples: [] } } });
  host.exampleSearch = corpus.exampleSearch;
  host.authoring = { addNote: (selection) => { proposals.push(selection); } };
  card.setCardHost(host);
  card.setWriteState({ canWrite: false, connected: false, readOnly: true });
  const word = document.createElement("span");
  word.dataset.lemma = "食べる";
  word.dataset.surface = "食べた";
  document.body.append(word);
  card.showNow(word);
  await settle();
  const shadow = document.querySelector(".sb-host")!.shadowRoot!;
  assert.equal(calls.length, 0);
  assert.equal(field(shadow, "Word or surface").value, "食べる");
  checks(shadow, "Meanings")[0].click();
  change(shadow, "Expression", "食べた");
  button(shadow, "Find examples").click();
  await settle();
  const english = checks(shadow, "Examples")[0];
  assert.match(english.closest("label")!.textContent!, /Tatoeba · tatoeba:7 · English/);
  english.click();
  change(shadow, "Translation language", "es");
  assert.equal(english.closest("label")!.hidden, true);
  assert.match(shadow.querySelector('[aria-label="Example search status"]')!.textContent!, /1 hidden by filters/);
  assert.equal(calls.length, 1, "changing language never starts a background request");
  button(shadow, "Find examples").click();
  await settle();
  const spanish = checks(shadow, "Examples")[1];
  assert.equal(spanish.closest("label")!.querySelector('[lang="es"]')!.textContent, "Comí arroz.");
  spanish.click();
  button(shadow, "More examples").click();
  await settle();
  const uploaded = checks(shadow, "Examples")[2];
  assert.match(uploaded.closest("label")!.textContent!, /<b>My dictionary<\/b> · uploaded:8/);
  assert.equal(uploaded.closest("label")!.querySelector("b"), null);
  assert.equal(calls[2].searchParams.get("cursor"), "next/+==");
  assert.equal(button(shadow, "More examples").hidden, true);
  uploaded.click();
  change(shadow, "Word or surface", "食べた");
  button(shadow, "Add Anki note").click();
  await settle();
  assert.equal(proposals[0].expression, "食べた");
  assert.deepEqual(proposals[0].senseRefs, ["daijirin#7"]);
  assert.deepEqual(proposals[0].examples, [
    { japanese: "ご飯を食べた。", translation: "I ate rice.", source: "Tatoeba", reference: "tatoeba:7", translationLanguage: "en" },
    { japanese: "ご飯を食べた。", translation: "Comí arroz.", source: "Tatoeba", reference: "tatoeba:7", translationLanguage: "es" },
    { japanese: "パンを食べる。", translation: "Comí arroz.", source: "<b>My dictionary</b>", reference: "uploaded:8", translationLanguage: "es" },
  ]);
  button(shadow, "Find examples").click();
  await settle();
  assert.equal(calls[3].searchParams.get("query"), "食べた");
  card.dismissPopup();
});

test("corpus filters cancel pending pages, ignore stale results, and preserve meaning choices after retry", async () => {
  let signal!: AbortSignal;
  let resolve!: (result: ExampleSearchResult) => void;
  let calls = 0;
  const proposals: AuthoringSelection[] = [];
  const section = render({ addNote: (selection) => { proposals.push(selection); } }, definition, undefined, async (query, signal_) => {
    calls += 1;
    if (calls === 1) {
      signal = signal_!;
      return new Promise((resolve_) => { resolve = resolve_; });
    }
    if (calls === 2) throw new Error("Example service unavailable. Try again.");
    assert.equal(query.maxLength, 7);
    assert.equal(query.keyword, "rice");
    assert.equal(query.translationLanguage, "es");
    assert.equal(query.translation, "with");
    return { examples: [], hasMore: false, cursor: null };
  });
  assert.equal(checks(section, "Examples").length, 0, "flattened previews are not assigned invented provenance or language");
  checks(section, "Meanings")[0].click();
  button(section, "Find examples").click();
  change(section, "Translation language", "es");
  assert.equal(signal.aborted, true);
  resolve({ examples: [{ japanese: "stale", translation: null }], hasMore: false, cursor: null });
  await settle();
  assert.equal(checks(section, "Examples").length, 0);
  button(section, "Find examples").click();
  await settle();
  assert.equal(section.querySelector('[aria-label="Example search status"]')!.textContent, "Example service unavailable. Try again.");
  change(section, "Keyword", "rice");
  change(section, "Maximum characters", "7");
  change(section, "Translation", "with");
  field(section, "Keyword").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }) as unknown as Event);
  await settle();
  assert.equal(section.querySelector('[aria-label="Example search status"]')!.textContent, "No examples found.");
  button(section, "Add Anki note").click();
  await settle();
  assert.deepEqual(proposals[0].senseRefs, ["daijirin#7"]);
  assert.deepEqual(proposals[0].examples, []);
});

test("covered meanings are excluded from default proposals and copy until explicitly selected", async () => {
  const proposals: AuthoringSelection[] = [];
  const copied: string[] = [];
  window.navigator.clipboard.writeText = async (value) => { copied.push(value); };
  const section = render({ addNote: (selection) => { proposals.push(selection); } }, {
    ...definition, senses: [definition.senses[0], { ...definition.senses[1], covered: true }],
  });
  assert.equal(checks(section, "Meanings")[1].checked, false);
  button(section, "Copy selected definition").click();
  button(section, "Add Anki note").click();
  await settle();
  assert.deepEqual(copied, ["to eat"]);
  assert.deepEqual(proposals[0].senseRefs, ["jmdict#0"]);
  checks(section, "Meanings")[1].click();
  button(section, "Add Anki note").click();
  await settle();
  assert.deepEqual(proposals[1].senseRefs, ["jmdict#0", "daijirin#7"]);
});

test("prepared lookup badge shows its saved date online or offline without inventing freshness or an upsell", async () => {
  const card = await import("../src/word-card/card.js");
  const preparedAt = Date.UTC(2026, 8, 12, 12);
  for (const [offline, timestamp] of [[true, preparedAt], [false, preparedAt], [true, undefined], [true, NaN]] as const) {
    const def = { ...definition, offline, preparedAt: timestamp };
    const host = fakeHost({ study: false, definitions: { "食べる": def } });
    card.setCardHost(host);
    card.setWriteState({ canWrite: false, connected: false, readOnly: true });
    const word = document.createElement("span");
    word.dataset.lemma = "食べる";
    document.body.append(word);
    card.showNow(word);
    await settle();
    const shadow = document.querySelector(".sb-host")!.shadowRoot!;
    const badge = shadow.querySelector<HTMLElement>(".sb-badge-prepared");
    if (Number.isFinite(timestamp)) {
      assert.equal(badge?.textContent, `Saved for offline use · ${new Date(preparedAt).toLocaleDateString()}`);
      assert.match(badge!.title, /while online/);
      assert.match(badge!.getAttribute("aria-label")!, /Desktop preparation/);
    } else assert.equal(badge, null);
    assert.doesNotMatch(shadow.textContent!, /Get Shirabe Pro|Connect to save/);
    assert.equal(def.preparedAt, timestamp);
    assert.equal(def.offline, offline);
    card.dismissPopup();
  }
});

test("read-only study status names its actual source and never infers fresh state from old word attributes", async () => {
  const card = await import("../src/word-card/card.js");
  for (const source of ["Anki collection", undefined]) {
    for (const available of [true, false]) {
      const host = fakeHost({ definitions: { "食べる": definition }, details: { "食べる": { state: "due", decks: [] } } });
      host.study!.source = source;
      if (!available) host.study!.states = async () => null;
      card.setCardHost(host);
      card.setWriteState({ canWrite: false, connected: false, readOnly: true });
      const word = document.createElement("span");
      word.dataset.lemma = "食べる";
      word.dataset.state = "retired";
      document.body.append(word);
      card.showNow(word);
      await settle();
      const shadow = document.querySelector(".sb-host")!.shadowRoot!;
      const caption = shadow.querySelector('[aria-label="Study status"]');
      assert.equal(caption?.textContent ?? null, available ? `${source ?? "Shirabe"} · Due` : null);
      assert.equal(shadow.querySelector(".sb-btn-save"), null);
      assert.equal(shadow.querySelector(".sb-btn-known"), null);
      assert.equal(shadow.querySelector(".sb-btn-open"), null);
      card.dismissPopup();
    }
  }
});

test("late read-only study status preserves chosen fields and ignores a dismissed popup", async () => {
  const card = await import("../src/word-card/card.js");
  for (const dismiss of [false, true]) {
    let release!: (details: Record<string, StudyDetails>) => void;
    const pending = new Promise<Record<string, StudyDetails>>(resolve => { release = resolve; });
    const host = fakeHost({ definitions: { "食べる": definition } });
    host.study!.source = "Anki collection";
    host.study!.states = () => pending;
    card.setCardHost(host);
    card.setWriteState({ canWrite: false, connected: true, readOnly: true });
    const word = document.createElement("span");
    word.dataset.lemma = "食べる";
    document.body.append(word);
    card.showNow(word);
    await settle();
    const shadow = document.querySelector(".sb-host")!.shadowRoot!;
    try {
      assert.ok(shadow.querySelector(".sb-body"), "Definition controls must exist before study metadata arrives");
      const meaning = checks(shadow, "Meanings")[0];
      meaning.click();
      meaning.focus();
      const checked = meaning.checked;
      if (dismiss) card.dismissPopup();
      release({ "食べる": { state: "due", decks: [] } });
      await settle();
      assert.equal(checks(shadow, "Meanings")[0], meaning);
      assert.equal(meaning.checked, checked);
      assert.equal(shadow.querySelector('[aria-label="Study status"]')?.textContent ?? null,
        dismiss ? null : "Anki collection · Due");
      assert.equal(word.dataset.state, dismiss ? undefined : "due");
      if (!dismiss) assert.equal(shadow.activeElement, meaning);
    } finally {
      release({});
      card.dismissPopup();
    }
  }
});

test("Manage is absent without an actual host destination, even if the word retains an API card URL", async () => {
  const card = await import("../src/word-card/card.js");
  for (const url of [undefined, "https://dictionary.test/study/cards?card_id=7"]) {
    const host = fakeHost({ definitions: { "食べる": definition }, details: { "食べる": { state: "due", decks: [] } } });
    host.study!.source = "Anki collection";
    host.study!.urlForWord = async () => url;
    card.setCardHost(host);
    card.setWriteState({ canWrite: true, connected: true, readOnly: false });
    const word = document.createElement("span");
    word.dataset.lemma = "食べる";
    word.dataset.cardUrl = "https://old.test/study/cards";
    document.body.append(word);
    card.showNow(word);
    await settle();
    const shadow = document.querySelector(".sb-host")!.shadowRoot!;
    const manage = shadow.querySelector<HTMLAnchorElement>(".sb-btn-open");
    if (url) assert.equal(manage?.href, url);
    else assert.equal(manage?.getAttribute("href") ?? null, null);
    card.dismissPopup();
  }
});

test("an empty filtered batch explains More examples and keeps its cursor for the next explicit action", async () => {
  const cursors: (string | undefined)[] = [];
  const section = render(undefined, { ...definition, examples: [] }, undefined, async (query) => {
    cursors.push(query.cursor);
    return { examples: [], cursor: query.cursor ? null : "batch:3", hasMore: !query.cursor };
  });
  button(section, "Find examples").click();
  await settle();
  assert.match(section.querySelector('[aria-label="Example search status"]')!.textContent!, /Use More examples to keep searching/);
  assert.equal(button(section, "More examples").hidden, false);
  assert.deepEqual(cursors, [undefined]);
  button(section, "More examples").click();
  await settle();
  assert.deepEqual(cursors, [undefined, "batch:3"]);
  assert.equal(button(section, "More examples").hidden, true);
  assert.equal(section.querySelector('[aria-label="Example search status"]')!.textContent, "No examples found.");
});
