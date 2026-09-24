import type { CardEvent, LookupContext, LookupKind, LookupResult, Outcome, Rating, WordCardHost } from "./host.js";
import type { Definition, Example, GlossLanguage, KanjiDetail, Sense, SenseChip, StudyDetails, TokenCandidate } from "./types.js";
import { rangeFromCaret, selectionText } from "./dom-text.js";
import { placeCard } from "./placement.js";
import { appendFurigana, appendFuriganaSegments, hiraToKata, kataToHira, type FuriganaSegment } from "./furigana.js";
import { isR2AudioUrl, isSnapshotRecordingFilename } from "./audio.js";
import { senseText } from "./senses.js";
import { legendTerm, type LegendTerm, type TagDisplayLocale } from "./legend.js";
import { authoringActions, AUTHORING_CSS } from "./authoring.js";
import { accountActions, ACCOUNT_CSS } from "./account-actions.js";

/** How the reader wants the card to look and behave. The host pushes these in;
    the card never reads a setting store, because two of its three hosts have
    none. */
export type DefinitionSize = "small" | "medium" | "large";
export type Theme = "system" | "light" | "dark";

/** Grade button labels, for a host that draws grading on the card. */
const GRADES: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

// One reused popup, shown next to whichever word the pointer (or keyboard) is
// over. It lives in a shadow root so the host page's CSS can never reach in:
// definitions render the same on every site. Lookups are fetched lazily (and
// cached in the background worker).
let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let box: HTMLElement | null = null; // outer dialog shell (visibility + max-height)
let content: HTMLElement | null = null; // replaced on each lookup; close lives outside it
let footerRow: HTMLElement | null = null;
let resultToggle: HTMLElement | null = null;
let currentKey: string | null = null;
let currentTarget: PopupTarget | null = null; // what an open card is anchored to
let returnFocus: HTMLElement | null = null;
let accountPort: WordCardHost["account"];
let accountControls: HTMLElement | null = null;
let showTimer: number | undefined;
let prefetchTimer: number | undefined;
let hideTimer: number | undefined;
let token = 0; // guards against a slow lookup landing after we've moved on
let activeAudio: HTMLAudioElement | null = null;
let audioGeneration = 0;
let canWrite = false; // user:study:write + entitled → render mining controls
let readOnly = false;
let connected = false; // signed in at all: decides what the no-controls row offers
// The current popup's sense-picker checkboxes (empty unless the word has 2–8
// senses and the user can save). Read at save time to scope the card; ticking
// every box (the default) saves the whole word. `sensePickWord` is the element
// the checkboxes were built for, so a keyboard save against a *different* hovered
// word (nested lookup, scan span) doesn't misapply this popup's picks.
let sensePicks: HTMLInputElement[] = [];
let sensePickWord: HTMLElement | null = null;
const lookupHistory: PopupTarget[] = [];
let historyIndex = -1;
let navigatingHistory = false;
// Built once with the rest of the shell chrome, so they outlive content swaps
// and `refreshHistoryNav` is what keeps them in step with the history.
let historyBack: HTMLButtonElement | null = null;
let historyForward: HTMLButtonElement | null = null;
let currentDepth = 0;
// The reader's gloss stack, for the legend text on a sense chip. English until
// the config lands, which is also what an unconnected reader keeps.
let readerLanguages: GlossLanguage[] = [ "eng" ];
let tagDisplayLocale: TagDisplayLocale | undefined;

// What the popup needs to know about the READER, as opposed to the word: what
// they may save, and which languages they read in. Pushed in whenever the
// config is applied, rather than awaited at render time, because the card is
// drawn synchronously and a promise here would draw it in English first and
// correct itself a tick later.
// Mining needs BOTH: a reader entitled to write, and a host that can carry the
// write out. A host with no study port gets no controls rather than controls
// that throw when clicked, which is what the contract promises.
function canMine(): boolean {
  return !readOnly && canWrite && !!optional().study;
}

export function setWriteState(state: { canWrite: boolean; connected: boolean; languages?: GlossLanguage[]; displayLocale?: TagDisplayLocale; readOnly?: boolean }): void {
  canWrite = state.canWrite;
  readOnly = state.readOnly ?? false;
  connected = state.connected;
  if (state.languages?.length) readerLanguages = state.languages;
  tagDisplayLocale = state.displayLocale;
}

// Timing, theme, autoplay and the reader's own CSS. Same reason as the state
// above: pushed in on every config change so the card can be drawn synchronously.
// 14px suited a card that held a three-word English gloss. A monolingual pack
// puts 大辞林 writing Japanese prose on it instead, and prose is read rather
// than glanced at. The small end is exactly what the card printed before this.
const DEFINITION_SIZES: Record<DefinitionSize, string> = { small: "13px", medium: "14px", large: "16px" };

export type PopupOptions = {
  definitionSize: DefinitionSize;
  lookupDelay: number;
  /** Start a lookup while a word is hovered, before its popup delay ends. */
  prefetchOnHover?: boolean;
  /** Hover time before prefetching; shorter than lookupDelay by default. */
  prefetchDelay?: number;
  hideDelay: number;
  hideAutomatically: boolean;
  theme: Theme;
  audioAutoplay: boolean;
  customCss: string;
  labels?: { parts?: string; lookupIn?: string; showDefinitions?: string };
  /** Override card CSS variables on the shadow host, including popup dimensions. */
  themeVariables?: Partial<Record<`--sb-${string}`, string>>;
  /** Host-owned content below the lookup body. Kept mounted across lookup redraws. */
  footer?: HTMLElement | null;
  /** Omit the SDK's copy and field-selection controls when the host supplies its own actions. */
  showAuthoring?: boolean;
  /** Called when a visible popup closes, including Escape and outside clicks. */
  onClose?: (word: HTMLElement | null) => void;
  /** Translate or replace the explanation opened from a tag chip. */
  legendForTag?: (code: string, category: SenseChip["category"], defaultTerm: LegendTerm | null) => LegendTerm | null;
};
export const DEFAULT_CARD_OPTIONS: PopupOptions = {
  definitionSize: "medium",
  lookupDelay: 180,
  prefetchOnHover: true,
  prefetchDelay: 60,
  hideDelay: 250,
  hideAutomatically: true,
  theme: "system",
  audioAutoplay: false,
  customCss: "",
};
let options: PopupOptions = { ...DEFAULT_CARD_OPTIONS };

// Everything outside the card, injected once. Until it is set the card cannot
// look anything up, which is the point: there is no default host and no import
// that quietly reaches the extension.
let host_: WordCardHost | null = null;
let wordCandidates = new WeakMap<HTMLElement, { surface: string; candidates: TokenCandidate[] }>();
let repaintStudy: (() => void) | undefined;
export function setCardHost(next: WordCardHost, onStudyChanged?: () => void): void {
  if (host_ !== next) {
    wordCandidates = new WeakMap();
    dismissPopup();
    lookupHistory.length = 0;
    historyIndex = -1;
    refreshHistoryNav();
  }
  host_ = next;
  repaintStudy = onStudyChanged;
}

function studyChanged(): void {
  optional().onStudyChanged?.();
  repaintStudy?.();
}
// Looking a word up is the one thing a card cannot do without, so asking for it
// with no host set is a programming error worth hearing about.
function backend(): WordCardHost {
  if (!host_) throw new Error("word card used before setCardHost");
  return host_;
}

// Everything else the host offers is optional by contract, and a host that has
// not been set yet is indistinguishable from one that does not implement it:
// both mean "this card cannot do that here", which every caller already handles.
function optional(): Partial<WordCardHost> {
  return host_ ?? {};
}

export function setPopupOptions(next: PopupOptions): void {
  const previousFooter = options.footer;
  const previousVariables = options.themeVariables;
  options = next;
  if (host) {
    host.dataset.sbTheme = next.theme;
    for (const name of Object.keys(previousVariables ?? {})) host.style.removeProperty(name);
    host.style.setProperty("--sb-definition-size", DEFINITION_SIZES[next.definitionSize]);
    for (const [name, value] of Object.entries(next.themeVariables ?? {})) {
      if (value !== undefined) host.style.setProperty(name, value);
    }
  }
  if (footerRow) {
    if (previousFooter && previousFooter !== next.footer && previousFooter.parentElement === footerRow) previousFooter.remove();
    if (next.footer && next.footer.parentElement !== footerRow) footerRow.insertBefore(next.footer, resultToggle);
  }
  applyCustomCss(next.customCss);
}

// The reader's CSS goes in the shadow root, last, so it can reach our own
// classes without leaking to the page or being reachable from it.
function applyCustomCss(css: string): void {
  if (!root) return;
  let style = root.getElementById("sb-custom-popup-css") as HTMLStyleElement | null;
  if (!css) { style?.remove(); return; }
  if (!style) {
    style = document.createElement("style");
    style.id = "sb-custom-popup-css";
    root.append(style);
  }
  style.textContent = css;
}

// The ticked sense positions to save, or undefined for the whole word (no
// picker, or every sense left ticked). Only a genuine subset scopes the card.
// A sense the API served names its own dictionary. The offline pack does not,
// and it ships JMdict alone, so that is the book its numbering belongs to.
function senseRef(sense: Sense): string {
  return sense.ref ?? `jmdict#${sense.position}`;
}

function pickedSenses(): string[] | undefined {
  if (!sensePicks.length) return undefined;
  const ticked = sensePicks.filter((box) => box.checked).map((box) => box.dataset.ref!).filter(Boolean);
  if (ticked.length === 0 || ticked.length === sensePicks.length) return undefined;
  return ticked;
}

// The picks for `word`, but only when it's the word this popup's picker was built
// for: so the keyboard "save" shortcut honours the checkboxes without ever
// applying them to a different hovered word. Whole word otherwise.
export function picksForWord(word: HTMLElement): string[] | undefined {
  return word === sensePickWord ? pickedSenses() : undefined;
}

function element(): HTMLElement {
  if (content) {
    if (host && !host.isConnected) document.body.append(host);
    return content;
  }
  host = document.createElement("div");
  host.className = "sb-host";
  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  box = document.createElement("div");
  box.className = "sb-popup";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Shirabe dictionary");
  box.tabIndex = -1;
  box.addEventListener("keydown", onPopupKeydown);

  // Permanent chrome: one top-right row of back, forward, close. It survives
  // content swaps, so every state (loading, error, definition) keeps an explicit
  // close (not only hover-away / click-outside) and the history arrows never
  // move as the content under them changes.
  const chromeRow = document.createElement("div");
  chromeRow.className = "sb-chrome";

  historyBack = button("←", "sb-chrome-button", "", () => navigateHistory(-1));
  historyBack.title = "Previous lookup (Alt+←)";
  historyBack.setAttribute("aria-label", "Previous lookup");
  historyForward = button("→", "sb-chrome-button", "", () => navigateHistory(1));
  historyForward.title = "Next lookup (Alt+→)";
  historyForward.setAttribute("aria-label", "Next lookup");
  refreshHistoryNav();

  const close = document.createElement("button");
  close.type = "button";
  close.className = "sb-btn sb-chrome-button sb-close";
  close.textContent = "×";
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    dismiss(true);
  });
  chromeRow.append(historyBack, historyForward, close);

  content = document.createElement("div");
  content.className = "sb-popup-content";
  footerRow = document.createElement("div");
  footerRow.className = "sb-popup-footer";
  box.append(chromeRow, content, footerRow);
  root.append(style, box);
  content.addEventListener("dblclick", (event) => {
    // Firefox exposes a selection inside an open shadow root on the root itself,
    // not on `window`, so reading only `window.getSelection()` makes
    // double-click-a-gloss silently do nothing there.
    const shadow = root as ShadowRoot & { getSelection?: () => Selection | null };
    // `selectionText`, not `toString()`: the headword above carries ruby, so
    // double-clicking it used to hand the nested lookup 帰かえった.
    const selection = selectionText(shadow.getSelection?.() ?? window.getSelection());
    const target = event.target as HTMLElement | null;
    if (selection && target) nestedLookup(selection, target.getBoundingClientRect(), currentDepth);
  });
  document.body.append(host);
  setPopupOptions(options);
  installHoverGuards();
  return content;
}

// The popup stays open while the pointer is over the *safe zone*: the hovered
// word OR the popup itself (across the shadow boundary). And closes shortly
// after the pointer leaves both, or immediately on a click elsewhere. Tracking
// the whole zone (rather than the popup's own mouseenter/leave) means a popup
// that repositions when its content loads no longer vanishes under the pointer.
let guardsInstalled = false;
function installHoverGuards(): void {
  if (guardsInstalled) return;
  guardsInstalled = true;

  window.addEventListener("resize", scheduleReposition);
  window.addEventListener("keydown", onPopupKeydown);
  // Capture phase so scrolling inside the page's own containers counts, and only
  // for captions: see `scheduleReposition`.
  window.addEventListener(
    "scroll",
    () => {
      if (currentTarget && captionRect(anchorElement(currentTarget))) scheduleReposition();
    },
    { passive: true, capture: true },
  );

  document.addEventListener("mouseover", (e) => {
    if (!visible() || !inSafeZone(e)) return;
    window.clearTimeout(hideTimer);
    // Reaching the card also cancels whatever the trip queued. Moving from a
    // word to the card crosses the words in between, and each one starts its own
    // lookup: without this the card retargets itself to a word the reader only
    // passed over, a fifth of a second after they arrived at the one they wanted.
    if (host && e.composedPath().includes(host)) window.clearTimeout(showTimer);
  });
  // The pointer leaving the document fires no further mousemove, so the scan
  // path never gets another chance to close the card.
  //
  // Unless the pointer never went anywhere and another app took the screen: a
  // launcher, a screenshot tool, a switch to another window. That reads to the
  // page as a `mouseleave` too, and closing on it loses the definition somebody
  // is reading the moment they reach for anything outside the browser. Focus is
  // what tells the two apart, so a card only closes for a pointer that left
  // while the page still had the keyboard.
  document.addEventListener("mouseleave", () => {
    if (visible() && document.hasFocus()) scheduleHide();
  });
  // Focus can also leave *after* the mouseleave that started the countdown, and
  // the order is the OS's to decide, so the guard above cannot be the whole fix:
  // a blur is proof after the fact that the pointer exit was an app switch.
  window.addEventListener("blur", () => window.clearTimeout(hideTimer));
  document.addEventListener("mouseout", (e) => {
    // Only when actually crossing *out* of the safe zone (word/popup → elsewhere),
    // so moving around inside the popup or over other page content doesn't churn.
    if (visible() && inSafeZone(e) && !nodeInSafeZone(e.relatedTarget as Node | null)) scheduleHide();
  });
  // A click anywhere outside the popup (and not on a word) dismisses it now.
  document.addEventListener(
    "mousedown",
    (e) => {
      if (visible() && !inSafeZone(e)) dismiss();
    },
    true,
  );
}

const visible = (): boolean => !!box?.classList.contains("sb-visible");

// Is the event's pointer over the popup or a word? Uses composedPath so a hover
// inside the popup's shadow DOM counts.
function inSafeZone(e: Event): boolean {
  if (host && e.composedPath().includes(host)) return true;
  return nodeInSafeZone(e.target as Node | null);
}

// Same test for a bare node (a mouseout's relatedTarget), retargeted to the host
// when the pointer moves into the popup's shadow root.
function nodeInSafeZone(node: Node | null): boolean {
  if (!node) return false;
  if (host && (node === host || host.contains(node))) return true;
  if (markedWord && (node === markedWord || markedWord.contains(node))) return true;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!el?.closest?.(".sb-word");
}

export function scheduleShow(word: HTMLElement): void {
  window.clearTimeout(hideTimer);
  window.clearTimeout(showTimer);
  schedulePrefetch(word);
  showTimer = window.setTimeout(() => showWord(word), options.lookupDelay);
}

/** Prefetch a token without opening the popup. Hosts may supply a cheaper
    prefetch method; otherwise the SDK shares the lookup result with showNow. */
export function schedulePrefetch(word: HTMLElement, lookupHost: WordCardHost = backend()): void {
  window.clearTimeout(prefetchTimer);
  if (options.prefetchOnHover === false) return;
  prefetchTimer = window.setTimeout(() => { void prefetchWord(word, lookupHost); }, options.prefetchDelay ?? 60);
}

export async function prefetchWord(word: HTMLElement, lookupHost: WordCardHost = backend()): Promise<void> {
  if (!word.isConnected) return;
  const target = wordTarget(word);
  if (lookupHost.prefetch && !target.pick) {
    try { await lookupHost.prefetch(target.query, target.kind ?? "word", target.context); } catch { /* Opening the card can retry. */ }
    return;
  }
  try { await lookupTarget(target, lookupHost); } catch { /* Opening the card can retry. */ }
}

// Show immediately (e.g. the modifier key was pressed while already hovering).
export function showNow(word: HTMLElement): void {
  window.clearTimeout(hideTimer);
  window.clearTimeout(showTimer);
  window.clearTimeout(prefetchTimer);
  showWord(word);
}

// Yomitan-style lookup without rewriting the page first. The scanner gives us
// the text window beginning at the caret and the first character's rectangle;
// the local dictionary chooses the longest/deinflected match. A detached word
// element carries the same action data contract as parsed `.sb-word` spans.
export function scheduleTextLookup(query: string, rect: DOMRect, sentence: string, targetStart = 0, anchor?: ScanAnchor, kind: "text" | "word" = "text"): void {
  window.clearTimeout(hideTimer);
  window.clearTimeout(showTimer);
  showTimer = window.setTimeout(() => {
    const word = document.createElement("span");
    word.dataset.surface = query;
    word.dataset.lemma = query;
    word.dataset.state = "none";
    word.dataset.sentence = sentence;
    word.dataset.targetStart = String(targetStart);
    optional().rememberOrigin?.(word, anchor?.node.parentElement); // the detached span's link back to the page
    void showTarget({ key: `scan:${kind}:${query}:${Math.round(rect.left)}:${Math.round(rect.top)}`, query, rect, word, depth: 0, anchor, kind });
  }, Math.min(options.lookupDelay, 120));
}

export function scheduleHide(): void {
  if (pinned || root?.activeElement) return;
  window.clearTimeout(showTimer);
  window.clearTimeout(prefetchTimer);
  // Any countdown already running is replaced rather than joined. Two callers
  // asking to hide on the same pointer move is ordinary (the card's own guard
  // and a host's), and without this the first timer is orphaned: the id is
  // overwritten, so cancelling on arrival at the card cancels only the second
  // and the first still fires. The card then vanished a quarter of a second
  // after the reader reached it, which read as the popup being broken.
  window.clearTimeout(hideTimer);
  // Staying open until dismissed is a real preference: a card you are reading
  // should not need the pointer parked on it. Escape and a click outside still
  // close it, so "never closes itself" is not "cannot be closed".
  if (!options.hideAutomatically) return;
  hideTimer = window.setTimeout(hide, options.hideDelay); // grace to cross the gap onto the popup
}

// Held open by the capture form. A click outside still dismisses (that is a
// decision to leave), but drifting off the card no longer closes it.
let pinned = false;

// A page-level highlight of the matched span for raw-text scans, via the CSS
// Custom Highlight API: it never touches the user's real text selection. Styled
// by `::highlight(sb-scan)` in content.css; a no-op where the API is unsupported.
const SCAN_HIGHLIGHT = "sb-scan";

// Which word the card is currently about, kept marked for as long as it is
// open. Hover cannot carry this on its own: reaching the card means leaving the
// word, and a touch reader never hovers at all, so tapping a word on a phone
// gave no sign of which one had been tapped.
//
// A raw-text scan has no span on the page to mark, only a detached one standing
// in for the text: `highlightScan` is that path's answer, and this one skips it.
const OPEN_WORD = "sb-word-open";
let markedWord: HTMLElement | null = null;

function markOpenWord(word: HTMLElement | null): void {
  const next = word?.isConnected ? word : null;
  if (markedWord === next) return;
  markedWord?.classList.remove(OPEN_WORD);
  markedWord = next;
  markedWord?.classList.add(OPEN_WORD);
}
function highlightScan(range: Range | null): void {
  const registry = (globalThis.CSS as unknown as { highlights?: { set(name: string, value: unknown): void; delete(name: string): void } } | undefined)?.highlights;
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightCtor) return;
  if (range) registry.set(SCAN_HIGHLIGHT, new HighlightCtor(range));
  else registry.delete(SCAN_HIGHLIGHT);
}

function hide(): void {
  const closedWord = visible() ? currentTarget?.word ?? null : null;
  stopAudio();
  box?.classList.remove("sb-visible");
  currentKey = null;
  currentTarget = null;
  markOpenWord(null);
  // Retire the in-flight lookup too. Without this its `mine !== token` guard
  // still passes, and a lookup the user already dismissed goes on to register a
  // scan highlight: a highlighted span on the page with no card above it.
  token++;
  highlightScan(null);
  if (closedWord) options.onClose?.(closedWord);
}

// Re-anchor when the viewport changes under an open card. Ordinary page scrolling
// needs nothing: the host is positioned in document coordinates, so it travels
// with the word. But a subtitle overlay is `position: fixed`: the caption stays
// put while the page moves, leaving the card stranded. A resize invalidates every
// placement decision, caption or not. Coalesced onto one frame so a scroll burst
// costs a single measure.
let repositionFrame = 0;
let scrollIndicatorObserver: ResizeObserver | undefined;
function scheduleReposition(): void {
  if (repositionFrame || !visible() || !currentTarget) return;
  repositionFrame = requestAnimationFrame(() => {
    repositionFrame = 0;
    if (!visible() || !currentTarget) return;
    position(currentTarget);
  });
}

// The target's rect as it is *now*. The one captured at lookup time goes stale as
// soon as the page moves; a raw-text scan's word element is detached, so its own
// rect is empty and the scan anchor is what still knows where the match sits.
function liveRect(target: PopupTarget): DOMRect {
  if (target.word.isConnected) return target.word.getBoundingClientRect();
  if (target.anchor?.node.isConnected) {
    return rangeFromCaret(target.anchor.node, target.anchor.offset, 1).getBoundingClientRect();
  }
  return target.rect;
}

// Close now (a click outside): cancel any pending show/hide too.
function dismiss(restoreFocus = false): void {
  const origin = returnFocus;
  const focused = !!root?.activeElement;
  window.clearTimeout(showTimer);
  window.clearTimeout(prefetchTimer);
  window.clearTimeout(hideTimer);
  hide();
  returnFocus = null;
  if (restoreFocus && focused && origin?.isConnected) {
    const temporary = !origin.hasAttribute("tabindex") && origin.tabIndex < 0;
    if (temporary) origin.tabIndex = -1;
    origin.focus({ preventScroll: true });
    if (temporary) origin.removeAttribute("tabindex");
  }
}

export function dismissPopup(): void {
  dismiss(true);
}

type WordInflection = { key: string; entry?: string; surface: string; labels: string[]; base?: string };
const wordInflections = new WeakMap<HTMLElement, WordInflection>();

function wrappedInflection(word: HTMLElement): WordInflection | undefined {
  const raw = word.dataset.inflection;
  const base = word.dataset.inflectionBase;
  const surface = word.dataset.surface;
  if (!raw || raw.length > 4096 || !surface || (base && base.length > 256)) return;
  const key = JSON.stringify([raw, base, surface]);
  const saved = wordInflections.get(word);
  if (saved?.key === key) return saved;
  try {
    const labels: unknown = JSON.parse(raw);
    if (!Array.isArray(labels) || !labels.length || labels.length > 32
      || labels.some((label) => typeof label !== "string" || !label.trim() || label.length > 128)) return;
    const inflection = { key, entry: word.dataset.entry, surface, labels: labels as string[], base };
    wordInflections.set(word, inflection);
    return inflection;
  } catch { return; }
}

function wordTarget(word: HTMLElement): PopupTarget {
  const lemma = word.dataset.lemma ?? word.dataset.surface ?? "";
  const pick = word.dataset.entry;
  const startOffset = Number(word.dataset.targetStart);
  const endOffset = Number(word.dataset.targetEnd);
  const context = {
    surface: word.dataset.surface,
    reading: word.dataset.reading,
    pos: word.dataset.lookupPos ?? word.dataset.pos,
    ...(word.dataset.sentence ? { text: word.dataset.sentence } : {}),
    ...(Number.isInteger(startOffset) && startOffset >= 0 ? { startOffset } : {}),
    ...(Number.isInteger(endOffset) && endOffset > startOffset ? { endOffset } : {}),
  };
  const query = pick ? context.surface ?? lemma : lemma;
  const stored = wordCandidates.get(word);
  const candidates = optional().candidatesFor?.(word) ?? (stored && stored.surface === context.surface
    && stored.candidates.some((candidate) => candidate.entry === pick) ? stored.candidates : undefined);
  return { key: `word:${JSON.stringify([query, pick, context])}`, query, pick, context, candidates,
    inflection: wrappedInflection(word), rect: word.getBoundingClientRect(), word, depth: 0 };
}

function showWord(word: HTMLElement): void {
  void showTarget(wordTarget(word));
}

// Where a raw-text scan started, so we can highlight exactly the matched span on
// the page once the dictionary tells us how long the match is (Yomitan's
// `originalTextLength`). Absent for `.sb-word` hovers (already highlighted) and
// nested/selection lookups.
type ScanAnchor = { node: Text; offset: number };
type PopupTarget = {
  key: string; query: string; rect: DOMRect; word: HTMLElement; depth: number;
  kind?: LookupKind; anchor?: ScanAnchor;
  pick?: string;
  context?: LookupContext;
  candidates?: TokenCandidate[];
  inflection?: WordInflection;
};

// A speculative answer belongs to the host and the exact lookup context. It is
// consumed when the card opens, so retries and later preference changes can ask
// again. The small expiry also bounds results from words never clicked.
const prefetched = new WeakMap<WordCardHost, Map<string, { result: Promise<LookupResult>; expires: number }>>();
function prefetchKey(target: PopupTarget): string {
  return JSON.stringify([target.query, target.kind ?? "word", target.pick, target.context]);
}
function requestLookup(target: PopupTarget, lookupHost: WordCardHost): Promise<LookupResult> {
  return target.pick
    ? lookupHost.lookupEntry(target.pick, target.query, target.word)
    : lookupHost.lookup(target.query, target.kind ?? "word", target.context ?? {
      surface: target.word.dataset.surface,
      reading: target.word.dataset.reading,
      pos: target.word.dataset.lookupPos ?? target.word.dataset.pos,
    });
}
function lookupTarget(target: PopupTarget, lookupHost: WordCardHost, speculative = true): Promise<LookupResult> {
  let entries = prefetched.get(lookupHost);
  const key = prefetchKey(target);
  const cached = entries?.get(key);
  if (cached && cached.expires > Date.now()) {
    if (!speculative) entries?.delete(key);
    return cached.result;
  }
  entries?.delete(key);
  const result = requestLookup(target, lookupHost);
  if (speculative) {
    if (!entries) { entries = new Map(); prefetched.set(lookupHost, entries); }
    if (entries.size >= 32) entries.delete(entries.keys().next().value!);
    entries.set(key, { result, expires: Date.now() + 10_000 });
  }
  return result;
}

async function showTarget(target: PopupTarget, retrying = false): Promise<void> {
  if (!retrying && target.word === currentTarget?.word && target.key === currentKey && box?.classList.contains("sb-visible")) return;
  stopAudio();
  const focused = root?.activeElement as HTMLElement | null;
  if (!visible()) {
    let origin = document.activeElement;
    while (origin?.shadowRoot?.activeElement) origin = origin.shadowRoot.activeElement;
    returnFocus = origin instanceof HTMLElement && origin !== document.body && origin !== host
      ? origin : target.word.isConnected ? target.word : target.anchor?.node.parentElement ?? null;
  }
  currentKey = target.key;
  currentTarget = target;
  currentDepth = target.depth;
  markOpenWord(target.word);
  if (!navigatingHistory && !retrying) recordHistory(target);
  navigatingHistory = false;
  refreshHistoryNav();
  const mine = ++token;
  highlightScan(null); // drop any previous scan highlight until this match resolves

  const el = element();
  if (box) box.style.height = "";
  resultToggle?.remove();
  resultToggle = null;
  const nextAccount = optional().account;
  const showAccount = !!nextAccount && nextAccount.connected?.() !== false;
  if (accountPort !== nextAccount || !!accountControls !== showAccount) {
    accountControls?.remove();
    accountPort = nextAccount;
    accountControls = showAccount ? accountActions(nextAccount, dismissPopup) : null;
    if (accountControls) box?.append(accountControls);
  }
  if (focused && (el.contains(focused) || (focused as HTMLButtonElement).disabled)) box?.focus({ preventScroll: true });
  el.replaceChildren(loadingRow(target.context?.surface ?? target.query));
  position(target);
  // The visibility class belongs on the dialog shell, not the content wrapper
  // `element()` returns: `.sb-popup.sb-visible` is what the stylesheet, `hide`,
  // and `visible()` all key off.
  box?.classList.add("sb-visible");

  // A pick is answered by handle, so the reader gets the word they chose rather
  // than the one the ladder prefers. Everything after this point is the same:
  // the definition it lands on is a definition like any other.
  let res: LookupResult;
  try {
    res = retrying ? await requestLookup(target, backend()) : await lookupTarget(target, backend(), false);
  } catch {
    res = { status: "failed", message: "Definitions are unavailable. Please try again later." };
  }
  if (mine !== token) return; // user moved to another word meanwhile

  if (res.status === "unavailable") {
    const link = document.createElement("a");
    link.textContent = res.action.label;
    const url = new URL(res.action.url);
    if (url.protocol === "https:" || url.protocol === "http:") link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "sb-headword";
    el.replaceChildren(messageRow(res.message), messageRow(link));
    position(target);
    optional().onDefinitionRendered?.(null);
    return;
  }

  if (res.status === "failed") {
    const body = block("sb-body", "");
    const message = messageRow(res.message);
    message.setAttribute("role", "status");
    const actions = block("sb-authoring", "");
    const retry = button("Retry lookup", "", "", () => {
      if (mine !== token || !visible() || retry.disabled) return;
      if (root?.activeElement === retry) box?.focus({ preventScroll: true });
      retry.disabled = true;
      void showTarget(target, true);
    });
    retry.type = "button";
    for (const type of ["click", "pointerdown", "pointerup", "mousedown", "mouseup"]) {
      retry.addEventListener(type, (event) => event.stopPropagation());
    }
    for (const type of ["keydown", "keyup"] as const) {
      retry.addEventListener(type, (event) => { if (["Enter", " "].includes(event.key)) event.stopPropagation(); });
    }
    actions.append(retry);
    body.append(message, actions);
    el.replaceChildren(body);
    position(target);
    optional().onDefinitionRendered?.(null);
    optional().report?.("lookup_failed", { kind: target.kind ?? "word" });
    return;
  }
  if (res.status === "pending") {
    el.replaceChildren(loadingRow(target.context?.surface ?? target.query), messageRow(res.message));
    position(target);
    // Only a host that can unblock itself gets asked to. Retrying against one
    // that cannot would ask the same question forever, and the reader would
    // watch a card that never resolves and never says why.
    if (optional().resolvePending) void waitForHost(target, mine);
    return;
  }
  if (res.definition && target.inflection) {
    const inflection = target.inflection;
    if (!inflection.entry && !target.pick) inflection.entry = res.definition.entry;
    if (inflection.entry && inflection.entry === res.definition.entry) {
      const definition = res.definition;
      res = { ...res, definition: { ...definition, sourceForm: definition.sourceForm ?? inflection.surface,
        baseForm: definition.baseForm ?? definition.inflectionBase ?? definition.headword,
        inflection: definition.inflection ?? [...inflection.labels],
        inflectionBase: definition.inflectionBase ?? (definition.inflection === undefined ? inflection.base : undefined) } };
    }
  }
  const studyStatus = readOnly && res.definition ? block("sb-authoring-status", "") : undefined;
  if (studyStatus) studyStatus.hidden = true;
  if (res.definition) {
    if (target.kind === "text" && res.definition.sourceForm) target.context = { ...target.context, surface: res.definition.sourceForm };
    if (res.candidates) target.candidates = res.candidates;
    const studyBase = res.definition.baseForm ?? res.definition.inflectionBase ?? res.definition.headword;
    target.word.dataset.lemma = studyBase;
    target.word.dataset.surface = res.definition.sourceForm ?? target.context?.surface ?? target.query;
    if (target.candidates) wordCandidates.set(target.word, { surface: target.word.dataset.surface, candidates: target.candidates });
    const studyReading = res.definition.baseReading ?? res.definition.reading;
    if (studyReading) target.word.dataset.reading = studyReading;
    // The entry behind the word the reader is looking at, so a Quick Save posts
    // the same dictionary handle the full form does and the card lands linked.
    if (res.definition.entry) target.word.dataset.entry = res.definition.entry;
    else delete target.word.dataset.entry;
    const matched = res.definition.sourceForm ?? target.context?.surface ?? target.query;
    const targetStart = Number(target.word.dataset.targetStart);
    if (Number.isInteger(targetStart) && targetStart >= 0) {
      target.word.dataset.targetEnd = String(targetStart + matched.length);
    }
    // Snap the on-page highlight to exactly the matched span (raw-text scans).
    if (target.anchor?.node.isConnected) highlightScan(rangeFromCaret(target.anchor.node, target.anchor.offset, matched.length));
    if (canMine()) {
      const details_ = await backend().study?.states([studyBase]).catch(() => null);
      if (mine !== token) return;
      const details = details_?.[studyBase];
      if (details) {
        backend().study?.apply(target.word, details);
        // One resolver for the destination, so a word with a card per meaning
        // can't get a deep link here and the card browser everywhere else.
        if (details.cardId != null) target.word.dataset.cardUrl = await backend().study?.urlForWord(target.word) ?? target.word.dataset.cardUrl;
      } else if (details_) {
        target.word.dataset.state = "none";
      }
    }
  }
  if (root?.activeElement && el.contains(root.activeElement)) box?.focus({ preventScroll: true });
  el.replaceChildren(...definitionRows(res.definition, target.query, target.word, studyStatus, res.alternatives));
  position(target);
  optional().onDefinitionRendered?.(res.definition);
  if (studyStatus) void refreshReadOnlyStudy(target, mine, studyStatus);
  // Which of the two happened matters: a card that renders and a card that says
  // "no entry" look the same in a count of openings, and they are opposite
  // answers about whether the dictionary is doing its job.
  optional().report?.(res.definition ? "card_opened" : "card_missing", {
    kind: target.kind ?? "word",
    senses: res.definition?.senses.length ?? 0,
    candidate_count: res.alternatives?.length ?? res.candidates?.length ?? (res.definition ? 1 : 0),
  });
}

async function refreshReadOnlyStudy(target: PopupTarget, mine: number, status: HTMLElement): Promise<void> {
  const study = backend().study;
  const lemma = target.word.dataset.lemma;
  if (!study || !lemma) return;
  try {
    const all = await study.states([lemma]);
    if (mine !== token || !visible() || !status.isConnected) return;
    const details = all?.[lemma];
    if (!details) {
      if (all) target.word.dataset.state = "none";
      return;
    }
    study.apply(target.word, details);
    const labels: Record<StudyDetails["state"], string> = {
      none: "Not saved", new: "New", learning: "Learning", due: "Due", suspended: "Suspended", retired: "Retired",
    };
    status.textContent = `${study.source ?? "Shirabe"} · ${labels[details.state]}`;
    status.setAttribute("aria-label", "Study status");
    status.setAttribute("role", "note");
    status.hidden = false;
    position(target);
  } catch { return; }
}

// The host said "wait". It does whatever unblocks the lookup and reports
// progress; when it resolves we ask for the same word again. The card never
// learns what the host was doing, which is what lets a web host, with nothing to
// wait for, simply not implement this.
async function waitForHost(target: PopupTarget, mine: number): Promise<void> {
  const stillHere = () => mine === token && visible() && currentKey === target.key;
  try {
    await backend().resolvePending?.((message) => {
      if (!stillHere()) return;
      const progress = messageRow(message);
      progress.classList.add("sb-body");
      element().replaceChildren(loadingRow(target.context?.surface ?? target.query), progress);
      position(target);
    });
  } catch (error) {
    if (stillHere()) element().replaceChildren(messageRow(error instanceof Error ? error.message : String(error)));
    return;
  }
  if (!stillHere()) return;
  currentKey = null;
  navigatingHistory = true;
  await showTarget(target);
}

// Caption line/cue boxes to clear when a subtitle word is looked up: the popup
// must never cover the rest of the caption, only sit beside or clear of it.
const CAPTION_SELECTOR = [
  ".caption-window", ".ytp-caption-window-container", // YouTube
  ".player-timedtext-text-container", // Netflix
  ".asbplayer-subtitles", // asbplayer
].join(",");

function position(target: PopupTarget): void {
  if (!host || !box) return;
  const rect = liveRect(target);
  host.style.visibility = "hidden";
  host.style.left = "0px";
  host.style.top = "0px";
  box.style.maxHeight = ""; // measure the card's natural size, not last placement's cap
  // Parked at 0,0 the host's own rect tells us where its containing block starts
  // in viewport coordinates, so the offsets below need no assumption about what
  // that block is. Adding `scrollX/scrollY` instead only worked while `<body>`
  // was static and untransformed: a site with `body { position: relative }`
  // pushed the card off by the body's origin.
  const { width, height, left: originLeft, top: originTop } = host.getBoundingClientRect();

  const place = placeCard({
    rect,
    // What the card must clear. For a subtitle word that's the whole caption
    // line (so we don't bury the rest of the sentence being read); for an
    // ordinary page word it's just the word.
    avoid: captionRect(anchorElement(target)) ?? rect,
    size: { width, height },
    view: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    vertical: isVerticalWriting(anchorElement(target)),
  });

  // The cap belongs on `.sb-popup` inside the shadow root: it owns the scrollable
  // body. Capping the host instead would leave the card overflowing it, uncapped.
  if (place.maxHeight != null) box.style.maxHeight = `${place.maxHeight}px`;
  host.style.left = `${place.left - originLeft}px`;
  host.style.top = `${place.top - originTop}px`;
  host.style.visibility = "";
}

// Whether the looked-up text is laid out vertically, which flips which side of
// the word is "in the flow". Read off the word itself: writing mode inherits
// from whatever container the page laid the text out in.
function isVerticalWriting(el: Element | null): boolean {
  return el ? /^(vertical|sideways)/.test(getComputedStyle(el).writingMode) : false;
}

// The connected element the target actually lives in. A raw-text scan's word
// element is detached: it never entered the page. So the scan anchor's text
// node is what still knows which container, and which writing mode, the match
// sits in. Without this every scan lookup in a vertical reading layout would
// be measured against `document.body` and treated as horizontal.
function anchorElement(target: PopupTarget): Element | null {
  if (target.word.isConnected) return target.word;
  return target.anchor?.node.parentElement ?? null;
}

// The caption line's on-screen rect when `word` is a subtitle, else null. Prefers
// the cue container (full line width); falls back to the media caption context we
// tag with data-media-timestamp.
function captionRect(word?: Element | null): DOMRect | null {
  const caption = word?.closest(CAPTION_SELECTOR) ?? word?.closest("[data-media-timestamp]");
  return caption ? caption.getBoundingClientRect() : null;
}

function loadingRow(lemma: string): Node {
  const wrap = document.createElement("div");
  wrap.className = "sb-loading";
  wrap.setAttribute("aria-busy", "true");
  const head = document.createElement("div");
  head.className = "sb-popup-head";
  head.textContent = lemma.length > 32 ? `${lemma.slice(0, 32)}…` : lemma;
  const body = document.createElement("div");
  body.className = "sb-loading-body";
  body.setAttribute("role", "status");
  const spinner = document.createElement("span");
  spinner.className = "sb-loading-spinner";
  spinner.setAttribute("aria-hidden", "true");
  body.append(spinner, "Loading definitions…");
  wrap.append(head, body);
  return wrap;
}

function messageRow(text: string | Node): HTMLElement {
  const div = document.createElement("div");
  div.className = "sb-popup-message";
  div.append(text);
  return div;
}

function definitionRows(
  def: Definition | null,
  lemma: string,
  word: HTMLElement,
  studyStatus?: HTMLElement,
  alternatives?: readonly Definition[],
): Node[] {
  scrollIndicatorObserver?.disconnect();
  sensePicks = []; // rebuilt by sensesList for this render
  sensePickWord = null;
  if (!def) {
    const body = document.createElement("div");
    body.className = "sb-body";
    body.setAttribute("aria-live", "polite");
    body.append(messageRow(`No entry for 「${lemma}」`));
    const links = lookupLinks(null, word);
    if (links) body.append(links);
    const rows: Node[] = [body];
    if (canMine()) rows.push(actions(word));
    return rows;
  }

  const displayedSpellings = new Map<Definition, string>();
  let visibleDefinition = def;
  let head = headRow(def);
  function selectForm(definition: Definition, spelling: string): void {
    displayedSpellings.set(definition, spelling);
    if (visibleDefinition === definition) {
      const link = head.querySelector<HTMLElement>(".sb-headword");
      if (link) setHeadwordSpelling(link, spelling, definition.reading);
    }
  }

  // A scrollable body (pinned head + actions) mirroring the shirabe.org card.
  const body = document.createElement("div");
  body.className = "sb-body";
  // The interesting half of this card arrives after it opens, so a reader who
  // was dropped into the dialog would otherwise sit on "Looking up…" in silence.
  // It changes once per card, so polite is not chatty.
  body.setAttribute("aria-live", "polite");
  const metadataRows = [resultMetadata(def)];
  const otherMatches = alternatives?.filter((alternative) => alternative.entry !== def.entry && !alternative.name) ?? [];
  const rankedNames = alternatives?.filter((alternative) => alternative.name) ?? [];
  const nameMatches = def.name && !rankedNames.some((alternative) => alternative.entry === def.entry)
    ? [def, ...rankedNames] : rankedNames;
  // Complete alternatives own the result presentation, even for one match.
  // Metadata-only hosts retain the compact picker.
  const picker = alternatives ? null : candidateRow(word, def);
  if (picker) body.append(picker);
  if (studyStatus) body.append(studyStatus);
  if (def.name) {
    body.append(nameResults(nameMatches, word));
  } else {
    if (def.kanji) body.append(kanjiReadings(def.kanji));
    const parts = partsRow(def);
    if (parts) body.append(parts);
    // A picker only when the user can save and every sense is shown (2–8).
    const pickable = canWrite && def.senses.length > 1 && def.senses.length <= 8;
    if (pickable) sensePickWord = word;
    body.append(sensesList(def, pickable, coveredSenses(word)));
    const forms = formsRow(def.forms, (spelling) => selectForm(def, spelling));
    if (forms) body.append(forms);
    const kanji = def.kanji ? null : kanjiStrip(def.headword);
    if (kanji) body.append(kanji);
    const examples = examplesBlock(def.examples, def);
    if (examples) body.append(examples);
  }
  const groupedNames = def.name ? [] : nameMatches;
  const alternativesSection = otherMatches.length || groupedNames.length
    ? alternativeResults(otherMatches, groupedNames, word, selectForm) : null;
  const firstPanel = alternativesSection ? document.createElement("section") : null;
  if (firstPanel) {
    firstPanel.className = "sb-result-panel";
    firstPanel.append(...body.childNodes);
    body.append(firstPanel);
  }
  const links = lookupLinks(def, word);
  if (links) (firstPanel ?? body).append(links);
  const lookupHost = backend();
  if (options.showAuthoring !== false) {
    (firstPanel ?? body).append(authoringActions(def, word, lookupHost.authoring, def.entry ? async () => {
      const result = await lookupHost.lookupEntry(def.entry!, def.headword);
      if (result.status !== "found") throw new Error(result.message);
      return result.definition?.examples ?? [];
    } : undefined, lookupHost.exampleSearch?.bind(lookupHost)));
  }

  const navigationRows: HTMLElement[] = [];
  let resultPanels: HTMLElement[] = [];
  let visibleIndex = 0;
  let showResult = (_index: number) => {};
  let heldHeight = 0;
  const keepPopupHeight = (change: () => void) => {
    const popup = box;
    if (!popup) return change();
    const before = popup.getBoundingClientRect().height;
    popup.style.height = "";
    change();
    heldHeight = Math.max(heldHeight, before, popup.getBoundingClientRect().height);
    if (heldHeight) popup.style.height = `${heldHeight}px`;
    if (currentTarget) position(currentTarget);
  };
  if (alternativesSection) {
    const articles = [...alternativesSection.querySelectorAll<HTMLElement>(".sb-alternative")];
    metadataRows.push(...otherMatches.map(resultMetadata));
    if (groupedNames.length) metadataRows.push(resultMetadata(null));
    for (const row of metadataRows.slice(1)) row.hidden = true;
    resultPanels = [firstPanel!, ...articles];
    for (const article of articles) {
      article.hidden = true;
      body.append(article);
    }
    const results = [def, ...otherMatches, ...groupedNames.slice(0, 1)];
    const overview = document.createElement("nav");
    overview.className = "sb-results-overview";
    overview.id = "sb-results-overview";
    overview.setAttribute("aria-label", "All results");
    overview.hidden = true;
    const list = document.createElement("ol");
    list.className = "sb-results-list";
    const resultButtons = results.map((result, index) => {
      const nameGroup = groupedNames.length > 0 && index === results.length - 1;
      const item = document.createElement("li");
      const link = document.createElement("button");
      link.type = "button";
      link.className = "sb-result-link";
      const number = document.createElement("span");
      number.className = "sb-result-number";
      number.textContent = String(index + 1);
      const details = document.createElement("span");
      details.className = "sb-result-details";
      const title = document.createElement("span");
      title.className = "sb-result-title";
      title.textContent = nameGroup ? "Names" : result.headword;
      if (!nameGroup) title.lang = "ja";
      const heading = document.createElement("span");
      heading.className = "sb-result-heading";
      heading.append(title);
      const readingText = nameGroup
        ? [...new Set(groupedNames.map((name) => name.reading).filter((reading): reading is string => !!reading))].join(" · ")
        : result.reading;
      if (readingText && (nameGroup || readingText !== result.headword)) {
        const reading = document.createElement("span");
        reading.className = "sb-result-reading";
        reading.lang = "ja";
        reading.textContent = readingText;
        heading.append(reading);
      }
      const summary = document.createElement("span");
      summary.className = "sb-result-summary";
      const kind = nameGroup || result.name ? "name" : result.kind ?? "definition";
      const kindTag = document.createElement("span");
      kindTag.className = `sb-result-kind sb-result-kind-${kind}`;
      kindTag.textContent = tagDisplayLocale === "es"
        ? { definition: "Palabra", name: "Nombre", encyclopedia: "Artículo" }[kind]
        : { definition: "Word", name: "Name", encyclopedia: "Article" }[kind];
      const preview = document.createElement("span");
      preview.className = "sb-result-preview";
      preview.textContent = nameGroup
        ? tagDisplayLocale === "es" ? `${groupedNames.length} ${groupedNames.length === 1 ? "nombre" : "nombres"}`
          : `${groupedNames.length} ${groupedNames.length === 1 ? "name" : "names"}`
        : result.senses[0] ? senseText(result.senses[0]) : "";
      summary.append(kindTag, preview);
      details.append(heading, summary);
      link.append(number, details);
      item.append(link);
      list.append(item);
      return link;
    });
    overview.append(list);
    const toggle = button(`1 of ${results.length} results`, "sb-results-toggle", "", () => {
      const open = overview.hidden;
      keepPopupHeight(() => {
        overview.hidden = !open;
        body.hidden = open;
        scrollRegion.hidden = open;
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Hide all results" : `Show all ${results.length} results`);
      });
      if (open) resultButtons[visibleIndex]?.focus();
      else window.requestAnimationFrame(updateScrollIndicator);
    });
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", overview.id);
    toggle.setAttribute("aria-label", `Show all ${results.length} results`);
    resultToggle = toggle;
    footerRow?.append(toggle);
    const count = toggle.querySelector("span")!;
    resultButtons[0]?.setAttribute("aria-current", "true");
    showResult = (index: number) => {
      if (index === visibleIndex) return;
      const from = visibleIndex;
      resultPanels[visibleIndex]!.hidden = true;
      metadataRows[visibleIndex]!.hidden = true;
      visibleIndex = index;
      resultPanels[index]!.hidden = false;
      metadataRows[index]!.hidden = false;
      body.scrollTop = 0;
      visibleDefinition = results[index]!;
      const replacement = headRow(visibleDefinition, displayedSpellings.get(visibleDefinition));
      head.replaceWith(replacement);
      head = replacement;
      count.textContent = `${index + 1} of ${results.length} results`;
      for (const [position, link] of resultButtons.entries()) {
        if (position === index) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
      optional().onVisibleDefinition?.(visibleDefinition);
      optional().report?.("candidate_selected", { from_index: from, to_index: index, candidate_count: results.length });
    };
    for (const [index, link] of resultButtons.entries()) {
      link.addEventListener("click", () => {
        keepPopupHeight(() => {
          overview.hidden = true;
          body.hidden = false;
          scrollRegion.hidden = false;
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-label", `Show all ${results.length} results`);
          showResult(index);
        });
        window.requestAnimationFrame(updateScrollIndicator);
        toggle.focus();
      });
    }
    navigationRows.push(overview);
  }
  const scrollContent = document.createElement("div");
  scrollContent.append(head, ...metadataRows, ...body.childNodes);
  body.append(scrollContent);
  const scrollRegion = document.createElement("div");
  scrollRegion.className = "sb-scroll-region";
  const track = document.createElement("div");
  track.className = "sb-scroll-track";
  track.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("div");
  thumb.className = "sb-scroll-thumb";
  track.append(thumb);
  scrollRegion.append(body, track);
  const updateScrollIndicator = () => {
    if (!body.isConnected || body.hidden) return;
    const remaining = body.scrollHeight - body.clientHeight;
    track.hidden = resultPanels.length <= 1 && remaining <= 1;
    if (track.hidden) return;
    const segment = body.clientHeight / Math.max(1, resultPanels.length);
    const height = Math.min(segment, Math.max(14, segment * body.clientHeight / Math.max(body.scrollHeight, body.clientHeight)));
    thumb.style.height = `${height}px`;
    const offset = remaining > 0 ? body.scrollTop / remaining * (segment - height) : 0;
    thumb.style.transform = `translateY(${visibleIndex * segment + offset}px)`;
  };
  body.addEventListener("scroll", updateScrollIndicator);
  track.addEventListener("pointerdown", (event) => {
    const rect = track.getBoundingClientRect();
    if (resultPanels.length > 1) {
      keepPopupHeight(() => showResult(Math.max(0, Math.min(resultPanels.length - 1,
        Math.floor((event.clientY - rect.top) / rect.height * resultPanels.length)))));
      updateScrollIndicator();
      return;
    }
    const remaining = body.scrollHeight - body.clientHeight;
    body.scrollTop = Math.max(0, Math.min(remaining, (event.clientY - rect.top) / rect.height * remaining));
  });
  if (typeof ResizeObserver !== "undefined") {
    scrollIndicatorObserver = new ResizeObserver(updateScrollIndicator);
    scrollIndicatorObserver.observe(body);
    scrollIndicatorObserver.observe(scrollContent);
  }
  window.requestAnimationFrame(updateScrollIndicator);
  const rows: Node[] = [...navigationRows, scrollRegion];
  if (canMine()) rows.push(actions(word, def));
  else {
    const offer = studyUnavailable();
    if (offer) rows.push(offer);
  }
  return rows;
}

/** Complete alternative definitions, rather than a row of opaque homograph pills. */
function alternativeResults(
  alternatives: readonly Definition[], names: readonly Definition[], word: HTMLElement,
  selectForm: (definition: Definition, spelling: string) => void,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "sb-alternatives";
  section.setAttribute("aria-label", "Other dictionary matches");

  for (const alternative of alternatives) {
    const result = document.createElement("article");
    result.className = "sb-alternative";
    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "sb-alternative-headword";
    setHeadwordSpelling(heading, alternative.headword, alternative.reading, alternative.furigana);
    heading.lang = "ja";
    heading.setAttribute("aria-label", `Use ${alternative.headword} as this word`);
    if (alternative.entry) heading.addEventListener("click", () => pickCandidate(word, alternative.entry!));
    else heading.disabled = true;
    result.append(heading);
    result.append(sensesList(alternative));
    const forms = formsRow(alternative.forms, (spelling) => {
      setHeadwordSpelling(heading, spelling, alternative.reading);
      heading.setAttribute("aria-label", `Use ${spelling} as this word`);
      selectForm(alternative, spelling);
    });
    if (forms) result.append(forms);
    const kanji = alternative.kanji ? null : kanjiStrip(alternative.headword);
    if (kanji) result.append(kanji);
    section.append(result);
  }
  if (names.length) {
    const result = document.createElement("article");
    result.className = "sb-alternative sb-name-alternative";
    result.append(block("sb-name-group-label", "Names"));
    result.append(nameResults(names, word));
    section.append(result);
  }
  return section;
}

/** Keep every name candidate, while combining repeated readings and meanings. */
function nameResults(names: readonly Definition[], word: HTMLElement): HTMLElement {
  const list = document.createElement("ol");
  list.className = "sb-name-results";
  const byReading = new Map<string, Definition[]>();
  for (const name of names) {
    const reading = name.reading ?? name.headword;
    const group = byReading.get(reading) ?? [];
    group.push(name);
    byReading.set(reading, group);
  }
  for (const [reading, group] of byReading) {
    const row = document.createElement("li");
    row.className = "sb-name-result";
    const spellings = document.createElement("div");
    spellings.className = "sb-name-spellings";
    const seen = new Set<string>();
    for (const name of group) {
      if (seen.has(name.headword)) continue;
      seen.add(name.headword);
      const headword = document.createElement("button");
      headword.type = "button";
      headword.className = "sb-name-headword";
      setHeadwordSpelling(headword, name.headword, name.reading, name.furigana);
      headword.lang = "ja";
      headword.setAttribute("aria-label", `Use ${name.headword} as this word`);
      if (name.entry) headword.addEventListener("click", () => pickCandidate(word, name.entry!));
      else headword.disabled = true;
      spellings.append(headword);
    }
    row.append(spellings);
    const pitch = [...new Map(group.flatMap((name) => name.pitch).map((pattern) =>
      [pattern.downstep, pattern])).values()];
    if (pitch.length) row.append(pitchRows(pitch, reading, group[0]!.offline === true));
    const types = [...new Map(group.flatMap((name) => name.senses.flatMap((sense) => sense.tags))
      .filter((tag) => tag.category === "nameType").map((tag) => [tag.code, tag])).values()];
    if (types.length) {
      const tags = document.createElement("div");
      tags.className = "sb-name-types";
      for (const type of types) tags.append(chip("sb-sense-chip sb-sense-chip-nameType", type.label));
      row.append(tags);
    }
    const meanings = [...new Set(group.flatMap((name) => name.senses.flatMap((sense) =>
      sense.glosses.map((gloss) => gloss.text))))];
    if (meanings.length) row.append(block("sb-name-meanings", meanings.join(" · ")));
    list.append(row);
  }
  return list;
}

// The word's kanji, each opening an in-card lookup where the host supports it.
//
// The pack has carried KANJIDIC all along and the popup could already draw a
// kanji card (`showTarget` takes `kind: "kanji"`, the worker answers it, the
// renderer handles it): nothing ever asked for one. The strip linked out
// instead, so the offline half of the feature was unreachable and the price of
// asking "what is this character" was leaving the page you were reading.
//
// A host without kanji lookup can supply a direct link to the full kanji page.
function kanjiStrip(headword: string): HTMLElement | null {
  const characters = [...new Set([...headword].filter((character) => /\p{Script=Han}/u.test(character)))];
  if (!characters.length) return null;

  const strip = document.createElement("div");
  strip.className = "sb-kanji-strip";
  strip.setAttribute("aria-label", "Kanji details");
  for (const character of characters) {
    const url = optional().kanjiUrl?.(character);
    if (url) {
      const link = document.createElement("a");
      link.className = "sb-btn sb-kanji-button";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = character;
      link.lang = "ja";
      link.title = `Open ${character} on Shirabe`;
      link.setAttribute("aria-label", `Open the kanji ${character} on Shirabe`);
      strip.append(link);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sb-btn sb-kanji-button";
    button.textContent = character;
    button.lang = "ja";
    button.title = `What is ${character}?`;
    button.setAttribute("aria-label", `Look up the kanji ${character}`);
    button.addEventListener("click", () => nestedLookup(character, button.getBoundingClientRect(), currentDepth, "kanji"));
    strip.append(button);
  }
  return strip;
}

// On and kun, apart and labelled, because which one a reading is decides how it
// behaves in a compound. Two rows rather than one list: a learner reads down
// this card looking for one of the two families, never for "the readings".
function kanjiReadings(kanji: KanjiDetail): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "sb-kanji-readings";
  for (const [ label, readings ] of [ [ "On", kanji.on ], [ "Kun", kanji.kun ] ] as const) {
    if (!readings.length) continue;
    const row = document.createElement("div");
    row.className = "sb-kanji-row";
    row.append(chip("sb-kanji-kind", label));
    // Capped, because 生 has eleven kun readings and a card is not a reference
    // page: the full list is one tap away on the kanji's own page.
    for (const reading of readings.slice(0, KANJI_READINGS_SHOWN)) row.append(japanese("sb-kanji-reading", reading));
    if (readings.length > KANJI_READINGS_SHOWN) row.append(chip("sb-kanji-more", `+${readings.length - KANJI_READINGS_SHOWN}`));
    wrap.append(row);
  }
  const meta = [
    kanji.strokes ? `${kanji.strokes} strokes` : null,
    kanji.grade ? `Grade ${kanji.grade}` : null,
  ].filter(Boolean).join(" · ");
  if (meta) wrap.append(block("sb-kanji-meta", meta));
  return wrap;
}

const KANJI_READINGS_SHOWN = 6;

// "Also written": the other spellings of the same word.
//
// Choosing a form changes only the displayed writing of this entry. The
// reading, pitch, meanings, and selected dictionary identity stay in place.
function formsRow(forms: Definition["forms"], onSelect: (spelling: string) => void): HTMLElement | null {
  if (!forms?.length) return null;

  const row = document.createElement("div");
  row.className = "sb-forms";
  row.append(chip("sb-forms-label", "Also written"));
  for (const form of forms.slice(0, FORMS_SHOWN)) {
    const spelling = document.createElement("button");
    spelling.type = "button";
    spelling.className = form.rare ? "sb-word-form sb-word-form-rare" : "sb-word-form";
    spelling.textContent = form.text;
    spelling.lang = "ja";
    spelling.setAttribute("aria-label", `Show ${form.text} as the headword`);
    spelling.setAttribute("aria-pressed", "false");
    spelling.addEventListener("click", () => {
      onSelect(form.text);
      for (const button of row.querySelectorAll<HTMLElement>(".sb-word-form")) {
        button.setAttribute("aria-pressed", String(button === spelling));
      }
    });
    if (form.rare) spelling.title = "Rarely written this way";
    row.append(spelling);
  }
  return row;
}

const FORMS_SHOWN = 8;

// What sits where the Save/Known controls would be. Signed in without Pro is
// the case worth getting right: the reader isn't missing a connection, they're
// missing the subscription, and telling them to "connect" an account they're
// already signed into is both wrong and a dead end. Say what's missing, link it.
//
// A host that cannot save AT ALL gets no line, because there is nothing to
// offer: an Anki card told its signed-in reader "Offline lookup · Connect a Pro
// account to save and review", which was wrong about all three.
//
// Exported for the test that renders it: it's the whole free-reader experience
// of this card, and asserting on the source text instead was never proof.
export function studyUnavailable(): HTMLElement | null {
  if (readOnly || !optional().study?.save) return null;
  const row = document.createElement("div");
  row.className = "sb-study-unavailable";
  if (connected) {
    row.append("Saving to your reviews is part of Pro. ", plansLink());
  } else {
    row.textContent = "Offline lookup · Connect a Pro account to save and review";
  }
  return row;
}

// Headword (links to its shirabe.org page) with furigana. Audio sits next to pitch;
// the shell owns the history arrows and close button in the top-right corner.
function headRow(def: Definition, displayedSpelling = def.headword): HTMLElement {
  const head = document.createElement("div");
  head.className = "sb-popup-head";

  const action = optional().openHeadword;
  const link = document.createElement(action ? "button" : "a");
  link.className = "sb-headword";
  if (action) {
    (link as HTMLButtonElement).type = "button";
    link.addEventListener("click", () => action?.(def, link.dataset.spelling ?? displayedSpelling));
  } else {
    (link as HTMLAnchorElement).href = def.url;
    (link as HTMLAnchorElement).target = "_blank";
    (link as HTMLAnchorElement).rel = "noopener";
  }

  setHeadwordSpelling(link, displayedSpelling, def.reading, displayedSpelling === def.headword ? def.furigana : undefined);
  head.append(link);

  return head;
}

function resultMetadata(def: Definition | null): HTMLElement {
  const row = document.createElement("div");
  row.className = "sb-popup-meta";
  if (!def) return row;
  if (def.inflection?.length) row.append(block("sb-inflection", def.inflection.join(", ")));
  if (!def.name) {
    const badges = badgeRow(def);
    if (badges) row.append(badges);
    if (def.pitch.length && def.reading) row.append(pitchRows(def.pitch, def.reading, def.offline === true));
  }
  return row;
}

function partsRow(definition: Definition): HTMLElement | null {
  const parts = definition.parts?.filter((part) => part.entry) ?? [];
  if (!parts.length) return null;
  const row = document.createElement("div");
  row.className = "sb-parts";
  row.append(chip("sb-parts-label", options.labels?.parts ?? "Parts"));
  for (const part of parts) {
    const open = button(part.text, "sb-part", "", () => nestedLookup(part.lemma, open.getBoundingClientRect(), currentDepth, "word", part.reading, part.text));
    open.lang = "ja";
    row.append(open);
  }
  return row;
}

function lookupLinks(definition: Definition | null, word: HTMLElement): HTMLElement | null {
  const links = optional().lookupLinks?.(definition, word) ?? [];
  if (!links.length) return null;
  const row = document.createElement("div");
  row.className = "sb-lookup-links";
  row.append(chip("sb-lookup-label", options.labels?.lookupIn ?? "Look up in"));
  for (const [index, item] of links.entries()) {
    const link = document.createElement("a");
    link.className = "sb-lookup-link";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.label;
    link.addEventListener("click", () => optional().report?.("lookup_link_opened", { dictionary: item.id, position: index }));
    row.append(link);
  }
  return row;
}

function setHeadwordSpelling(target: HTMLElement, spelling: string, reading: string | null, aligned?: readonly FuriganaSegment[]): void {
  target.replaceChildren();
  target.dataset.spelling = spelling;
  // The same reading belongs to every writing of this entry. Align it over
  // kanji runs and use whole-word ruby only when it cannot be split.
  if (aligned?.length && aligned.map((part) => part.text).join("") === spelling) appendFuriganaSegments(target, aligned);
  else if (reading) appendFurigana(target, spelling, reading);
  else target.textContent = spelling;
}

// The arrows sit in the shell's chrome row rather than in this row, so nothing
// rebuilds them: every move through the history re-checks which ends are live.
function refreshHistoryNav(): void {
  historyBack?.toggleAttribute("disabled", historyIndex <= 0);
  historyForward?.toggleAttribute("disabled", historyIndex >= lookupHistory.length - 1);
}

function recordHistory(target: PopupTarget): void {
  lookupHistory.splice(historyIndex + 1);
  lookupHistory.push(target);
  if (lookupHistory.length > 50) lookupHistory.shift();
  historyIndex = lookupHistory.length - 1;
}

function navigateHistory(delta: number): void {
  const next = historyIndex + delta;
  const target = lookupHistory[next];
  if (!target) return;
  historyIndex = next;
  navigatingHistory = true;
  currentKey = null;
  void showTarget({ ...target, key: `${target.key}:history:${next}` });
}

function nestedLookup(query: string, rect: DOMRect, depth: number, kind: "word" | "kanji" = "word", reading?: string, surface = query): void {
  const text = query.trim().slice(0, 24);
  if (!text) return;
  if (depth >= 5) {
    element().replaceChildren(messageRow("Nested lookup is limited to five levels."));
    return;
  }
  const word = document.createElement("span");
  word.dataset.lemma = text;
  word.dataset.surface = surface;
  word.dataset.state = "none";
  const context: LookupContext = { surface, ...(reading ? { reading: hiraToKata(reading) } : {}) };
  void showTarget({ key: `nested:${kind}:${depth + 1}:${text}:${Date.now()}`, query: text, rect, word, depth: depth + 1, kind, context });
}

function onPopupKeydown(event: KeyboardEvent): void {
  if (!visible() || event.defaultPrevented) return;
  if (event.key === "Escape" || (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key))) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") dismiss(true);
    else navigateHistory(event.key === "ArrowLeft" ? -1 : 1);
  }
  else if (event.composedPath().some((node) => node instanceof HTMLElement && node.matches("input,textarea,select,[contenteditable='true']"))) {
    event.stopPropagation();
  }
  else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const overview = box?.querySelector<HTMLElement>(".sb-results-overview");
    if (overview && !overview.hidden) {
      const rows = [...overview.querySelectorAll<HTMLButtonElement>(".sb-result-link")];
      const focused = rows.findIndex((row) => row === root?.activeElement);
      const current = focused >= 0 ? focused : rows.findIndex((row) => row.getAttribute("aria-current") === "true");
      const next = Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault();
      rows[next]?.focus();
      return;
    }
    const body = box?.querySelector<HTMLElement>(".sb-body");
    if (body && !body.hidden && box?.classList.contains("sb-visible")) {
      event.preventDefault();
      body.scrollBy({ top: event.key === "ArrowDown" ? 80 : -80, behavior: "smooth" });
    }
  }
}
// Common / JLPT / frequency badges, as on the web card. Null when none apply.
function badgeRow(def: Definition): Node | null {
  const items: Array<{ text: string; cls: string; title?: string }> = [];
  if (def.common) items.push({ text: "Common", cls: "sb-badge-common" });
  if (def.jlpt) items.push({ text: def.jlpt, cls: "sb-badge-jlpt" });
  if (def.frequency != null) items.push({ text: `#${def.frequency}`, cls: "sb-badge-freq" });
  if (def.preparedAt !== undefined) {
    const prepared = new Date(def.preparedAt);
    if (Number.isFinite(prepared.valueOf())) items.push({
      text: `Saved for offline use · ${prepared.toLocaleDateString()}`,
      cls: "sb-badge-prepared",
      title: "Saved lookups can appear while online. Refresh them with Desktop preparation.",
    });
  }
  if (!items.length) return null;

  const row = document.createElement("div");
  row.className = "sb-badges";
  for (const b of items) {
    const badge = chip(`sb-badge ${b.cls}`, b.text);
    if (b.title) {
      badge.title = b.title;
      badge.setAttribute("role", "note");
      badge.setAttribute("aria-label", `${b.text}. ${b.title}`);
    }
    row.append(badge);
  }
  return row;
}

// Patterns sit in a row that wraps, like the site's: two short accents fit on
// one line, where a stack spent a graph's height on each. Past this many, the
// rest wait behind a "+N": a word with four accents is rare enough that it must
// not cost every other word the senses being pushed out of the card.
const VISIBLE_PITCH_PATTERNS = 2;

function pitchRows(pitch: Definition["pitch"], reading: string, offline: boolean): Node {
  const wrap = document.createElement("div");
  wrap.className = "sb-pitch";
  const patterns = pitch.map((entry) => pitchPattern(entry, reading, offline));
  // Autoplay speaks the first pattern, which is the reading the card leads with.
  // A word read two ways still shows both buttons; playing every clip at once
  // would be noise, not pronunciation.
  if (!offline && options.audioAutoplay && isR2AudioUrl(pitch[0]?.audioUrl)) {
    void playAudio(pitch[0].audioUrl).then((error) => { if (error) optional().notify?.(error, false); });
  }
  const rest = patterns.slice(VISIBLE_PITCH_PATTERNS);
  wrap.append(...patterns.slice(0, VISIBLE_PITCH_PATTERNS));
  if (rest.length) {
    const more = button(`+${rest.length}`, "sb-pitch-more", "", () => {
      more.replaceWith(...rest);
    });
    more.title = `Show ${rest.length} more accent pattern${rest.length > 1 ? "s" : ""}`;
    more.setAttribute("aria-label", more.title);
    wrap.append(more);
  }
  return wrap;
}

// One compact mora-overline + [downstep], with its own play button. Each clip
// speaks that exact accent, so a word read two ways (箸 / 橋) lets a learner hear
// the same pattern they selected without spending a graph's height on it.
function pitchPattern(entry: Definition["pitch"][number], reading: string, offline: boolean): HTMLElement {
  const item = document.createElement("div");
  item.className = "sb-pitch-item";
  item.setAttribute("aria-label", `Pitch accent: ${reading}, downstep ${entry.downstep}`);
  const local = offline && isSnapshotRecordingFilename(entry.audioUrl) && !!optional().audio;
  if (isR2AudioUrl(entry.audioUrl) || local) {
    const url = entry.audioUrl!;
    const status = document.createElement("span");
    status.className = "sb-audio-status";
    status.setAttribute("role", "status");
    const audio = button("🔊", "sb-audio", "", async () => {
      if (audio.disabled) return;
      const mine = token;
      audio.disabled = true;
      status.textContent = "";
      const error = await playAudio(url);
      if (mine !== token || !visible() || !audio.isConnected) return;
      audio.disabled = false;
      status.textContent = error ?? "";
    });
    audio.title = local ? "Play saved pronunciation · Shirabe · Permitted for Anki deck synchronization and export" : "Play pronunciation";
    audio.setAttribute("aria-label", local ? "Play saved pronunciation" : "Play pronunciation");
    item.append(audio, status);
  }
  item.append(pitchOverline(reading, entry.downstep), chip("sb-pitch-num", `[${entry.downstep}]`));
  return item;
}

// Heiban is L H H…, atamadaka is H L L…, and every other pattern is high from
// the second mora through its downstep. An overline on the high morae plus a
// right edge at the drop conveys that without a tall SVG graph.
const SMALL_KANA = "ゃゅょャュョぁぃぅぇぉァィゥェォ";
function pitchOverline(reading: string, downstep: number): HTMLElement {
  const morae: string[] = [];
  for (const c of reading) {
    if (SMALL_KANA.includes(c) && morae.length) morae[morae.length - 1] += c;
    else morae.push(c);
  }
  const high = (i: number) => (downstep === 0 ? i > 0 : downstep === 1 ? i === 0 : i > 0 && i < downstep);
  const notation = document.createElement("span");
  notation.className = "sb-pitch-notation";
  notation.lang = "ja";
  for (let index = 0; index < morae.length; index += 1) {
    const mora = document.createElement("span");
    mora.className = "sb-pitch-mora";
    if (high(index)) mora.classList.add("sb-pitch-high");
    if (high(index) && !high(index + 1)) mora.classList.add("sb-pitch-drop");
    mora.textContent = morae[index]!;
    notation.append(mora);
  }
  return notation;
}

// Numbered senses: POS and qualifier chips, a gloss row per language, the usage
// note and the cross references: the same anatomy as a web meaning.
// Which meanings this word already has a card for: "all" when a whole-word card
// covers every one of them. Stamped by applyStudyDetails from the word's state.
function coveredSenses(word: HTMLElement): Set<string> | "all" {
  const raw = word.dataset.savedSenses;
  if (raw === "all") return "all";
  return new Set((raw ?? "").split(",").filter(Boolean));
}

function sensesList(def: Definition, pickable = false, covered: Set<string> | "all" = new Set()): Node {
  const senses = def.senses;
  const dictionaries = document.createElement("div");
  dictionaries.className = "sb-dictionaries";
  const runs: Sense[][] = [];
  for (const sense of senses) {
    const previous = runs.at(-1);
    if (previous && previous[0]?.sourceEntry === sense.sourceEntry && previous[0]?.dictionary === sense.dictionary) previous.push(sense);
    else runs.push([sense]);
  }
  for (const run of runs) {
    const section = document.createElement("section");
    section.className = "sb-dictionary";
    const content = document.createElement("div");
    content.className = "sb-dictionary-content";
    const collapsed = run.some((sense) => sense.covered);
    content.hidden = collapsed;
    if (run[0]?.dictionary) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "sb-source sb-dictionary-toggle";
      toggle.setAttribute("aria-expanded", String(!collapsed));
      const arrow = document.createElement("span");
      arrow.className = "sb-dictionary-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "⌄";
      const name = document.createElement("span");
      name.textContent = run[0].dictionary;
      toggle.append(arrow, name);
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(expanded));
        content.hidden = !expanded;
      });
      section.append(toggle);
    }
    const sourceEntries = [...new Set(run.map((sense) => sense.sourceEntry).filter((entry): entry is string => !!entry))];
    for (const entry of sourceEntries) section.append(...sourceHeadwordTagRows(def, entry));
    const list = document.createElement("ol");
    list.className = pickable ? "sb-senses sb-senses-pick" : "sb-senses";
    let previousGroup: string | undefined;
    let previousMarker: string | undefined;
    for (const [index, sense] of run.entries()) {
      const groupKey = groupIdentity(sense);
      const showGroupTags = !!groupKey && groupKey !== previousGroup;
      previousGroup = groupKey;
      const parent = parentMarker(sense.label);
      if (parent && sense.depth && showGroupTags && parent !== previousMarker && sense.groupTags?.length) {
        const heading = document.createElement("li");
        heading.className = "sb-sense-group";
        heading.append(block("sb-sense-marker", ownMarker(parent) ?? parent));
        const groupTags = chipRow(sense.groupTags ?? [], [], "sb-group-chips");
        if (groupTags) heading.append(groupTags);
        list.append(heading);
      }
      list.append(senseItem(def, sense, ownMarker(sense.label) ?? circled(index) ?? String(index + 1),
        pickable, covered, showGroupTags && !parent, index === 0));
      previousMarker = sense.label;
    }
    const hidden = [...list.querySelectorAll<HTMLElement>(".sb-gloss-row[hidden]")];
    if (hidden.length) {
      for (const item of list.querySelectorAll<HTMLElement>(".sb-sense-row")) {
        if (item.querySelector(".sb-gloss-row[hidden]") && !item.querySelector(".sb-gloss-row:not([hidden])")) item.hidden = true;
      }
      const reveal = button(options.labels?.showDefinitions ?? "Show definitions", "sb-reveal-definitions", "", () => {
        for (const item of list.querySelectorAll<HTMLElement>(".sb-sense-row[hidden], .sb-gloss-row[hidden]")) item.hidden = false;
        reveal.remove();
      });
      content.append(reveal);
    }
    content.append(list);
    section.append(content);
    dictionaries.append(section);
  }
  return dictionaries;
}

const SENSE_MARKER = /(?:[㋐-㋾ⓐ-ⓩ]|[①-⑳㉑-㉟㊱-㊿Ⓐ-Ⓩ]|[（(][0-9０-９一二三四五六七八九十]+[）)]|[（(][ア-ンA-Za-zａ-ｚＡ-Ｚ][）)])$/u;
function ownMarker(label?: string): string | undefined { return label?.match(SENSE_MARKER)?.[0] ?? label; }
function parentMarker(label?: string): string | undefined {
  if (!label) return undefined;
  const own = label.match(SENSE_MARKER)?.[0];
  return own ? label.slice(0, -own.length) || undefined : undefined;
}
function circled(index: number): string | undefined {
  const codepoint = index < 20 ? 0x2460 + index : index < 35 ? 0x3251 + index - 20 : index < 50 ? 0x32B1 + index - 35 : undefined;
  return codepoint === undefined ? undefined : String.fromCodePoint(codepoint);
}

function groupIdentity(sense: Sense): string | undefined {
  if (!sense.groupTags?.length) return undefined;
  let parent = sense.label ?? "";
  while (SENSE_MARKER.test(parent)) parent = parent.replace(SENSE_MARKER, "");
  return JSON.stringify({
    source: sense.sourceEntry ?? "",
    parent,
    tags: sense.groupTags.map((tag) => `${tag.category}:${tag.code}:${tag.label}`),
  });
}

function senseItem(def: Definition, sense: Sense, marker: string, pickable: boolean, covered: Set<string> | "all", showGroupTags = false, showEntryTags = false): HTMLElement {
  const li = document.createElement("li");
  li.className = "sb-sense-row";
  if (sense.depth !== undefined) {
    const depth = sense.depth === 1 && !parentMarker(sense.label) ? 0 : sense.depth;
    li.classList.add(`sb-sense-depth-${Math.min(2, Math.max(0, depth))}`);
  }
  const leading = document.createElement("div");
  leading.className = "sb-sense-leading";
  leading.append(block("sb-sense-marker", marker));
  const body = document.createElement("div");
  body.className = "sb-sense-body";
  // A meaning you already have a card for is not on offer: saving it again
  // would land on the card that exists, so the row says so instead of inviting
  // a second click. `pickedSenses` reads only the boxes that are left, so an
  // all-covered word simply has no picker to disagree with.
  const saved = covered === "all" || covered.has(senseRef(sense));
  if (saved) li.classList.add("sb-sense-saved");
  if (pickable && !saved) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !sense.covered;
    box.className = "sb-sense-pick";
    box.dataset.ref = senseRef(sense);
    // Reference the gloss, not a sense number: the picker hides the list's
    // ordinals, so a number here would have no visible counterpart.
    box.setAttribute("aria-label", `Include "${senseText(sense)}" when saving`);
    sensePicks.push(box);
    leading.append(box);
  } else if (pickable) {
    body.append(chip("sb-sense-saved-mark", "Saved"));
  }
  if (showEntryTags && sense.sourceEntry) {
    const entryTags = chipRow(def.entryTagsByEntry?.[sense.sourceEntry] ?? [], [], "sb-entry-chips");
    if (entryTags) body.append(entryTags);
  }
  if (showGroupTags && sense.groupTags?.length) {
    const groupTags = chipRow(sense.groupTags, [], "sb-group-chips");
    if (groupTags) body.append(groupTags);
  }
  const labels = senseChips(sense);
  if (labels) body.append(labels);
  const glosses = glossRows(sense.glosses, def.hiddenGlossLanguages);
  if (glosses) body.append(glosses);
  const usages = usageRows(sense.usages);
  if (usages) body.append(usages);
  for (const note of sense.notes ?? []) body.append(proseBlock("sb-sense-note", note));
  const xrefs = xrefRow(sense.xrefs);
  if (xrefs) body.append(xrefs);
  li.append(leading, body);
  return li;
}

// Chips rather than a run-on line of prose, and coloured by family, because
// "Godan verb" and "Usually kana" are different kinds of claim: one says what the
// word IS and the other how it is USED, and a single grey line made them read as
// one list of adjectives about the word.
// A chip the Legend can explain OPENS, in the card, offline: "Na-adjective" is
// a term a beginner has to look up somewhere, and the somewhere used to be a
// different site. The explanation is the website's own (see common/legend.ts),
// and a code the book has nothing to say about stays a plain chip rather than a
// button that disappoints.
function senseChips(sense: Sense): HTMLElement | null {
  return chipRow([ ...sense.partsOfSpeech, ...sense.tags ], sense.sourceTags ?? [], "sb-sense-chips");
}

function chipRow(labels: SenseChip[], sourceTags: NonNullable<Sense["sourceTags"]>, className: string): HTMLElement | null {
  if (!labels.length && !sourceTags.length) return null;

  const row = document.createElement("div");
  row.className = className;
  const panel = document.createElement("div");
  panel.className = "sb-legend";
  panel.hidden = true;

  for (const label of labels) {
    const kind = label.category === "pos" ? "pos" : label.category === "misc" ? "usage" : null;
    const defaultTerm = label.presentation
      ? label.presentation.explanation
        ? { label: label.presentation.fullLabel, body: label.presentation.explanation,
          ...(label.presentation.example ? { example: label.presentation.example } : {}),
          ...(label.presentation.jp ? { jp: label.presentation.jp } : {}) }
        : null
      : kind ? legendTerm(label.code, kind, tagDisplayLocale ? [tagDisplayLocale === "es" ? "spa" : "eng"] : readerLanguages) : null;
    const term = options.legendForTag ? options.legendForTag(label.code, label.category, defaultTerm) : defaultTerm;
    if (!term) {
      const pill = chip(`sb-sense-chip sb-sense-chip-${label.category}`, label.label);
      // The raw JMdict code, for a reader cross-referencing the dictionary itself.
      if (label.code) pill.title = label.presentation?.fullLabel ? `${label.code}: ${label.presentation.fullLabel}` : label.code;
      row.append(pill);
      continue;
    }

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `sb-sense-chip sb-sense-chip-${label.category} sb-sense-chip-open`;
    pill.textContent = label.label;
    pill.title = `${label.code}: what this means`;
    pill.setAttribute("aria-expanded", "false");
    pill.addEventListener("click", () => {
      // A second tap on the open chip closes it, and any other chip replaces
      // what is in the panel: one explanation at a time, in one place, so the
      // card never grows a stack of them the reader has to dismiss.
      const reopening = pill.getAttribute("aria-expanded") === "true";
      for (const other of row.querySelectorAll("[aria-expanded]")) other.setAttribute("aria-expanded", "false");
      panel.hidden = reopening;
      if (reopening) return;
      pill.setAttribute("aria-expanded", "true");
      panel.replaceChildren(...legendEntry(term));
    });
    row.append(pill);
  }
  for (const sourceTag of sourceTags) {
    const pill = chip("sb-sense-chip sb-source-tag", sourceTag.name);
    if (sourceTag.notes) pill.title = sourceTag.notes;
    row.append(pill);
  }

  const wrap = document.createElement("div");
  wrap.append(row, panel);
  return wrap;
}

function sourceHeadwordTagRows(def: Definition, entry: string): HTMLElement[] {
  const headwords = def.sourceHeadwordsByEntry?.[entry] ?? [];
  return headwords.filter((headword) => headword.tags.length).map((headword) => {
    const row = document.createElement("div");
    row.className = "sb-source-tags";
    const notes = headword.tags.map((tag) => tag.notes).filter(Boolean);
    if (notes.length) row.title = notes.join("; ");
    const label = entry ? `Dictionary tags · ${entry.split(":", 1)[0]}` : "Dictionary tags";
    row.append(chip("sb-source-tags-label", `${label} · ${headword.text} · ${kataToHira(headword.reading)}`));
    for (const sourceTag of headword.tags) {
      const pill = chip("sb-source-tag", sourceTag.name);
      if (sourceTag.notes) pill.title = sourceTag.notes;
      row.append(pill);
    }
    return row;
  });
}

// One Legend entry, as the book prints it: the term (with its Japanese name
// beside it), what it means, and an example when the entry has one.
function legendEntry(term: LegendTerm): Node[] {
  const head = document.createElement("div");
  head.className = "sb-legend-head";
  head.append(chip("sb-legend-term", term.label));
  if (term.jp) head.append(japanese("sb-legend-jp", term.jp));

  const nodes: Node[] = [ head, block("sb-legend-body", term.body) ];
  if (term.example) nodes.push(block("sb-legend-example", term.example));
  return nodes;
}

// What this sense points at, and each target OPENS: a cross reference names a
// word, and a word the reader cannot look up is a word they have to go and type
// somewhere. Grouped by what the link means, because "related to" and "the
// opposite of" are not the same information and a mixed row would say neither.
//
// Antonyms first when a sense has both. An opposite is the sharper fact: it
// tells you what the word is by telling you what it is not, and there are far
// fewer of them.
function xrefRow(xrefs: Sense["xrefs"]): HTMLElement | null {
  if (!xrefs?.length) return null;

  const wrap = document.createElement("div");
  wrap.className = "sb-xrefs";
  for (const [ kind, label ] of [ [ "antonym", "Opposite" ], [ "related", "See also" ] ] as const) {
    const group = xrefs.filter((xref) => xref.kind === kind).slice(0, XREFS_SHOWN);
    if (!group.length) continue;

    const row = document.createElement("div");
    row.className = "sb-xref-row";
    row.append(chip("sb-xref-label", label));
    for (const xref of group) {
      const link = japanese("sb-xref", xref.text);
      if (xref.label) link.append(chip("sb-xref-target-label", xref.label));
      link.tabIndex = -1;
      link.setAttribute("role", "link");
      link.title = xref.reading ? `${xref.text} (${xref.reading})` : `Look up ${xref.text}`;
      const open = () => nestedLookup(xref.text, link.getBoundingClientRect(), currentDepth, "word", xref.reading);
      link.addEventListener("click", open);
      link.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
      });
      row.append(link);
    }
    rove(row.querySelectorAll<HTMLElement>(".sb-xref"));
    wrap.append(row);
  }
  return wrap.children.length ? wrap : null;
}

// A sense with sixteen related words is a list nobody reads to the end, and the
// word's own page is where a reader goes for the whole set.
const XREFS_SHOWN = 6;

// Match Shirabe's meaning layout: synonyms share a line, while Japanese prose
// and publisher sections stay stacked. Tags distinguish languages, not glosses.
function glossRows(rows: Sense["glosses"], hiddenLanguages: readonly GlossLanguage[] = [], tagged = new Set(rows.map((row) => row.lang)).size > 1): HTMLElement | null {
  if (!rows.length) return null;
  const wrap = document.createElement("div");
  wrap.className = "sb-glosses";
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    while (end < rows.length && rows[end]!.lang === rows[start]!.lang) end += 1;
    const group = rows.slice(start, end);
    const line = document.createElement("div");
    line.className = "sb-gloss-row";
    line.hidden = hiddenLanguages.includes(group[0]!.lang);
    line.lang = group[0]!.lang === "spa" ? "es" : group[0]!.lang === "jpn" ? "ja" : "en";
    if (tagged) {
      const tag = chip("sb-gloss-lang", group[0]!.tag);
      tag.lang = "en";
      line.append(tag);
    }
    const items = document.createElement("div");
    items.className = "sb-gloss-items";
    const stacked = group[0]!.lang === "jpn" || group.some((row) => row.title);
    for (const [index, row] of group.entries()) {
      if (index && !stacked) items.append(document.createTextNode("; "));
      const item = document.createElement(stacked ? "div" : "span");
      item.className = "sb-gloss-item";
      if (row.title) item.append(proseBlock("sb-gloss-title", row.title));
      appendJapaneseRuns(item, row.text);
      items.append(item);
    }
    line.append(items);
    wrap.append(line);
    start = end;
  }
  return wrap;
}

// Match the site's japanese_runs helper with text nodes; API prose is never HTML.
const JAPANESE_RUN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}々〆〜ー゛゜、。・「」『』〈〉《》【】〔〕]+/gu;
function appendJapaneseRuns(target: HTMLElement, value: string): void {
  let offset = 0;
  for (const match of value.matchAll(JAPANESE_RUN)) {
    const index = match.index;
    if (index > offset) target.append(document.createTextNode(value.slice(offset, index)));
    const run = document.createElement("span");
    run.className = "sb-japanese-run";
    run.lang = "ja";
    run.textContent = match[0];
    target.append(run);
    offset = index + match[0].length;
  }
  if (offset < value.length) target.append(document.createTextNode(value.slice(offset)));
}

function proseBlock(className: string, value: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  appendJapaneseRuns(element, value);
  return element;
}

function usageRows(usages: Sense["usages"]): HTMLElement | null {
  if (!usages?.length) return null;

  const wrap = document.createElement("div");
  wrap.className = "sb-usages";
  for (const usage of usages) {
    const row = document.createElement("div");
    row.className = "sb-usage";
    row.lang = usage.lang === "spa" ? "es" : usage.lang === "jpn" ? "ja" : "en";
    if (usage.title) row.append(proseBlock("sb-usage-title", usage.title));
    const text = proseBlock("sb-usage-text", usage.text);
    row.append(text);
    wrap.append(row);
  }
  return wrap;
}

// A couple of example sentences with translations, cut into the same words the
// site read the line with (`Example.tokens`, shipped in the pack).
//
// Two things that cut buys, and both are what a reader asks of an example. The
// word being looked up is MARKED, so a line that says it twice, or says it in a
// form the headword does not spell, still points at itself: without that the
// example is a wall of Japanese with the answer hidden in it. And every other
// word is CLICKABLE, because the sentence a word is explained with is exactly
// where the next unknown word turns up, and sending the reader to select it by
// hand is asking them to leave the card to read the card.
//
// A pack built before recipe 10 ships no tokens, and the line renders as the
// plain string it always did.
function examplesBlock(examples: Example[], def: Definition): Node | null {
  if (!examples.length) return null;
  const wrap = document.createElement("div");
  wrap.className = "sb-examples";
  const names = wordSpellings(def);
  for (const ex of examples) {
    const fig = document.createElement("div");
    fig.className = "sb-example";
    const jp = document.createElement("div");
    jp.className = "sb-example-jp";
    jp.lang = "ja";
    if (ex.tokens?.length) jp.append(...ex.tokens.map((token) => exampleToken(token, names)));
    else jp.textContent = ex.japanese;
    // A sentence is ONE tab stop, and the arrows walk it from there. Twenty
    // words in a line means twenty stops otherwise, and two examples put forty
    // between the reader and the Save button: the same roving-tabindex shape the
    // candidate row uses, and for the same reason.
    rove(jp.querySelectorAll<HTMLElement>(".sb-example-token"));
    fig.append(jp);
    if (ex.translation) fig.append(block("sb-example-tr", ex.translation));
    wrap.append(fig);
  }
  const notices = new Map(examples.filter((example) => example.source || example.reference)
    .map((example) => [JSON.stringify([example.source, example.reference]), example]));
  for (const { source, reference } of notices.values()) {
    if (source) wrap.append(block("sb-example-source", source));
    if (reference) {
      const details = document.createElement("details");
      details.className = "sb-example-source-details";
      const summary = document.createElement("summary");
      summary.textContent = "Source details";
      const referenceBlock = sourceReferenceBlock(reference);
      details.append(summary, referenceBlock);
      details.addEventListener("toggle", () => {
        if (details.open) referenceBlock.scrollIntoView({ block: "nearest" });
      });
      for (const type of ["pointerdown", "pointerup", "click", "dblclick", "keyup"]) {
        details.addEventListener(type, (event) => event.stopPropagation());
      }
      details.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" && !(event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key))) event.stopPropagation();
      });
      wrap.append(details);
    }
  }
  return wrap;
}

function sourceReferenceBlock(reference: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "sb-example-reference";
  const lines = reference.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const url = sourceReferenceUrl(line);
    const nextUrl = sourceReferenceUrl(lines[index + 1]);
    if (!url && line.endsWith(":")) {
      wrap.append(block("sb-example-reference-heading", line));
    } else if (!url && nextUrl) {
      wrap.append(sourceReferenceLink(nextUrl, line));
      index++;
    } else if (url) {
      wrap.append(sourceReferenceLink(url, sourceReferenceLabel(url)));
    } else {
      wrap.append(block("sb-example-reference-text", line));
    }
  }
  return wrap;
}

function sourceReferenceUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function sourceReferenceLabel(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  const sentence = (host === "tatoeba.org" || host.endsWith(".tatoeba.org"))
    && /^\/[^/]+\/sentences\/show\/(\d+)\/?$/.exec(url.pathname);
  if (sentence) return `Tatoeba sentence ${sentence[1]}`;
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) return host;
  let tail = parts[parts.length - 1]!;
  try { tail = decodeURIComponent(tail); } catch {}
  return `${host} · ${tail.length > 36 ? `${tail.slice(0, 35)}…` : tail}`;
}

function sourceReferenceLink(url: URL, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "sb-example-reference-link";
  link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  link.title = url.href;
  link.setAttribute("aria-label", `${label}, opens in a new tab`);
  return link;
}

// Every spelling that IS the word on this card, for marking it inside an
// example. The headword and its reading are the word itself; `sourceForm` is the
// surface the reader hovered to get here, which is the one an example is most
// likely to repeat and the one the headword often cannot spell (帰った → 帰る).
function wordSpellings(def: Definition): Set<string> {
  return new Set([ def.headword, def.reading, def.sourceForm ].filter((text): text is string => !!text));
}

// One word of an example. A span rather than a button: a sentence of buttons
// reads as a toolbar to a screen reader, and this is a line of Japanese whose
// words happen to open. The lemma decides the MARK (食べました is 食べる, which no
// comparison of surfaces could tell you) and the surface decides the LOOKUP,
// so clicking a conjugated word shows it conjugated, inflection chain and all.
function exampleToken(token: { surface: string; lemma?: string }, names: Set<string>): Node {
  const marked = names.has(token.surface) || (!!token.lemma && names.has(token.lemma));
  const span = document.createElement("span");
  span.className = marked ? "sb-example-token sb-example-hit" : "sb-example-token";
  span.textContent = token.surface;
  // Punctuation and whitespace are tokens too, and neither is a word to look up.
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(token.surface)) {
    span.className = "sb-example-gap";
    return span;
  }
  span.tabIndex = -1; // `rove` promotes the first one: the line is one tab stop
  span.setAttribute("role", "link");
  span.title = `Look up ${token.surface}`;
  const open = () => nestedLookup(token.surface, span.getBoundingClientRect(), currentDepth);
  span.addEventListener("click", open);
  span.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
  });
  return span;
}

// A row of things that is ONE tab stop, walked with the arrows: the first is
// tabbable, the rest are reachable only from inside it, and focus moves the
// stop along with it. Opening is still a deliberate Enter, so arrowing across a
// sentence reads it rather than firing a lookup per word.
function rove(items: Iterable<HTMLElement>): void {
  const row = [ ...items ];
  const first = row[0];
  if (!first) return;

  first.tabIndex = 0;
  for (const item of row) {
    item.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      const here = row.indexOf(item);
      const next = row[(here + step + row.length) % row.length];
      if (!next) return;
      event.preventDefault();
      event.stopPropagation(); // the card scrolls on Arrow keys; this row is steering
      item.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    });
  }
}

function stopAudio(): void {
  audioGeneration++;
  const audio = activeAudio;
  activeAudio = null;
  if (!audio) return;
  audio.onended = null;
  try {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  } catch {}
}

async function playAudio(url: string): Promise<string | undefined> {
  stopAudio();
  const host = backend(), mine = token, generation = audioGeneration;
  const current = () => mine === token && generation === audioGeneration && visible() && backend() === host;
  try {
    const clip = host.audio ? await host.audio.clip(url) : isR2AudioUrl(url) ? { dataUrl: url } : null;
    if (!current()) return;
    if (!clip) return "Saved pronunciation is unavailable. Sync media or prepare this card again.";
    if ("error" in clip) return clip.error;
    const audio = new Audio(clip.dataUrl);
    activeAudio = audio;
    audio.onended = () => { if (activeAudio === audio) stopAudio(); };
    await audio.play();
  } catch {
    if (current()) {
      stopAudio();
      return "Couldn't play pronunciation audio.";
    }
  }
}

// Mining controls, gated by whether the word is already a card. An untracked word
// (state "none") offers Save + Known; a saved one offers Manage, the same control
// the site's dictionary results carry. Reviewing is not here: see
// REVIEW_IN_READER. Each action recolours every occurrence and surfaces any error
// (e.g. the Pro card cap) inline rather than pretend.
function actions(word: HTMLElement, def: Definition | null = null): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "sb-actions";
  renderActions(word, wrap, def);
  return wrap;
}

// The capture form takes over the action row in place: the card is already the
// right surface, and a second floating panel over a hover card is one too many.
// It holds the popup open while it is up, because typing moves the pointer away.
async function openCardForm(word: HTMLElement, wrap: HTMLElement, def: Definition): Promise<void> {
  pinned = true;
  const close = () => {
    pinned = false;
    renderActions(word, wrap, def);
  };
  wrap.replaceChildren(block("sb-feedback", "Capturing…"));
  // The form itself is the host's: it needs decks, a screenshot of the page and
  // the account. The card owns only the space it goes in and what closing means.
  await backend().study?.renderSaveForm?.(wrap, word, def, {
    onCancel: close,
    onSaved: (message) => {
      pinned = false;
      renderActions(word, wrap, def);
      const note = wrap.querySelector(".sb-feedback");
      if (note) note.textContent = message;
      studyChanged();
    },
  });
}

function renderActions(word: HTMLElement, wrap: HTMLElement, def: Definition | null = null): void {
  wrap.replaceChildren();
  const saved = (word.dataset.state ?? "none") !== "none";

  if (saved && word.dataset.deckNames) {
    const membership = document.createElement("div");
    membership.className = "sb-membership";
    membership.textContent = `Saved in ${word.dataset.deckNames}`;
    wrap.append(membership);
  }

  if (backend().study?.gradingInCard && word.dataset.state === "due") {
    const grades = document.createElement("div");
    grades.className = "sb-grades";
    const intervals = intervalPreviews(word);
    for (const r of [1, 2, 3, 4] as Rating[]) {
      const key = (["again", "hard", "good", "easy"] as const)[r - 1];
      grades.append(button(`${GRADES[r]}${intervals?.[key] ? ` ${intervals[key]}` : ""}`, `sb-grade sb-g${r}`, `${r}`, () => run(word, wrap, () => backend().study!.grade!(word, r))));
    }
    wrap.append(grades);
  }

  const extra = document.createElement("div");
  extra.className = "sb-extra";
  // Open card sits beside Known once the word is saved (exact card when we
  // know cardId, otherwise the card browser search for the lemma).
  if (saved) void cardLink(word).then((link) => { if (link) extra.prepend(link); });
  if (!saved && backend().study?.save) {
    extra.append(button("＋ Save", "sb-btn-save", "S", () => run(word, wrap, () => backend().study!.save!(word, pickedSenses()), def, "word_saved")));
    // Everything you can do with a word hangs off Save; composing the card in
    // full is another item there, not a second button competing with it.
    if (def) extra.append(button("Add details…", "sb-btn-ghost", "D", () => void openCardForm(word, wrap, def)));
  }
  // Only a host that can actually mark a word known offers it.
  if (backend().study?.markKnown) {
    extra.append(button("✓ Known", "sb-btn-known", "K", () => run(word, wrap, () => backend().study!.markKnown!(word), def, "word_known")));
  }
  wrap.append(extra);

  const note = document.createElement("span");
  note.className = "sb-feedback";
  wrap.append(note);
}

function intervalPreviews(word: HTMLElement): { again: string; hard: string; good: string; easy: string } | null {
  try {
    return word.dataset.intervals ? JSON.parse(word.dataset.intervals) : null;
  } catch {
    return null;
  }
}

async function cardLink(word: HTMLElement): Promise<HTMLAnchorElement | null> {
  const study = optional().study;
  const url = await study?.urlForWord(word).catch(() => undefined);
  if (!url) return null;
  const link = document.createElement("a");
  // Same row / weight as Known: solid accent (site primary). "Manage" rather
  // than "Open card" to match the site's dictionary result: one door to the card,
  // its deck, and dropping it, instead of a menu rebuilt inside a hover popup.
  link.className = "sb-btn sb-btn-open";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Manage";
  link.href = url;
  word.dataset.cardUrl = url;
  // If we only know the lemma so far, try to resolve a cardId from the server
  // so the next open lands on the inspector with mined context.
  if (!word.dataset.cardId && word.dataset.lemma) {
    void study?.states([word.dataset.lemma]).then(async (all) => {
      if (!all) return;
      const details = all[word.dataset.lemma!];
      if (!details?.cardId) return;
      study.apply(word, details);
      // Through studyUrlForWord, not cardUrlFor: the details just told us how
      // many cards this word has, and a multi-card word wants the browser.
      const updated = await study.urlForWord(word);
      if (updated) link.href = updated;
      else link.remove();
    }).catch(() => {});
  }
  return link;
}

async function run(word: HTMLElement, wrap: HTMLElement, action: () => Promise<Outcome>, def: Definition | null = null, event?: CardEvent): Promise<void> {
  if (wrap.dataset.running === "true") return;
  wrap.dataset.running = "true";
  for (const control of wrap.querySelectorAll<HTMLButtonElement>("button")) control.disabled = true;
  // A rejection here (the extension context going away mid-click, a failed config
  // read) would otherwise leave `running` set and every button disabled, with no
  // message and no way back short of reopening the card.
  let outcome: Outcome;
  try {
    outcome = await action();
  } catch (error) {
    delete wrap.dataset.running;
    for (const control of wrap.querySelectorAll<HTMLButtonElement>("button")) control.disabled = false;
    const note = wrap.querySelector<HTMLElement>(".sb-feedback");
    if (note) {
      note.textContent = error instanceof Error ? error.message : "That did not go through. Try again.";
      note.classList.add("sb-error");
    }
    optional().report?.("save_refused", { reason: "threw" });
    return;
  }
  const { ok, message, cardUrl, proRequired } = outcome;
  // A refusal is not a failure: needing Pro is an answer, and it is the one
  // worth counting separately from a write that broke.
  if (event) optional().report?.(ok ? event : "save_refused", { reason: proRequired ? "pro_required" : "refused" });
  if (cardUrl) word.dataset.cardUrl = cardUrl;
  delete wrap.dataset.running;
  if (ok) renderActions(word, wrap, def); // state changed → re-render (Save → grade row + link)
  else for (const control of wrap.querySelectorAll<HTMLButtonElement>("button")) control.disabled = false;
  if (ok) studyChanged();
  const note = wrap.querySelector<HTMLElement>(".sb-feedback");
  if (note) {
    note.textContent = message;
    // "Needs Pro" isn't a red failure: it's the one refusal with somewhere to
    // go, so it reads as an offer and carries the link rather than a dead end.
    note.classList.toggle("sb-error", !ok && !proRequired);
    note.classList.toggle("sb-upgrade", !!proRequired);
    if (proRequired) note.append(" ", plansLink());
  }
}

// Opens shirabe.org/pricing in a new tab. `source=extension` so the funnel can
// tell a hovering reader apart from someone who walked in the front door.
function plansLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "sb-plans";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "See plans";
  link.href = "#";
  void optional().pricingUrl?.("extension").then((url) => {
    if (url) link.href = url;
  });
  return link;
}

// Small DOM helpers.
// The other words this span could be, when it names more than one. The reader
// is the only one who knows which they meant: きみ is 君, 黄身 or 黍, and every
// rung the parser could climb has already been climbed. So it offers rather
// than decides, best first, with the current answer marked.
//
// **The pick is what gets carded**, which is the whole point of the row and not
// a side effect: choosing writes `dataset.entry`, and the save posts that as
// `dictionarySlug` + `sourceId`. Without it a save re-derives the word from the
// lemma and can land on the one the reader just rejected.
function candidateRow(word: HTMLElement, def: Definition): HTMLElement | null {
  const candidates = currentTarget?.candidates ?? optional().candidatesFor?.(word) ?? [];
  if (candidates.length < 2) return null;

  const row = document.createElement("div");
  row.className = "sb-candidates";
  // One of several, exactly one selected: that is a radiogroup, and saying so
  // buys arrow-key movement and a SINGLE tab stop instead of one per candidate.
  row.role = "radiogroup";
  row.setAttribute("aria-label", "Other words this could be");
  drawChips(row, candidates, def, word, false);
  return row;
}

// A cap on the ROW, never on the answer: きみ resolves to a dozen, six of them
// JMnedict entries all glossing "Kimi", and a dozen chips wrap into four lines
// and push the senses off the bottom of the card. The rest are one click away.
const PICKER_VISIBLE = 6;

function drawChips(
  row: HTMLElement,
  candidates: TokenCandidate[],
  def: Definition,
  word: HTMLElement,
  expanded: boolean,
): void {
  row.replaceChildren();
  const picked = candidates.findIndex((candidate) => candidate.entry === def.entry);
  const shown = visibleChips(candidates, picked, expanded);

  for (const { candidate, index } of shown) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "sb-candidate";
    pill.role = "radio";
    pill.dataset.entry = candidate.entry;
    pill.dataset.index = String(index);

    pill.append(japanese("sb-candidate-word", candidate.headword));
    if (candidate.reading && candidate.reading !== candidate.headword) {
      pill.append(japanese("sb-candidate-reading", candidate.reading));
    }
    // Says WHY six near-identical chips are here: they are people, not readings
    // of the word that was tapped.
    if (isNameCandidate(candidate)) {
      pill.classList.add("sb-candidate-name");
      pill.append(chip("sb-candidate-kind", "name"));
    }

    const on = index === picked;
    pill.classList.toggle("sb-candidate-on", on);
    pill.setAttribute("aria-checked", String(on));
    // Roving tabindex: the group is one stop, arrows move inside it.
    pill.tabIndex = on ? 0 : -1;
    pill.addEventListener("click", () => pickCandidate(word, candidate.entry));
    pill.addEventListener("keydown", (event) => onChipKeydown(event, row, word));
    row.append(pill);
  }

  const hidden = expanded ? 0 : Math.max(0, candidates.length - shown.length);
  if (hidden > 0) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "sb-candidate sb-candidate-more";
    more.textContent = `+${hidden}`;
    more.setAttribute("aria-label", `Show ${hidden} more`);
    more.addEventListener("click", () => drawChips(row, candidates, def, word, true));
    row.append(more);
  }
}

// The index travels WITH the candidate, which is why this is not a `slice` at
// the call site: once the row is trimmed, the loop index and the position in the
// full list stop agreeing, and a pick addresses the full list. A picked
// candidate is always in the row, or expanding and collapsing again would leave
// the card showing a word whose chip had gone.
function visibleChips(
  candidates: TokenCandidate[],
  picked: number,
  expanded: boolean,
): { candidate: TokenCandidate; index: number }[] {
  const all = candidates.map((candidate, index) => ({ candidate, index }));
  if (expanded || all.length <= PICKER_VISIBLE) return all;

  const head = all.slice(0, PICKER_VISIBLE);
  if (!head.some((chip) => chip.index === picked)) {
    const chosen = all[picked];
    if (chosen) head[head.length - 1] = chosen;
  }
  return head;
}

// A JMnedict entry is a person or a place, not another reading of the word.
// The handle already says so ("jmnedict:5000000"), so nothing has to be added
// to the pack to tell them apart.
function isNameCandidate(candidate: TokenCandidate): boolean {
  return candidate.entry.startsWith("jmnedict:");
}

function onChipKeydown(event: KeyboardEvent, row: HTMLElement, word: HTMLElement): void {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;

  const chips = [...row.querySelectorAll<HTMLElement>(".sb-candidate:not(.sb-candidate-more)")];
  const here = chips.indexOf(event.currentTarget as HTMLElement);
  const next = chips[(here + step + chips.length) % chips.length];
  if (!next?.dataset.entry) return;

  event.preventDefault();
  next.focus();
  pickCandidate(word, next.dataset.entry);
}

// Japanese inside a chip, marked as such so the browser picks a JP font and a
// screen reader the right voice: the surrounding page may declare anything.
function japanese(className: string, text: string): HTMLElement {
  const el = chip(className, text);
  el.lang = "ja";
  return el;
}

// Show the word the reader picked, by handle. Not a fresh lookup: they have
// settled the question this popup exists to ask, and re-deriving it would hand
// back whatever the ladder prefers, which is the word they just rejected.
function pickCandidate(word: HTMLElement, entry: string): void {
  const target = currentTarget;
  if (!target || target.pick === entry) return;

  const candidates = target.candidates ?? [];
  optional().report?.("candidate_selected", {
    from_index: Math.max(0, candidates.findIndex((candidate) => candidate.entry === target.pick)),
    to_index: candidates.findIndex((candidate) => candidate.entry === entry),
    candidate_count: candidates.length,
  });
  void showTarget({ ...target, key: `pick:${entry}`, query: target.context?.surface ?? target.query, pick: entry, word });
}

function block(className: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return el;
}

function chip(className: string, text: string): HTMLElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function button(label: string, className: string, hint: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = `sb-btn ${className}`;
  const text = document.createElement("span");
  text.textContent = label;
  btn.append(text);
  if (hint) {
    btn.title = `Shortcut: ${hint}`;
    const kbd = document.createElement("kbd");
    kbd.textContent = hint;
    btn.append(kbd);
  }
  btn.addEventListener("click", onClick);
  return btn;
}

const CSS = `
${AUTHORING_CSS}
${ACCOUNT_CSS}
:host { all: initial; }
:host {
  position: absolute;
  pointer-events: none;
  top: 0;
  left: 0;
  z-index: 2147483647;
  display: block;
  /* Isolated from the host page: follow the OS theme so the lookup card is
     readable on dark-mode machines even when the site under the cursor is light.

     THREE BLOCKS RATHER THAN light-dark() PAIRS, and that is not a preference.
     Anki 25.09 draws cards in Qt WebEngine 6.9, which is Chromium 122, and
     light-dark() shipped in Chromium 123. Every one of these declarations was
     invalid there, so every colour that read one fell back to inherit and the
     card drew in whatever colour the page happened to be: it looked exactly
     like the stylesheet had failed to load. A host we do not choose is a
     browser version we do not choose. */
  color-scheme: light dark;
  --sb-surface: #ffffff;
  --sb-surface-muted: #f3f4f6;
  --sb-surface-hover: #e5e7eb;
  --sb-ink: #111827;
  --sb-ink-body: #1f2937;
  --sb-ink-muted: #4b5563;
  --sb-ink-subtle: #6b7280;
  --sb-ink-faint: #9ca3af;
  --sb-outline: #e5e7eb;
  --sb-outline-strong: #d1d5db;
  --sb-divider: #f3f4f6;
  --sb-accent: #0369a1;
  --sb-accent-hover: #025a83;
  --sb-accent-tint: #e2f1fa;
  --sb-accent-tint-strong: #cfe7f6;
  --sb-accent-border: #7eb8d9;
  --sb-source: #0369a1;
  --sb-result-word-ink: #345b91;
  --sb-result-word-bg: #e1eaf4;
  --sb-result-name-ink: #914265;
  --sb-result-name-bg: #f6e7ee;
  --sb-result-article-ink: #2f6154;
  --sb-result-article-bg: #e4efec;
  --sb-field: #2563eb;
  --sb-dialect: #7c3aed;
  --sb-common-bg: #dcfce7;
  --sb-common-fg: #166534;
  --sb-jlpt-bg: #e2f1fa;
  --sb-jlpt-fg: #025a83;
  --sb-error: #b91c1c;
  --sb-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  --sb-known-btn: #6b7280;
  --sb-known-btn-hover: #4b5563;
  --sb-on-solid: #ffffff;
  /* A neutral fill behind a sense chip. This was a percentage of the chip's own
     colour (color-mix, Chromium 111); the colour that carried the meaning was
     always the text, so the fill neutralises without losing the coding. */
  --sb-chip-bg: rgba(17, 24, 39, 0.06);
  --sb-chip-bg-strong: rgba(17, 24, 39, 0.12);
  --sb-chip-border: rgba(17, 24, 39, 0.18);
}
/* What the OS asks for, unless the reader has overridden it to light. */
@media (prefers-color-scheme: dark) {
  :host(:not([data-sb-theme="light"])) {
    --sb-surface: #252525;
    --sb-surface-muted: #303030;
    --sb-surface-hover: #3a3a3a;
    --sb-ink: #f0eeee;
    --sb-ink-body: #e4e0e0;
    --sb-ink-muted: #b4aeae;
    --sb-ink-subtle: #928b8b;
    --sb-ink-faint: #777171;
    --sb-outline: rgba(255, 244, 244, 0.14);
    --sb-outline-strong: rgba(255, 244, 244, 0.24);
    --sb-divider: rgba(255, 244, 244, 0.13);
    --sb-accent: #df9aa1;
    --sb-accent-hover: #f0b4ba;
    --sb-accent-tint: #452e31;
    --sb-accent-tint-strong: #5a383d;
    --sb-accent-border: #a8666e;
    --sb-source: #df9aa1;
    --sb-result-word-ink: #aec8ee;
    --sb-result-word-bg: #374153;
    --sb-result-name-ink: #e7a1bc;
    --sb-result-name-bg: #433039;
    --sb-result-article-ink: #9ccabc;
    --sb-result-article-bg: #304039;
    --sb-field: #d7a0bf;
    --sb-dialect: #c4a5df;
    --sb-common-bg: #203b28;
    --sb-common-fg: #a8d9af;
    --sb-jlpt-bg: #393536;
    --sb-jlpt-fg: #c9c1c1;
    --sb-error: #ff9999;
    --sb-shadow: 0 18px 50px rgba(0, 0, 0, 0.58);
    --sb-known-btn: #595454;
    --sb-known-btn-hover: #6d6666;
    --sb-chip-bg: rgba(240, 224, 224, 0.08);
    --sb-chip-bg-strong: rgba(240, 224, 224, 0.15);
    --sb-chip-border: rgba(240, 224, 224, 0.25);
  }
}
/* The reader's own choice, which wins over the OS in both directions. */
:host([data-sb-theme="light"]) { color-scheme: light; }
:host([data-sb-theme="dark"]) {
  color-scheme: dark;
  --sb-surface: #252525;
  --sb-surface-muted: #303030;
  --sb-surface-hover: #3a3a3a;
  --sb-ink: #f0eeee;
  --sb-ink-body: #e4e0e0;
  --sb-ink-muted: #b4aeae;
  --sb-ink-subtle: #928b8b;
  --sb-ink-faint: #777171;
  --sb-outline: rgba(255, 244, 244, 0.14);
  --sb-outline-strong: rgba(255, 244, 244, 0.24);
  --sb-divider: rgba(255, 244, 244, 0.13);
  --sb-accent: #df9aa1;
  --sb-accent-hover: #f0b4ba;
  --sb-accent-tint: #452e31;
  --sb-accent-tint-strong: #5a383d;
  --sb-accent-border: #a8666e;
  --sb-result-word-ink: #aec8ee;
  --sb-result-word-bg: #374153;
  --sb-result-name-ink: #e7a1bc;
  --sb-result-name-bg: #433039;
  --sb-result-article-ink: #9ccabc;
  --sb-result-article-bg: #304039;
  --sb-source: #df9aa1;
  --sb-field: #d7a0bf;
  --sb-dialect: #c4a5df;
  --sb-common-bg: #203b28;
  --sb-common-fg: #a8d9af;
  --sb-jlpt-bg: #393536;
  --sb-jlpt-fg: #c9c1c1;
  --sb-error: #ff9999;
  --sb-shadow: 0 18px 50px rgba(0, 0, 0, 0.58);
  --sb-known-btn: #595454;
  --sb-known-btn-hover: #6d6666;
  --sb-chip-bg: rgba(240, 224, 224, 0.08);
  --sb-chip-bg-strong: rgba(240, 224, 224, 0.15);
  --sb-chip-border: rgba(240, 224, 224, 0.25);
}

.sb-popup {
  pointer-events: auto;
  /* Width of the top-right chrome row (3 × 24px + 2 × 2px gap), so the first row
     of any content state clears back, forward, and close in one number. */
  --sb-chrome-gutter: 76px;
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* Wider than it was (360px): the picker put a second row of chips above the
     senses on anything with three candidates, and a two-line gloss is the normal
     case rather than the long one. Still capped to the viewport so a narrow
     phone window is not pushed sideways. */
  width: var(--sb-popup-width, min(480px, calc(100vw - 24px)));
  max-height: var(--sb-popup-max-height, min(70vh, 620px));
  padding: 16px 18px;
  background: var(--sb-surface);
  color: var(--sb-ink-body);
  border: 1px solid var(--sb-outline);
  border-radius: 18px;
  box-shadow: var(--sb-shadow);
  font-family: system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
  font-size: 15px;
  line-height: 1.5;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.sb-popup.sb-visible { opacity: 1; visibility: visible; transform: translateY(0); }

.sb-popup-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}
.sb-popup-footer { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; min-width: 0; min-height: 24px; margin-top: 6px; }
.sb-popup-footer:empty { display: none; }

/* Back, forward, close: one row in the top-right, outside content swaps. Its
   width is the gutter every first content row keeps clear. */
.sb-chrome {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
}
.sb-btn.sb-chrome-button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sb-ink-muted);
  font: 600 14px/1 system-ui, sans-serif;
}
.sb-btn.sb-chrome-button:hover:not(:disabled) { background: var(--sb-surface-muted); color: var(--sb-ink); }
.sb-btn.sb-chrome-button:disabled { cursor: default; opacity: .35; }
.sb-btn.sb-close { font-size: 18px; }

.sb-popup-head {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-right: var(--sb-chrome-gutter);
  font-size: 28px;
  font-weight: 700;
}
.sb-headword { padding: 0; border: 0; background: transparent; color: var(--sb-ink); font: inherit; text-align: start; text-decoration: none; cursor: pointer; }
.sb-headword:hover { color: var(--sb-accent); text-decoration: underline; }
.sb-headword ruby { ruby-align: center; }
.sb-headword ruby rt { font-size: 0.5em; font-weight: 600; color: var(--sb-accent); user-select: none; }
.sb-popup-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 9px; margin: 3px 0 7px; }
.sb-popup-meta[hidden], .sb-popup-meta:empty { display: none; }
.sb-popup-meta > :is(.sb-inflection, .sb-badges, .sb-pitch) { margin: 0; }
@media (max-height: 450px) {
  .sb-popup { padding: 12px 16px; }
  .sb-popup-meta { margin-bottom: 3px; }
  .sb-popup-footer { margin-top: 4px; }
}
.sb-popup-message { color: var(--sb-ink-subtle); padding-right: var(--sb-chrome-gutter); }
.sb-popup-message.sb-body { padding-right: 0; }
.sb-loading-body { display: flex; align-items: center; gap: 9px; min-height: 72px; color: var(--sb-ink-subtle); font-size: 13px; }
.sb-loading-spinner { width: 15px; height: 15px; border: 2px solid var(--sb-outline-strong); border-top-color: var(--sb-accent); border-radius: 50%; animation: sb-loading-spin 0.8s linear infinite; }
@keyframes sb-loading-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .sb-loading-spinner { animation: none; } }

/* Signing in from the card (link.ts). The link is a real target rather than a
   line of text: on a phone this is what the reader taps to leave for a browser,
   and it has to be big enough to hit. */
.sb-link-prompt { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4em; }
.sb-link-manual { width: 100%; min-width: 0; }
.sb-link-manual summary { cursor: pointer; box-sizing: border-box; min-height: 44px; padding: 10px 4px; }
.sb-link-manual summary:hover { background: var(--sb-accent-tint); }
.sb-link-manual label { display: grid; gap: 4px; margin: 8px 0; }
.sb-link-manual textarea { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; padding: 8px; border: 1px solid var(--sb-outline-strong); border-radius: 8px; background: var(--sb-surface-muted); color: var(--sb-ink); font: inherit; user-select: text; }
.sb-link-manual :is(summary, textarea):focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
.sb-link-open {
  display: inline-block;
  padding: 0.35em 0.8em;
  border-radius: 999px;
  background: var(--sb-accent);
  color: var(--sb-on-solid);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.sb-link-open:hover { background: var(--sb-accent-hover); }
.sb-link-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.05em;
  letter-spacing: 0.08em;
  color: var(--sb-ink);
  /* The reader may have to type this on another device, so it is selectable
     even where the card suppresses selection elsewhere. */
  user-select: text;
}
.sb-inflection { margin-bottom: 7px; color: var(--sb-ink-subtle); font-size: 12px; }
.sb-parts, .sb-lookup-links { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 9px; margin: 8px 0; font-size: 12px; }
.sb-parts-label, .sb-lookup-label { color: var(--sb-ink-muted); }
.sb-btn.sb-part { padding: 2px 5px; border: 1px solid var(--sb-outline); border-radius: 5px; background: var(--sb-surface-muted); color: var(--sb-ink); font: inherit; cursor: pointer; }
.sb-btn.sb-part:hover { background: var(--sb-accent-tint); color: var(--sb-accent); }
.sb-lookup-link { color: var(--sb-accent); text-decoration: none; cursor: pointer; }
.sb-lookup-link:hover { color: var(--sb-accent-hover); text-decoration: underline; }
.sb-btn.sb-reveal-definitions { margin: 6px 0; padding: 4px 0; border: 0; background: transparent; color: var(--sb-accent); font: inherit; font-size: 12px; cursor: pointer; }
.sb-btn.sb-reveal-definitions:hover { color: var(--sb-accent-hover); text-decoration: underline; }
.sb-sense-row[hidden], .sb-gloss-row[hidden] { display: none !important; }

/* The candidate picker: every word this span can name, the current one marked.
   A row of chips rather than a list, because it is a choice between short
   labels and it sits above the definition it changes. Pinned (flex: 0 0 auto)
   so a long list never eats the senses' share of a capped-height card, and
   allowed to wrap, because a horizontal scroller hides the candidates a reader
   most needs to see. */
.sb-candidates { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }

/* Quiet until picked. An unpicked chip is an alternative rather than an action,
   so it must not compete with the headword, but it still has to look pressable,
   which a bare word does not. */
.sb-candidate {
  font: inherit;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  line-height: 1.4;
  padding: 2px 7px;
  color: var(--sb-ink-muted);
  background: transparent;
  border: 1px solid var(--sb-outline);
  border-radius: 999px;
  cursor: pointer;
  transition: background-color .12s ease, color .12s ease, border-color .12s ease;
}
.sb-candidate:hover { background: var(--sb-surface-muted); color: var(--sb-ink); }
.sb-candidate-word { font-size: 13px; font-weight: 600; }
.sb-candidate-reading { font-size: 11px; opacity: .75; }

/* The one the card is showing. A tint rather than a brighter neutral, so the
   selected chip and the open word in the page say "this is what you are looking
   at" the same way. */
.sb-candidate-on {
  color: var(--sb-accent);
  background: var(--sb-accent-tint);
  border-color: transparent;
}
.sb-candidate:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }

/* A name, not a reading of the word that was tapped: a reason to SKIP the chip
   rather than something to read, so it is quiet and the chip is dimmed. */
.sb-candidate-kind {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: .04em;
  opacity: .55;
}
.sb-candidate-name:not(.sb-candidate-on) { opacity: .72; }

/* The rest of the ranked list, one click away. A chip because it sits in the row
   and takes the same click, but with no headword to show. */
.sb-candidate-more { font-size: 12px; color: var(--sb-ink-subtle); }
.sb-btn.sb-results-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  width: auto;
  margin-left: auto;
  padding: 4px 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--sb-accent);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
}
.sb-results-toggle::after { content: ""; width: 6px; height: 6px; margin: 0 3px 3px 0; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
.sb-results-toggle[aria-expanded="true"]::after { margin: 3px 3px 0 0; transform: rotate(225deg); }
.sb-results-toggle:hover { color: var(--sb-accent-hover); }
.sb-results-overview { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.sb-results-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.sb-result-link {
  display: grid;
  grid-template-columns: 15px minmax(0, 1fr);
  gap: 4px;
  width: 100%;
  padding: 8px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sb-ink);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sb-result-link:hover, .sb-result-link[aria-current="true"] { background: var(--sb-accent-tint); }
.sb-result-link:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: -2px; }
.sb-result-number { color: var(--sb-accent); font-size: 13px; font-weight: 700; }
.sb-result-details { min-width: 0; }
.sb-result-heading { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.sb-result-title, .sb-result-reading, .sb-result-preview { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-result-title { font-size: 17px; font-weight: 700; line-height: 1.3; }
.sb-result-reading { min-width: 0; color: var(--sb-ink-subtle); font-size: 12px; }
.sb-result-summary { display: flex; align-items: baseline; gap: 6px; min-width: 0; margin-top: 3px; }
.sb-result-kind { flex: none; padding: 1px 6px; border-radius: 999px; background: var(--sb-result-word-bg); color: var(--sb-result-word-ink); font-size: 11px; font-weight: 600; line-height: 1.4; }
.sb-result-kind-name { background: var(--sb-result-name-bg); color: var(--sb-result-name-ink); }
.sb-result-kind-encyclopedia { background: var(--sb-result-article-bg); color: var(--sb-result-article-ink); }
.sb-result-preview { min-width: 0; color: var(--sb-ink-subtle); font-size: 12px; }
.sb-alternatives { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--sb-divider); }
.sb-alternative { padding: 10px 0; border-top: 1px solid var(--sb-divider); }
.sb-body > div > .sb-alternative { padding-top: 0; border-top: 0; }
.sb-alternative:first-of-type { border-top: 0; }
.sb-alternative-headword { display: inline-block; margin: 0 0 5px; padding: 0; border: 0; background: transparent; color: var(--sb-ink); font-family: inherit; font-size: 24px; font-weight: 700; line-height: 1.35; cursor: pointer; text-align: start; }
.sb-alternative-headword:hover:not(:disabled) { color: var(--sb-accent); }
.sb-alternative-headword:disabled { cursor: default; }
.sb-alternative-headword:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 3px; border-radius: 3px; }
.sb-alternative-headword ruby rt, .sb-name-headword ruby rt { font-size: 0.55em; font-weight: 600; color: var(--sb-accent); user-select: none; }
.sb-name-group-label { margin-bottom: 6px; color: var(--sb-ink-muted); font-size: 12px; font-weight: 700; }
.sb-name-results { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.sb-name-result { padding: 8px 0; border-bottom: 1px solid var(--sb-divider); }
.sb-name-result:last-child { border-bottom: 0; }
.sb-name-spellings { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.sb-name-headword { padding: 0; border: 0; background: transparent; color: var(--sb-ink); font: inherit; font-size: 18px; font-weight: 700; cursor: pointer; }
.sb-name-headword:hover:not(:disabled) { color: var(--sb-accent); }
.sb-name-headword:disabled { cursor: default; }
.sb-name-headword:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
.sb-name-result .sb-pitch { margin: 3px 0 5px; }
.sb-name-types { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
.sb-name-meanings { color: var(--sb-ink); font-size: var(--sb-definition-size, 14px); line-height: 1.5; }
.sb-study-unavailable { flex: 0 0 auto; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--sb-outline); color: var(--sb-ink-subtle); font-size: 11px; }
.sb-study-unavailable .sb-plans { font-size: 11px; }

.sb-scroll-region { position: relative; display: flex; flex: 1 1 auto; min-height: 0; }
.sb-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 10px; scrollbar-width: none; }
.sb-body::-webkit-scrollbar { display: none; }
.sb-scroll-track { position: absolute; top: 0; right: 0; bottom: 0; width: 5px; border-radius: 999px; background: var(--sb-surface-muted); cursor: pointer; }
.sb-scroll-thumb { position: absolute; top: 0; right: 0; width: 5px; border-radius: 999px; background: var(--sb-outline-strong); }
.sb-results-overview { scrollbar-width: thin; scrollbar-color: var(--sb-outline-strong) transparent; }
.sb-results-overview::-webkit-scrollbar { width: 7px; }
.sb-results-overview::-webkit-scrollbar-thumb { border-radius: 999px; background: var(--sb-outline-strong); }
.sb-results-overview::-webkit-scrollbar-track { background: transparent; }
.sb-body[hidden], .sb-results-overview[hidden], .sb-scroll-region[hidden], .sb-scroll-track[hidden] { display: none; }

.sb-btn.sb-audio {
  flex: 0 0 auto;
  align-self: center;
  color: inherit;
  background: transparent;
  padding: 4px 6px;
  border-radius: 8px;
  font-size: 15px;
  line-height: 1;
}
.sb-btn.sb-audio:hover { background: var(--sb-surface-muted); }

.sb-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.sb-badge {
  font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 999px;
  letter-spacing: 0.02em;
}
.sb-badge-common { background: var(--sb-common-bg); color: var(--sb-common-fg); }
.sb-badge-jlpt { background: var(--sb-jlpt-bg); color: var(--sb-jlpt-fg); }
.sb-badge-freq, .sb-badge-prepared { background: var(--sb-surface-muted); color: var(--sb-ink-muted); font-variant-numeric: tabular-nums; }

.sb-pitch { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-bottom: 8px; }
.sb-pitch-item { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; max-width: 100%; }
.sb-audio-status { order: 1; flex-basis: 100%; color: var(--sb-error); font-size: 12px; }
.sb-audio-status:empty { display: none; }
.sb-btn.sb-audio:disabled { cursor: wait; opacity: .5; }
.sb-btn.sb-pitch-more {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--sb-surface-muted);
  color: var(--sb-ink-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.sb-btn.sb-pitch-more:hover { background: var(--sb-surface-hover); color: var(--sb-ink); }
.sb-pitch-notation { display: inline-flex; align-items: baseline; color: var(--sb-ink); font-size: 14px; line-height: 1.35; }
.sb-pitch-mora { box-sizing: border-box; padding: 1px 0; border-top: 2px solid transparent; color: var(--sb-ink); }
.sb-pitch-mora.sb-pitch-high { border-top-color: var(--sb-accent); }
.sb-pitch-mora.sb-pitch-drop { border-right: 2px solid var(--sb-accent); }
.sb-pitch-num { font-size: 12px; font-weight: 600; color: var(--sb-ink-faint); font-variant-numeric: tabular-nums; }
.sb-kanji-strip { display: flex; gap: 5px; margin: 8px 0; }
.sb-btn.sb-kanji-button {
  cursor: pointer; min-width: 30px; border: 1px solid var(--sb-outline-strong); border-radius: 7px;
  padding: 4px 7px; background: var(--sb-surface); color: var(--sb-accent); font-size: 17px;
  text-decoration: none;
}
.sb-btn.sb-kanji-button:hover { background: var(--sb-accent-tint); border-color: var(--sb-accent-border); }
/* On and kun as labelled rows. The kind sits in a fixed-width chip so the two
   rows' readings line up under each other and the eye can run down one family. */
.sb-kanji-readings { margin: 6px 0; }
.sb-kanji-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px; margin-top: 3px; }
.sb-kanji-kind {
  min-width: 2.2em;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--sb-ink-muted);
}
.sb-kanji-reading { font-size: 13px; color: var(--sb-ink); }
.sb-kanji-more { font-size: 11px; color: var(--sb-ink-faint); }
.sb-kanji-meta { margin-top: 4px; font-size: 11px; color: var(--sb-ink-muted); }
/* "Also written". The label reads as a caption rather than a chip: it names the
   row, and boxing it would make it look like one of the spellings. */
.sb-forms {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-top: 8px;
}
.sb-forms-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--sb-ink-muted);
}
.sb-word-form { padding: 0; border: 0; background: transparent; font: inherit; font-size: 14px; color: var(--sb-ink); cursor: pointer; }
.sb-word-form:hover { color: var(--sb-accent); text-decoration: underline; }
.sb-word-form:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; border-radius: 2px; }
/* Rare spellings are the ones a reader cannot place, so they are shown: dimmed
   is the dictionary's judgement of them, not a way of hiding them. */
.sb-word-form-rare { color: var(--sb-ink-faint); }
.sb-word-form[aria-pressed="true"] { color: var(--sb-accent); font-weight: 600; }
.sb-source-tags { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; margin-top: 5px; }
.sb-source-tags-label { font-size: 10px; font-weight: 600; color: var(--sb-ink-muted); }
.sb-source-tag { color: var(--sb-ink-muted); }

.sb-dictionaries { display: flex; flex-direction: column; gap: 12px; }
.sb-dictionary-toggle {
  display: inline-flex; align-items: center; gap: 5px; margin-left: -4px;
  padding: 3px 4px; border: 0; border-radius: 5px; background: transparent;
  font: inherit; font-size: 12px; font-weight: 600; color: var(--sb-ink-muted); cursor: pointer;
}
.sb-dictionary-toggle:hover { color: var(--sb-ink); background: var(--sb-surface-muted); }
.sb-dictionary-toggle:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
.sb-dictionary-arrow { display: inline-block; width: 12px; transition: transform 120ms ease; }
.sb-dictionary-toggle[aria-expanded="false"] .sb-dictionary-arrow { transform: rotate(-90deg); }
.sb-dictionary-content[hidden] { display: none; }
.sb-senses { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 0; padding: 0; list-style: none; font-size: var(--sb-definition-size, 14px); }
.sb-sense-row, .sb-sense-group { display: grid; grid-template-columns: minmax(16px, max-content) minmax(0, 1fr); align-items: baseline; gap: 6px; }
.sb-sense-leading, .sb-sense-group > .sb-sense-marker { color: var(--sb-ink-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.sb-sense-body { min-width: 0; }
.sb-sense-depth-1 { margin-left: 19px; }
.sb-sense-depth-2 { margin-left: 38px; }
.sb-sense-group { margin-left: 19px; }
.sb-senses-pick .sb-sense-leading { display: flex; gap: 5px; align-items: baseline; }
.sb-sense-pick { margin: 0; flex: none; cursor: pointer; accent-color: var(--sb-accent); }
/* A meaning already saved: still readable, visibly not on offer. The chip sits
   where its checkbox would, so the rows stay in one column. */
.sb-sense-saved { color: var(--sb-ink-subtle); }
.sb-sense-saved-mark {
  flex: none;
  margin-top: 1px;
  border-radius: 999px;
  padding: 1px 6px;
  background: var(--sb-surface-muted);
  color: var(--sb-ink-muted);
  font-size: 10px;
  font-weight: 600;
}
.sb-source { font-size: 12px; font-weight: 600; color: var(--sb-source); }
/* Chips rather than a run-on line of prose. JMdict's own labels repeat
   themselves ("noun (common) (futsuumeishi)"), so the chip prints the short form
   keyed off the code and keeps the code itself in its tooltip. Coloured by
   category, so a usage qualifier never reads as a part of speech: the same split
   shirabe.org makes between its POS and qualifier chips. */
.sb-sense-chips, .sb-entry-chips, .sb-group-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 3px; }
.sb-entry-chips { margin: 0 0 5px; }
.sb-group-chips { margin: 0 0 3px; }
.sb-sense-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border: 1px solid currentColor;
  border-color: var(--sb-chip-border, currentColor);
  border-radius: 999px;
  background: var(--sb-chip-bg, transparent);
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  color: var(--sb-ink-faint);
}
.sb-sense-chip-pos { color: var(--sb-accent); }
.sb-sense-chip-nameType { color: var(--sb-accent); }
/* A chip that explains itself. It carries no extra ornament: the whole row is
   already chips, and marking half of them differently would say "these are a
   different kind of label", which is exactly what the colours already say and
   this does not. The pointer and the hover tint are the affordance. */
.sb-sense-chip-open {
  font-family: inherit;
  cursor: pointer;
  transition: filter 0.12s ease;
}
.sb-sense-chip-open:hover { filter: brightness(1.08); }
.sb-sense-chip-open[aria-expanded="true"] { background: var(--sb-chip-bg-strong, transparent); }
.sb-legend {
  margin: 4px 0 6px;
  padding: 7px 9px;
  border: 1px solid var(--sb-outline);
  border-radius: 8px;
  background: var(--sb-surface-muted);
}
.sb-legend-head { display: flex; align-items: baseline; gap: 6px; }
.sb-legend-term { font-size: 12px; font-weight: 600; color: var(--sb-ink); }
.sb-legend-jp { font-size: 11px; color: var(--sb-ink-muted); }
.sb-legend-body { margin-top: 3px; font-size: 12px; color: var(--sb-ink-subtle); }
.sb-legend-example { margin-top: 3px; font-size: 11px; color: var(--sb-ink-muted); }
.sb-sense-chip-field { color: var(--sb-field); }
.sb-sense-chip-dialect { color: var(--sb-dialect); }
/* Language tags appear only when the card contains more than one language. */
/* A usage note is an aside about the sense above it, and italic is how the
   dictionary itself sets one: it must not read as another meaning. */
.sb-sense-note {
  margin-top: 2px;
  font-size: 11px;
  font-style: italic;
  white-space: pre-wrap;
  color: var(--sb-ink-muted);
}
/* Cross references: a label naming what the link means, then the words. Each
   word is a lookup, so it is tinted like one; the row is one tab stop. */
.sb-xrefs { margin-top: 3px; }
.sb-xref-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px; margin-top: 2px; }
.sb-xref-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--sb-ink-muted);
}
.sb-xref {
  border-radius: 3px;
  font-size: 13px;
  color: var(--sb-accent);
  cursor: pointer;
  text-underline-offset: 2px;
}
.sb-xref-target-label { margin-left: 3px; font-size: 11px; color: var(--sb-ink-muted); }
.sb-xref:hover { background: var(--sb-accent-tint); text-decoration: underline; }
.sb-xref:focus-visible { outline: 2px solid var(--sb-accent-border); outline-offset: 1px; }
.sb-gloss-row { display: block; white-space: pre-wrap; }
.sb-gloss-row + .sb-gloss-row { margin-top: 2px; }
.sb-gloss-items { display: inline-block; vertical-align: top; }
.sb-gloss-item + .sb-gloss-item { margin-top: 2px; }
.sb-japanese-run { font-family: var(--sb-font-japanese, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif); }
.sb-gloss-title, .sb-usage-title { margin-top: 4px; font-size: 11px; font-weight: 600; color: var(--sb-ink-muted); }
.sb-usages { display: flex; flex-direction: column; gap: 3px; margin-top: 5px; padding-left: 10px; border-left: 2px solid var(--sb-outline); }
.sb-usage { white-space: pre-wrap; }
.sb-usage-text { color: var(--sb-ink-subtle); }
.sb-gloss-lang {
  display: inline-flex;
  justify-content: center;
  min-width: 1.55em;
  margin-right: 6px;
  padding: 1px 4px;
  border: 1px solid var(--sb-outline-strong);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.03em;
  line-height: 1.4;
  color: var(--sb-ink-muted);
  vertical-align: 1px;
}

.sb-examples { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--sb-divider); }
.sb-example { margin: 6px 0; }
.sb-example-jp { color: var(--sb-ink); }
.sb-example-tr { font-size: 13px; color: var(--sb-ink-subtle); }
.sb-example-source, .sb-example-source-details { margin-top: 6px; font-size: 12px; color: var(--sb-ink-subtle); overflow-wrap: anywhere; }
.sb-example-source-details summary { box-sizing: border-box; min-height: 44px; cursor: pointer; padding: 10px 4px; }
.sb-example-source-details summary:hover { color: var(--sb-accent); }
.sb-example-source-details summary:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
.sb-example-reference { display: grid; gap: 4px; }
.sb-example-reference-heading { margin-bottom: 2px; font-weight: 650; color: var(--sb-ink-subtle); }
.sb-example-reference-text { padding: 2px 8px; }
.sb-example-reference-link {
  box-sizing: border-box; display: flex; align-items: center; gap: 10px; min-height: 40px;
  padding: 7px 10px; border-radius: 9px; color: var(--sb-source);
  background: var(--sb-accent-tint); text-decoration: none; cursor: pointer;
}
.sb-example-reference-link::after { content: "↗"; margin-left: auto; font-size: 14px; }
.sb-example-reference-link:hover { background: var(--sb-accent-tint-strong); text-decoration: underline; }
.sb-example-reference-link:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
/* Clickable sentence tokens: subtle until hovered; the searched word tinted.
   Nothing is drawn around a word at rest, because a line with a box on every
   word stops reading as a sentence. The underline appears under the pointer,
   which is the only moment "this opens" is a useful thing to say. */
.sb-example-token {
  border-radius: 3px;
  cursor: pointer;
  text-underline-offset: 2px;
}
.sb-example-token:hover { background: var(--sb-accent-tint); text-decoration: underline; }
.sb-example-token:focus-visible {
  outline: 2px solid var(--sb-accent-border);
  outline-offset: 1px;
}
/* The word this card is about. Tinted rather than boxed or bolded: the line has
   to stay a line, and a reader scanning for "where is my word" finds a colour
   before they find a weight. */
.sb-example-hit {
  background: var(--sb-accent-tint-strong);
  color: var(--sb-accent);
  font-weight: 600;
}
.sb-example-hit:hover { background: var(--sb-accent-tint-strong); }
/* Punctuation and spacing: part of the line, never a lookup. */
.sb-example-gap { cursor: default; }

.sb-actions { flex: 0 0 auto; margin-top: 12px; }
.sb-membership { margin-bottom: 6px; color: var(--sb-ink-muted); font-size: 11px; }
.sb-grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.sb-extra { display: flex; gap: 6px; margin-top: 6px; }
.sb-extra .sb-btn { flex: 1; }

/* The capture form (card-form.ts), in place of the action row. Same tokens as
   the rest of the card: it is the same surface, not a dialog over it. */
.sb-form { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
.sb-field { display: flex; flex-direction: column; gap: 4px; }
.sb-field-label { color: var(--sb-ink-muted); font-size: 11px; font-weight: 600; }
.sb-field-hint { color: var(--sb-ink-muted); font-size: 11px; }
.sb-row { display: flex; align-items: center; gap: 6px; }
.sb-input {
  width: 100%; box-sizing: border-box; padding: 5px 7px; font: inherit; font-size: 12px;
  color: var(--sb-ink); background: var(--sb-surface); border: 1px solid var(--sb-divider); border-radius: 6px;
}
.sb-input:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 1px; }
.sb-form-senses { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.sb-form-senses li { display: flex; align-items: baseline; gap: 6px; font-size: 12px; }
.sb-form-gloss { flex: 1; }
.sb-form-examples { display: flex; flex-direction: column; gap: 6px; }
.sb-form-picks:empty { display: none; }
.sb-form-picks { display: flex; flex-wrap: wrap; gap: 4px; }
.sb-form-chip {
  display: inline-flex; align-items: center; gap: 4px; max-width: 100%;
  padding: 2px 4px 2px 7px; font-size: 11px; line-height: 1.5;
  background: var(--sb-accent-tint); color: var(--sb-ink); border-radius: 999px;
}
.sb-form-chip-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.sb-form-chip-x { border: 0; background: none; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; }
.sb-form-offers { display: flex; flex-direction: column; gap: 2px; }
.sb-form-offer {
  text-align: left; border: 0; background: none; padding: 2px 0; cursor: pointer;
  color: var(--sb-ink-muted); font: inherit; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sb-form-offer:hover { color: var(--sb-accent); text-decoration: underline; }
.sb-form-shot { max-width: 120px; border-radius: 4px; border: 1px solid var(--sb-divider); }
.sb-form-actions { display: flex; align-items: center; gap: 6px; }

.sb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font: 600 13px/1 system-ui, sans-serif;
  padding: 7px 8px; border-radius: 8px; border: 1px solid transparent; cursor: pointer;
  color: var(--sb-on-solid);
}
.sb-btn:disabled { cursor: wait; opacity: 0.55; }
.sb-btn kbd {
  font: 600 10px/1 ui-monospace, monospace;
  padding: 2px 4px; border-radius: 4px;
  background: rgba(255, 255, 255, 0.25);
}
.sb-g1 { background: #ef4444; } .sb-g1:hover { background: #dc2626; }
.sb-g2 { background: #f59e0b; } .sb-g2:hover { background: #d97706; }
.sb-g3 { background: #22c55e; } .sb-g3:hover { background: #16a34a; }
.sb-g4 { background: #3b82f6; } .sb-g4:hover { background: #2563eb; }
.sb-btn-save { background: var(--sb-accent); } .sb-btn-save:hover { background: var(--sb-accent-hover); }
.sb-btn-known { background: var(--sb-known-btn); } .sb-btn-known:hover { background: var(--sb-known-btn-hover); }
.sb-btn-known kbd, .sb-btn-save kbd { background: rgba(255, 255, 255, 0.22); }
/* Solid accent: pairs with Known in .sb-extra. */
.sb-btn-open {
  background: var(--sb-accent);
  color: var(--sb-on-solid);
  text-decoration: none;
}
.sb-btn-open:hover { background: var(--sb-accent-hover); color: var(--sb-on-solid); text-decoration: none; }

.sb-feedback { display: block; margin-top: 8px; font-size: 12px; color: var(--sb-ink-subtle); }
.sb-feedback.sb-error { color: var(--sb-error); }
/* Needs-Pro reads as an offer, not a failure: normal ink, an underlined way out. */
.sb-feedback.sb-upgrade { color: var(--sb-ink); }
.sb-plans { color: var(--sb-accent); font-weight: 600; text-decoration: underline; cursor: pointer; }
.sb-plans:hover { color: var(--sb-accent-hover); }
.sb-btn:focus-visible, .sb-headword:focus-visible, .sb-btn.sb-close:focus-visible {
  outline: 3px solid var(--sb-accent); outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) { .sb-popup, .sb-dictionary-arrow { transition: none; } }
@media (forced-colors: active) {
  .sb-popup, .sb-btn { border: 1px solid ButtonText; }
  .sb-popup { box-shadow: none; }
}
`;
