import type { AuthoringPort, AuthoringSelection, ExampleSearch } from "./host.js";
import type { Definition, Example } from "./types.js";
import { senseText } from "./senses.js";
import { isR2AudioUrl } from "./audio.js";
import { isReadable } from "./wrap.js";
import { exampleChoices } from "./authoring-examples.js";
import { uiLanguagesFrom } from "./languages.js";

export function authoringActions(
  definition: Definition,
  word: HTMLElement,
  port?: AuthoringPort,
  loadExamples?: (signal: AbortSignal) => Promise<Example[]>,
  exampleSearch?: ExampleSearch,
): HTMLElement {
  const surface = word.dataset.surface ?? definition.sourceForm ?? definition.headword;
  const lemma = definition.baseForm ?? definition.inflectionBase ?? definition.headword;
  const contextSentence = word.dataset.sentence ?? port?.contextSentence?.(word) ?? visibleSentence(word);
  const section = document.createElement("section");
  section.className = "sb-authoring";
  section.setAttribute("aria-label", "Copy and note actions");

  const status = document.createElement("p");
  status.className = "sb-authoring-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Copy and note status");
  status.setAttribute("aria-live", "polite");
  status.tabIndex = -1;

  const choices = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Copy and choose fields";
  choices.append(summary);

  const expression = document.createElement("select");
  expression.lang = "ja";
  for (const text of new Set([lemma, surface])) {
    const option = document.createElement("option");
    option.value = text;
    option.textContent = text;
    expression.append(option);
  }
  expression.value = lemma;
  const expressionLabel = document.createElement("label");
  expressionLabel.className = "sb-authoring-expression";
  expressionLabel.append("Expression", expression);
  choices.append(expressionLabel);

  const meanings = fieldset("Meanings");
  const sensePicks = definition.senses.map((sense) => {
    const pick = checkbox(senseText(sense), !sense.covered);
    meanings.append(pick.label);
    return pick.input;
  });
  if (sensePicks.length) choices.append(meanings);

  const current = fieldset("Current sentence");
  const currentPick = checkbox(contextSentence ?? "", false);
  currentPick.text.lang = "ja";
  if (contextSentence) {
    current.append(currentPick.label);
    choices.append(current);
  }

  const examples = exampleChoices({
    initial: definition.examples,
    query: lemma,
    entry: definition.entry,
    language: uiLanguagesFrom(definition.senses.flatMap((sense) => sense.glosses.map((gloss) => gloss.lang)))
      .find((language) => language !== "ja") ?? "en",
    search: exampleSearch,
    load: loadExamples,
    onChange: () => refreshCopies(),
  });
  if (definition.examples.length || loadExamples || exampleSearch) choices.append(examples.element);

  const media = fieldset("Pitch accent");
  const pitchPicks: { input: HTMLInputElement; downstep: number }[] = [];
  const audioPicks: { input: HTMLInputElement; url: string }[] = [];
  if (port?.addNote || port?.updateNote) {
    for (const downstep of new Set(definition.pitch.map((pattern) => pattern.downstep))) {
      const pick = checkbox(`Pitch accent: ${downstep}`, false);
      pitchPicks.push({ input: pick.input, downstep });
      media.append(pick.label);
    }
    for (const url of new Set(definition.pitch.map((pattern) => pattern.audioUrl).filter(isR2AudioUrl))) {
      if (!port.insertableAudioUrls?.includes(url)) continue;
      const pick = checkbox(`Pronunciation audio ${audioPicks.length + 1}`, false);
      audioPicks.push({ input: pick.input, url });
      media.append(pick.label);
    }
    if (audioPicks.length) media.querySelector("legend")!.textContent = "Pitch and audio";
    if (pitchPicks.length || audioPicks.length) choices.append(media);
  }

  const selection = (): AuthoringSelection => {
    const senses = definition.senses.filter((_, index) => sensePicks[index].checked);
    const pitch = pitchPicks.filter((pick) => pick.input.checked).map((pick) => pick.downstep);
    const audioUrls = audioPicks.filter((pick) => pick.input.checked).map((pick) => pick.url);
    return {
      surface,
      lemma,
      entry: definition.entry ?? null,
      expression: expression.value,
      reading: definition.baseReading ?? definition.reading,
      contextSentence,
      senseRefs: senses.map((sense) => sense.ref ?? `jmdict#${sense.position}`),
      definition: senses.map(senseText).join("\n"),
      examples: [
        ...(contextSentence && currentPick.input.checked ? [{ japanese: contextSentence, translation: null, source: "Current card" }] : []),
        ...examples.selected(),
      ],
      ...(/^https?:\/\//.test(definition.url) ? { sourceUrl: definition.url } : {}),
      ...(pitch.length ? { pitch } : {}),
      ...(audioUrls.length ? { audioUrls } : {}),
    };
  };

  const native = document.createElement("div");
  native.className = "sb-authoring-buttons";
  const nativeButtons: HTMLButtonElement[] = [];
  let pending = false;
  for (const [label, action] of [
    ["Add Anki note", port?.addNote],
    ["Update this note", port?.updateNote],
    ["Find in Anki", port?.findNotes],
  ] as const) {
    if (!action) continue;
    const button = actionButton(label, async () => {
      if (pending) return;
      const proposal = selection();
      const focused = button.matches(":focus");
      pending = true;
      native.setAttribute("aria-busy", "true");
      nativeButtons.forEach((button) => { button.disabled = true; });
      status.textContent = "Opening Anki…";
      if (focused) status.focus({ preventScroll: true });
      try {
        await action.call(port, proposal);
        status.textContent = "Request sent to Anki.";
      } catch (error) {
        status.textContent = error instanceof Error && error.message.trim() ? error.message : "Couldn't open Anki. Try again.";
        status.scrollIntoView({ block: "nearest" });
      } finally {
        pending = false;
        native.removeAttribute("aria-busy");
        nativeButtons.forEach((button) => { button.disabled = false; });
        if (status.matches(":focus")) button.focus({ preventScroll: true });
      }
    });
    nativeButtons.push(button);
    native.append(button);
  }
  if (nativeButtons.length) section.append(native, status);

  const copies = document.createElement("div");
  copies.className = "sb-authoring-buttons";
  const copyButtons: { button: HTMLButtonElement; value: () => string }[] = [];
  const manual = document.createElement("label");
  manual.className = "sb-authoring-manual";
  manual.hidden = true;
  manual.append("Select and copy");
  const copyText = document.createElement("textarea");
  copyText.readOnly = true;
  copyText.rows = 3;
  manual.append(copyText);
  for (const [label, value] of [
    ["Copy expression", () => selection().expression],
    ["Copy reading", () => selection().reading ?? ""],
    ["Copy selected definition", () => selection().definition],
    ["Copy current sentence", () => contextSentence ?? ""],
    ["Copy selected sentences", () => selection().examples.map((example) => example.japanese).join("\n\n")],
    ["Copy selected translations", () => selection().examples.map((example) => example.translation).filter(Boolean).join("\n\n")],
    ["Copy selected examples", () => {
      const examples = selection().examples;
      const notices = new Set(examples.map((example) => [example.source, example.reference].filter(Boolean).join("\n")).filter(Boolean));
      return [examples.map((example) => [example.japanese, example.translation].filter(Boolean).join("\n")).join("\n\n"),
        ...notices].filter(Boolean).join("\n\n");
    }],
  ] as const) {
    if (label === "Copy current sentence" && !contextSentence) continue;
    const button = actionButton(label, async () => {
      const text = value();
      if (!text) return;
      const focused = button.matches(":focus");
      button.disabled = true;
      status.textContent = "Copying…";
      if (focused) status.focus({ preventScroll: true });
      try {
        const clipboard = section.ownerDocument.defaultView?.navigator.clipboard;
        if (!clipboard) throw new Error("Clipboard unavailable");
        await clipboard.writeText(text);
        manual.hidden = true;
        status.textContent = "Copied.";
      } catch {
        manual.hidden = false;
        copyText.value = text;
        copyText.focus();
        copyText.select();
        status.textContent = "Select the text and copy it.";
      } finally {
        refreshCopies();
        if (!button.disabled && status.matches(":focus")) button.focus({ preventScroll: true });
      }
    });
    copyButtons.push({ button, value });
    if (label === "Copy current sentence") current.append(button);
    else copies.append(button);
  }
  function refreshCopies(): void {
    for (const { button, value } of copyButtons) button.disabled = !value();
  }
  choices.addEventListener("change", () => {
    refreshCopies();
    manual.hidden = true;
    status.textContent = "";
  });
  refreshCopies();
  choices.append(copies, manual);
  section.append(choices);
  if (!nativeButtons.length) section.append(status);
  for (const event of ["click", "dblclick", "pointerdown", "pointerup", "keyup"]) {
    section.addEventListener(event, (event) => event.stopPropagation());
  }
  section.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" && !(event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key))) event.stopPropagation();
  });
  return section;
}

function visibleSentence(word: HTMLElement): string | null {
  if (!isReadable(word)) return null;
  const blocks = "p,li,td,th,dd,dt,h1,h2,h3,h4,h5,h6,blockquote,figcaption,article,section,main,div";
  const block = word.closest(blocks) ?? word.parentElement;
  if (!block) return null;
  const { NodeFilter } = word.ownerDocument.defaultView!;
  const walker = word.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => isReadable(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  let text = "";
  let offset = -1;
  let previousBlock: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parentBlock = node.parentElement?.closest(blocks) ?? block;
    if (previousBlock && parentBlock !== previousBlock) text += "\n";
    if (offset < 0 && word.contains(node)) offset = text.length;
    text += node.textContent;
    previousBlock = parentBlock;
  }
  if (offset < 0) return null;
  const preceding = text.slice(0, offset).split(/[。！？!?\n]/);
  const before = preceding[preceding.length - 1] ?? "";
  const after = text.slice(offset).match(/^[^。！？!?\n]*[。！？!?]?/)?.[0] ?? "";
  return (before + after).trim() || null;
}

function fieldset(title: string): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = title;
  fieldset.append(legend);
  return fieldset;
}

function checkbox(text: string, checked: boolean) {
  const label = document.createElement("label");
  label.className = "sb-authoring-choice";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const caption = document.createElement("span");
  caption.textContent = text;
  label.append(input, caption);
  return { label, input, text: caption };
}

function actionButton(text: string, action: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", () => { void action(); });
  return button;
}

export const AUTHORING_CSS = `
.sb-authoring { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--sb-divider); }
.sb-authoring-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.sb-authoring button, .sb-authoring select, .sb-authoring textarea, .sb-authoring input:not([type="checkbox"]) {
  box-sizing: border-box; min-height: 44px; max-width: 100%; padding: 8px;
  font: inherit; color: var(--sb-ink); background: var(--sb-surface-muted);
  border: 1px solid var(--sb-outline-strong); border-radius: 8px;
}
.sb-authoring button, .sb-authoring select, .sb-authoring summary, .sb-authoring-choice, .sb-authoring input[type="checkbox"] { cursor: pointer; }
.sb-authoring button:hover:not(:disabled), .sb-authoring select:hover, .sb-authoring summary:hover, .sb-authoring-choice:hover { background: var(--sb-accent-tint); }
.sb-authoring :is(button, select, summary, input, textarea):focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
.sb-authoring button:disabled { opacity: .4; cursor: default; }
.sb-authoring summary { box-sizing: border-box; min-height: 44px; padding: 10px 4px; color: var(--sb-accent); }
.sb-authoring fieldset { min-width: 0; margin: 0; padding: 0 0 8px; border: 0; }
.sb-authoring legend { font-weight: 600; }
.sb-authoring-choice { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; column-gap: 6px; min-height: 44px; padding: 2px 4px; border-radius: 6px; }
.sb-authoring-choice input { width: 20px; height: 20px; margin: 0; accent-color: var(--sb-accent); }
.sb-authoring-translation { grid-column: 2; color: var(--sb-ink-subtle); }
.sb-authoring-source { grid-column: 2; color: var(--sb-ink-subtle); font-size: 12px; overflow-wrap: anywhere; }
.sb-authoring-expression, .sb-authoring-manual:not([hidden]) { display: grid; gap: 4px; margin-bottom: 8px; }
.sb-authoring-choice, .sb-authoring-status { overflow-wrap: anywhere; }
.sb-authoring-status { margin: 4px 0 0; color: var(--sb-ink-subtle); }
.sb-authoring-status:empty { display: none; }
.sb-authoring textarea { width: 100%; user-select: text; }
.sb-authoring [hidden] { display: none; }
.sb-authoring-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 8px 0; }
.sb-authoring-filters label { display: grid; gap: 4px; min-width: 0; }
.sb-authoring-filters input, .sb-authoring-filters select { width: 100%; min-width: 0; }
.sb-authoring-filters label:first-child { grid-column: 1 / -1; }
`;
