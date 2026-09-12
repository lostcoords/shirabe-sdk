import { DEFAULT_CARD_OPTIONS, dismissPopup, scheduleHide, scheduleShow, setCardHost, setPopupOptions, setWriteState } from "../src/word-card/card.js";
import { SENTENCES } from "./corpus.js";
import { playgroundHost } from "./host.js";

const logEl = document.getElementById("log") as HTMLElement;
const log = (line: string) => {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${line}`;
  logEl.prepend(row);
};

setCardHost(playgroundHost(log));
setWriteState({ canWrite: true, connected: true, languages: ["eng"] });
setPopupOptions({ ...DEFAULT_CARD_OPTIONS });

// The page's own words. In the extension a parser builds these; here they are
// written out, because what is being exercised is the card and not the parse.
const page = document.getElementById("page") as HTMLElement;
for (const sentence of SENTENCES) {
  const p = document.createElement("p");
  p.lang = "ja";
  for (const [surface, lemma] of sentence) {
    if (!lemma) { p.append(surface); continue; }
    const span = document.createElement("span");
    span.className = "sb-word";
    span.dataset.lemma = lemma;
    span.dataset.surface = surface;
    span.dataset.state = "none";
    span.textContent = surface;
    p.append(span);
  }
  page.append(p);
}

// Hover opens, leaving closes: the same two calls the extension makes.
page.addEventListener("mouseover", (event) => {
  const word = (event.target as Element | null)?.closest?.(".sb-word");
  if (word) scheduleShow(word as HTMLElement);
});
page.addEventListener("mouseout", (event) => {
  if ((event.target as Element | null)?.closest?.(".sb-word")) scheduleHide();
});

// Controls, so the options can be exercised without a settings page.
const controls = document.getElementById("controls") as HTMLElement;
const option = (label: string, values: string[], apply: (value: string) => void) => {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  const select = document.createElement("select");
  for (const v of values) select.append(new Option(v, v));
  select.addEventListener("change", () => { apply(select.value); dismissPopup(); });
  wrap.append(select);
  controls.append(wrap);
};

let options = { ...DEFAULT_CARD_OPTIONS };
const push = () => setPopupOptions(options);
option("Theme", ["system", "light", "dark"], (v) => { options = { ...options, theme: v as typeof options.theme }; push(); });
option("Definition size", ["medium", "small", "large"], (v) => { options = { ...options, definitionSize: v as typeof options.definitionSize }; push(); });
option("Open after (ms)", ["180", "0", "500"], (v) => { options = { ...options, lookupDelay: Number(v) }; push(); });
option("Closes itself", ["yes", "no"], (v) => { options = { ...options, hideAutomatically: v === "yes" }; push(); });
option("Mining", ["on", "off"], (v) => setWriteState({ canWrite: v === "on", connected: true, languages: ["eng"] }));

log("ready: hover a word");
