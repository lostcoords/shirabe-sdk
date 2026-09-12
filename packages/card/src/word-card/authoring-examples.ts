import type { AuthoringExample, ExampleSearch, ExampleSearchQuery } from "./host.js";
import type { Example, GlossLanguage } from "./types.js";
import { GLOSS_LABELS, uiLanguagesFrom } from "./languages.js";
import { matchesExample } from "./api-example-search.js";

export function exampleChoices(options: {
  initial: AuthoringExample[];
  query: string;
  entry?: string;
  language: string;
  search?: ExampleSearch;
  load?: (signal: AbortSignal) => Promise<Example[]>;
  onChange(): void;
}) {
  const element = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Examples";
  element.append(legend);
  const list = document.createElement("div");
  const picks: { example: AuthoringExample; input: HTMLInputElement; label: HTMLLabelElement; key: string }[] = [];
  const status = document.createElement("p");
  status.className = "sb-authoring-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Example search status");
  status.tabIndex = -1;
  const filters = document.createElement("div");
  filters.className = "sb-authoring-filters";
  const term = input("search");
  term.value = options.query;
  term.required = true;
  term.maxLength = 64;
  term.lang = "ja";
  const keyword = input("search");
  const length = input("number");
  length.min = "1";
  length.step = "1";
  const translation = select([["any", "Any"], ["with", "With translation"], ["without", "Without translation"]]);
  const languageNames = Object.fromEntries((Object.entries(GLOSS_LABELS) as [GlossLanguage, string][])
    .filter(([code]) => code !== "jpn").map(([code, label]) => [uiLanguagesFrom([code])[0], label]));
  const language = select(Object.entries(languageNames));
  language.value = options.language in languageNames ? options.language : "en";
  for (const [name, field] of [
    ...(options.search ? [["Word or surface", term], ["Translation language", language]] as const : []),
    ["Keyword", keyword], ["Maximum characters", length], ["Translation", translation],
  ] as readonly (readonly [string, HTMLInputElement | HTMLSelectElement])[]) {
    const label = document.createElement("label");
    label.append(name, field);
    filters.append(label);
  }
  const query = (): ExampleSearchQuery => ({
    query: term.value.trim(),
    ...(options.entry && term.value.trim() === options.query.trim() ? { entry: options.entry } : {}),
    keyword: keyword.value,
    ...(length.value ? { maxLength: Number(length.value) } : {}),
    translationLanguage: language.value,
    translation: translation.value as ExampleSearchQuery["translation"],
  });
  const key = () => options.search ? JSON.stringify([term.value.trim(), language.value]) : "";
  let lastKey = "";
  let cursor: string | null = null;
  let request: AbortController | null = null;
  const find = button("Find examples", () => run(false));
  const more = button("More examples", () => run(true));
  const cancel = button("Cancel loading examples", () => {
    stop("Example search cancelled.");
    find.focus();
  });
  more.hidden = true;
  cancel.hidden = true;
  const controls = document.createElement("div");
  controls.className = "sb-authoring-buttons";
  controls.append(find, more, cancel);
  controls.hidden = !options.search && !options.load;

  function filter(): void {
    const requested = query();
    const currentKey = key();
    for (const pick of picks) {
      pick.label.hidden = !matchesExample(pick.example, requested) || (!!options.search && pick.key !== currentKey);
    }
    const visible = picks.filter((pick) => !pick.label.hidden).length;
    const selected = picks.filter((pick) => pick.input.checked);
    const hidden = selected.filter((pick) => pick.label.hidden).length;
    status.textContent = `${visible} ${visible === 1 ? "example" : "examples"} · ${selected.length} selected${hidden ? ` (${hidden} hidden by filters)` : ""}`;
    more.hidden = !cursor || lastKey !== JSON.stringify(requested);
  }

  function add(incoming: AuthoringExample[], searchKey: string): void {
    for (const example of incoming) {
      const existing = picks.find((pick) => pick.example.japanese === example.japanese
        && pick.example.translation === example.translation && pick.example.reference === example.reference
        && pick.example.translationLanguage === example.translationLanguage);
      if (existing) { existing.key = searchKey; continue; }
      const label = document.createElement("label");
      label.className = "sb-authoring-choice";
      const checkbox = input("checkbox");
      const japanese = document.createElement("span");
      japanese.textContent = example.japanese;
      japanese.lang = "ja";
      label.append(checkbox, japanese);
      if (example.translation) {
        const text = document.createElement("span");
        text.className = "sb-authoring-translation";
        text.textContent = example.translation;
        if (example.translationLanguage) text.lang = example.translationLanguage;
        label.append(text);
      }
      if (example.source || example.reference) {
        const source = document.createElement("span");
        source.className = "sb-authoring-source";
        source.textContent = [example.source, example.reference,
          example.translationLanguage ? languageNames[example.translationLanguage] ?? example.translationLanguage : null]
          .filter(Boolean).join(" · ");
        label.append(source);
      }
      picks.push({ example, input: checkbox, label, key: searchKey });
      list.append(label);
    }
    filters.hidden = !picks.length && !options.search;
    filter();
  }

  function stop(message: string): void {
    request?.abort();
    request = null;
    find.disabled = false;
    more.disabled = false;
    cancel.hidden = true;
    element.removeAttribute("aria-busy");
    status.textContent = message;
  }

  async function run(next: boolean): Promise<void> {
    if (request || (!options.search && !options.load) || !term.reportValidity() || !length.reportValidity()) return;
    const current = new AbortController();
    request = current;
    const attached = element.isConnected;
    const searchKey = key();
    const requested = query();
    const focusedButton = [find, more].find((button) => button.matches(":focus"));
    find.disabled = true;
    more.disabled = true;
    cancel.hidden = false;
    element.setAttribute("aria-busy", "true");
    status.textContent = "Loading examples…";
    if (focusedButton) status.focus({ preventScroll: true });
    try {
      const result = options.search
        ? await options.search({ ...requested, ...(next && cursor ? { cursor } : {}) }, current.signal)
        : { examples: await options.load!(current.signal), cursor: null, hasMore: false };
      if (current.signal.aborted || (attached && !element.isConnected)) return;
      cursor = result.hasMore ? result.cursor : null;
      lastKey = JSON.stringify(requested);
      add(result.examples, searchKey);
      options.onChange();
      if (!options.search) find.textContent = "Refresh examples";
      if (!result.examples.length && !picks.length && !result.hasMore) status.textContent = "No examples found.";
      if (!result.examples.length && result.hasMore) status.textContent += " No matches in this batch. Use More examples to keep searching.";
    } catch (error) {
      if (!current.signal.aborted && (!attached || element.isConnected)) {
        status.textContent = options.search && error instanceof Error ? error.message : "Couldn't load examples. Try again.";
      }
    } finally {
      if (request === current) {
        request = null;
        find.disabled = false;
        more.disabled = false;
        cancel.hidden = true;
        element.removeAttribute("aria-busy");
        if (focusedButton && status.matches(":focus")) (focusedButton.hidden ? find : focusedButton).focus({ preventScroll: true });
      }
    }
  }
  const changed = () => {
    if (request) stop("Search changed. Find examples to search again.");
    filter();
  };
  filters.addEventListener("input", changed);
  filters.addEventListener("change", changed);
  filters.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
      event.preventDefault();
      void run(false);
    }
  });
  list.addEventListener("change", () => { filter(); options.onChange(); });
  element.append(filters);
  if (!controls.hidden) element.append(controls);
  element.append(list, status);
  add(options.initial.filter((example) => !options.search || (!!example.reference
    && (!example.translation || example.translationLanguage === language.value))), key());
  return {
    element,
    selected: (): AuthoringExample[] => picks.filter((pick) => pick.input.checked).map(({ example }) => ({
      japanese: example.japanese,
      translation: example.translation,
      ...(example.source ? { source: example.source } : {}),
      ...(example.reference ? { reference: example.reference } : {}),
      ...(example.translationLanguage ? { translationLanguage: example.translationLanguage } : {}),
    })),
  };
}

function input(type: string): HTMLInputElement {
  const field = document.createElement("input");
  field.type = type;
  return field;
}

function select(choices: [string, string][]): HTMLSelectElement {
  const field = document.createElement("select");
  for (const [value, label] of choices) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    field.append(option);
  }
  return field;
}

function button(label: string, action: () => unknown): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => { void action(); });
  return button;
}
