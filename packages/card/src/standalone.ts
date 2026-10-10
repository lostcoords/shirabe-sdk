import { DEFAULT_CARD_OPTIONS, dismissPopup, scheduleHide, scheduleShow, scheduleTextLookup, setCardHost, setPopupOptions, setWriteState, showNow, type PopupOptions } from "./word-card/card.js";
import { apiHost, type ApiHostOptions } from "./word-card/api-host.js";
import type { WordCardHost } from "./word-card/host.js";
import type { GlossLanguage } from "./word-card/types.js";
import { glossLanguagesFrom } from "./word-card/languages.js";
import { scanTargetAt } from "./word-card/scan.js";
import { collectReadableRuns, isReadable, paintStates, readableSelection, wrapWords } from "./word-card/wrap.js";
import { installPageStyles } from "./word-card/page.js";
import { createLink, type LinkOptions } from "./word-card/link.js";
import { loadSnapshot, snapshotHost } from "./word-card/snapshot-host.js";
import { createAnkiHost } from "./word-card/anki-host.js";

/**
 * The build for somewhere that cannot run a package manager: an Anki card
 * template, a userscript, a plain HTML page.
 *
 * Everything arrives as one `<script>` and one global, because that is the whole
 * budget a card template has. It must stay an IIFE and never an ES module: a
 * template is loaded from `file://`, where a module script is blocked as
 * cross-origin and fails silently.
 */
export type Trigger = "hover" | "click" | "alt" | "ctrl" | "shift" | "meta";

const MODIFIER_HELD: Record<string, (event: MouseEvent | KeyboardEvent) => boolean> = {
  alt: (event) => event.altKey,
  ctrl: (event) => event.ctrlKey,
  shift: (event) => event.shiftKey,
  meta: (event) => event.metaKey,
};

export type AttachOptions = {
  /** Where to watch for hovers. Defaults to the whole document. */
  root?: HTMLElement;
  /** Cut the page into words first, so every word is its own hover.
      Defaults to on wherever the host can tokenize. */
  parse?: boolean;
  /** Automatically read study states to color page words. Defaults to on.
      Turn off for offline wrapping without background study requests. */
  studyColors?: boolean;
  /** Style the words on the page: a pointer, a hover, and what you already know.
      On unless the host would rather dress them itself. */
  styles?: boolean;
  /** What opens the card. `hover` is the default; a modifier means hover with
      that key held, which is Yomitan's model and the browser extension's; and
      `click` is for a reader who does not want a card appearing under a moving
      pointer at all. Touch always taps, whatever this says: a phone has no
      hover and no modifier key. */
  trigger?: Trigger;
  /** Read raw text instead: the character under the pointer starts the query.
      Used automatically where the host cannot cut text, and it is the weaker of
      the two, because a boundary the reader did not choose answers badly. */
  scan?: boolean;
  /** CSS selector for fields and template controls excluded from lookup and parsing. */
  skip?: string;
  /** A host of your own, or omit it and pass `api` instead. */
  host?: WordCardHost;
  /** Shorthand for the common case: back the card with Shirabe's API. */
  api?: ApiHostOptions;
  /** Let the reader sign in from the card itself.
   *
   * For a surface with nowhere else to do it: an AnkiDroid card is HTML in a
   * webview with no add-on behind it, so without this a reader on a phone can
   * never be anything but anonymous. Pass a PUBLIC, READ-ONLY client: whatever
   * this signs in with is stored where every other card in the collection can
   * read it. See `link.ts`. */
  link?: Omit<LinkOptions, "apiBase"> & { apiBase?: string };
  /** Whether the reader may save and mark words known. */
  canWrite?: boolean;
  /** Whether the host already knows who the reader is. */
  connected?: boolean;
  languages?: GlossLanguage[];
  options?: Partial<PopupOptions>;
};

export type Attachment = { show(word: HTMLElement): void; detach(): void; reread(): void };
const attachments = new Map<HTMLElement | Document, Attachment>();
let active: Attachment | null = null;

function attach(options: AttachOptions = {}): Attachment {
  const root: HTMLElement | Document = options.root ?? document;
  const listeners = new AbortController();
  const cleanup: Array<() => void> = [];
  const listen = <K extends keyof WindowEventMap>(target: EventTarget, type: K, callback: (event: WindowEventMap[K]) => void, capture = false) => {
    const listener = callback as EventListener;
    target.addEventListener(type, listener, capture);
    cleanup.push(() => target.removeEventListener(type, listener, capture));
  };
  const apiBase = options.link?.apiBase ?? options.api?.apiBase;
  const link = options.link && apiBase ? createLink({ ...options.link, apiBase }) : undefined;
  const host = options.host ?? (options.api ? apiHost({ ...options.api, link }) : undefined);
  if (!host) throw new Error("ShirabeCard.attach needs either `host` or `api`");
  attachments.get(root)?.detach();

  const parsing = options.parse !== false && !!host.tokenize;
  const studyColors = options.studyColors !== false;
  const trigger = options.trigger ?? "hover";
  const held = MODIFIER_HELD[trigger];
  const skip = options.skip ? `a[href], ${options.skip}` : "a[href]";
  const scanSkip = `.sb-word, ${skip}`;
  let reading: AbortController | null = null;
  let pendingRead: { element: HTMLElement; children: Node[]; text: string | null; start(): void } | null = null;
  let visibilityFrame: number | null = null;
  let connected = options.connected ?? (link ? link.linked() : !!options.api?.token);
  let origin: { node: Node; text: string | null } | null = null;
  let lastScan: { node: Text; offset: number } | null = null;
  let over: HTMLElement | null = null;
  let lastPointer: MouseEvent | null = null;
  let pointer: { ids: Set<number>; x: number; y: number; target: EventTarget | null; cancelled: boolean } | null = null;
  let lastTap: { target: EventTarget | null; until: number } | null = null;
  type SelectedText = NonNullable<ReturnType<typeof readableSelection>>;
  let selectionHost: HTMLElement | null = null;
  let selectionTarget: SelectedText | null = null;
  let dismissedSelection: SelectedText | null = null;
  let selectionLookup: SelectedText | null = null;
  const page = () => root.nodeType === Node.DOCUMENT_NODE ? (root as Document).body : root as HTMLElement;
  const owns = (node: Node | null) => !listeners.signal.aborted && root.isConnected && attachmentFor(node) === attachment;
  const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const remember = (node: Node) => { origin = { node, text: node.textContent }; };
  const close = () => {
    origin = null;
    lastScan = null;
    selectionLookup = null;
    if (active === attachment) dismissPopup();
  };
  const repaint = () => {
    if (!studyColors) return;
    void paintStates(page(), host, "sb-word", reading?.signal ?? listeners.signal);
  };
  const cardHost = host.resolvePending ? new Proxy(host, {
    get(target, property) {
      if (property === "resolvePending") return async (progress: (message: string | Node) => void) => {
        const currentRead = reading;
        await target.resolvePending!(progress);
        if (listeners.signal.aborted || reading !== currentRead || currentRead?.signal.aborted) return;
        connected = true;
        if (active === attachment) activate();
        if (origin?.node.nodeType === Node.TEXT_NODE && origin.node.parentElement) remember(origin.node.parentElement);
        readPage();
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) : host;
  const activate = () => {
    if (listeners.signal.aborted) return;
    if (active !== attachment) dismissPopup();
    active = attachment;
    setCardHost(cardHost, parsing && studyColors ? repaint : undefined);
    setWriteState({
      canWrite: options.canWrite ?? false,
      readOnly: !options.canWrite,
      connected,
      languages: options.languages ?? options.api?.languages ?? ["eng"],
    });
    setPopupOptions({ ...DEFAULT_CARD_OPTIONS, ...options.options });
  };
  const prepareWords = () => {
    for (const word of page().querySelectorAll<HTMLElement>(".sb-word")) {
      if (!owns(word) || !isReadable(word, skip)) continue;
      if (!word.hasAttribute("tabindex")) word.tabIndex = 0;
      if (!word.hasAttribute("role")) word.setAttribute("role", "button");
      word.setAttribute("aria-haspopup", "dialog");
    }
  };
  const readPage = () => {
    if (listeners.signal.aborted) return;
    reading?.abort();
    pendingRead = null;
    const pass = new AbortController();
    reading = pass;
    prepareWords();
    if (!parsing) return;
    const start = () => {
      pendingRead = null;
      if (pass.signal.aborted || listeners.signal.aborted) return;
      void wrapWords(page(), host, {
        signal: pass.signal,
        skip: options.skip,
        shouldWrap: (text) => owns(text),
        onWrapped: (source, fragments) => {
          if (origin?.node === source) remember(fragments[0]!);
        },
      }).then(() => {
        if (pass.signal.aborted) return;
        prepareWords();
        if (studyColors) return paintStates(page(), host, "sb-word", pass.signal);
      });
    };
    const element = page();
    if (isReadable(element, skip)) start();
    else {
      pendingRead = { element, children: [...element.childNodes], text: element.textContent, start };
      visibilityChanged();
    }
  };
  const retryVisibleRead = () => {
    const pending = pendingRead;
    if (!pending || listeners.signal.aborted) return;
    if (reading?.signal.aborted || pending.element !== page() || pending.element.textContent !== pending.text
      || pending.element.childNodes.length !== pending.children.length
      || pending.children.some((child, index) => pending.element.childNodes[index] !== child)) {
      reading?.abort();
      pendingRead = null;
    } else if (isReadable(pending.element, skip)) pending.start();
  };
  const visibilityChanged = () => {
    retryVisibleRead();
    if (pendingRead && visibilityFrame === null) visibilityFrame = window.requestAnimationFrame(() => {
      visibilityFrame = null;
      retryVisibleRead();
    });
  };
  const selectionFrom = (range: Range) => readableSelection(range, root, { skip, shouldWrap: owns });
  const sameSelection = (left: SelectedText | null, right: SelectedText | null) => !!left && !!right
    && left.node === right.node && left.offset === right.offset && left.query === right.query && left.sentence === right.sentence;
  const removeSelection = () => {
    dismissedSelection = selectionTarget ?? dismissedSelection;
    selectionTarget = null;
    selectionHost?.remove();
    selectionHost = null;
  };
  const updateSelection = () => {
    if (listeners.signal.aborted) return;
    const selection = window.getSelection();
    const target = selection?.rangeCount === 1 ? selectionFrom(selection.getRangeAt(0)) : null;
    if (selection?.toString() && root.contains(selection.anchorNode) && active === attachment
      && !sameSelection(target, selectionTarget) && !sameSelection(target, selectionLookup)) close();
    if (!target) { removeSelection(); dismissedSelection = null; return; }
    if (sameSelection(target, dismissedSelection)) return removeSelection();
    dismissedSelection = null;
    selectionTarget = target;
    if (!selectionHost) {
      selectionHost = document.createElement("div");
      selectionHost.className = "sb-selection-host";
      selectionHost.setAttribute("data-sb-skip", "");
      selectionHost.dataset.theme = options.options?.theme ?? "system";
      const shadow = selectionHost.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; position: fixed; z-index: 2147483647; color-scheme: light; }
        button { font: 600 13px/1.3 system-ui, sans-serif; box-sizing: border-box; min-height: 44px;
          padding: 10px 14px; border: 1px solid #a8bcb7; border-radius: 10px; color: #19574b;
          background: #fff; box-shadow: 0 3px 14px #0002; cursor: pointer; }
        button:hover { background: #edf6f3; }
        button:focus-visible { outline: 2px solid #287d69; outline-offset: 2px; }
        :host([data-theme="dark"]) button { color: #ade6d4; background: #202c29; border-color: #516e65; }
        :host([data-theme="dark"]) button:hover { background: #30413b; }
        @media (prefers-color-scheme: dark) {
          :host([data-theme="system"]) button { color: #ade6d4; background: #202c29; border-color: #516e65; }
          :host([data-theme="system"]) button:hover { background: #30413b; }
        }
      `;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Look up selection";
      button.setAttribute("aria-haspopup", "dialog");
      shadow.append(style, button);
      document.body.append(selectionHost);
    }
    const rect = target.range.getBoundingClientRect();
    const width = selectionHost.offsetWidth || 160;
    const height = selectionHost.offsetHeight || 44;
    const left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    const top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8))}px`;
    if (selectionHost.style.left !== left) selectionHost.style.left = left;
    if (selectionHost.style.top !== top) selectionHost.style.top = top;
  };
  const openSelection = () => {
    const target = selectionTarget && selectionFrom(selectionTarget.range);
    if (!target || !sameSelection(target, selectionTarget)) return removeSelection();
    activate();
    remember(target.node);
    lastScan = target;
    selectionLookup = target;
    scheduleTextLookup(target.query, target.range.getBoundingClientRect(), target.sentence, target.targetStart,
      { node: target.node, offset: target.offset }, "word");
    removeSelection();
  };
  const attachment: Attachment = {
    show(word) {
      if (!owns(word) || !isReadable(word, skip)) return;
      activate();
      remember(word);
      lastScan = null;
      showNow(word);
    },
    reread() {
      if (listeners.signal.aborted) return;
      close();
      removeSelection();
      over = null;
      lastPointer = null;
      pointer = null;
      readPage();
    },
    detach() {
      if (listeners.signal.aborted) return;
      listeners.abort();
      removeSelection();
      for (const remove of cleanup.splice(0)) remove();
      reading?.abort();
      pendingRead = null;
      if (visibilityFrame !== null) window.cancelAnimationFrame(visibilityFrame);
      observer.disconnect();
      if (attachments.get(root) === attachment) attachments.delete(root);
      if (active === attachment) {
        close();
        active = null;
      }
    },
  };
  attachments.set(root, attachment);
  const observer = new window.MutationObserver((records) => {
    if (!root.isConnected) return attachment.detach();
    if (pendingRead && records.some(({ target }) => root.contains(target) || target.contains(page()))) visibilityChanged();
    if (origin && (!origin.node.isConnected || origin.node.textContent !== origin.text
      || !isReadable(origin.node.nodeType === Node.ELEMENT_NODE ? origin.node as Element : origin.node.parentElement, skip))) {
      reading?.abort();
      close();
    }
    if (selectionLookup && !sameSelection(selectionLookup, selectionFrom(selectionLookup.range))) close();
    if (selectionHost && records.some(({ target }) => root.contains(target) || target.contains(page()))) updateSelection();
    if (records.some((record) => record.type === "childList" && root.contains(record.target))) prepareWords();
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "inert", "aria-hidden", "style", "class"] });
  listen(window, "pagehide", () => attachment.detach());
  listen(document, "selectionchange", updateSelection);
  for (const type of ["scroll", "resize"] as const) listen(window, type, () => { if (selectionHost) updateSelection(); }, true);
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "keydown", "keyup"] as const) listen(window, type, (event) => {
    if (!selectionHost || !event.composedPath().includes(selectionHost)) return;
    if (type === "keydown" || type === "keyup") {
      const key = event as KeyboardEvent;
      event.stopImmediatePropagation();
      if (key.isComposing || key.altKey || key.ctrlKey || key.metaKey || key.shiftKey) return;
      if (key.key === "Escape") { consume(event); removeSelection(); }
      else if (key.key === "Enter" || key.key === " ") {
        consume(event);
        if (type === "keyup") openSelection();
      }
    } else {
      consume(event);
      if (type === "click") openSelection();
    }
  }, true);
  for (const type of ["transitionend", "animationend"] as const) listen(window, type, (event) => {
    if (pendingRead && event.target instanceof Node && event.target.contains(page())) visibilityChanged();
  }, true);
  if (options.styles !== false) installPageStyles();
  readPage();

  const wordUnder = (event: Event): HTMLElement | null => {
    const element = event.target as Element | null;
    const word = element?.closest?.(".sb-word") as HTMLElement | null;
    return word && owns(word) && isReadable(element, skip) ? word : null;
  };
  const rawUnder = (event: MouseEvent) => options.scan !== false && owns(event.target as Node | null)
    ? scanTargetAt(event, scanSkip, root) : null;
  const selected = () => !!window.getSelection()?.toString();
  const afterTap = (event: Event) => !!lastTap && Date.now() < lastTap.until && event.target === lastTap.target;
  for (const type of ["mousedown", "mouseup", "click"] as const) listen(window, type, (event) => {
    if (afterTap(event)) consume(event);
  }, true);
  const open = (event: MouseEvent, toggle = false): boolean => {
    const word = wordUnder(event);
    if (word) {
      if (toggle && active === attachment && word.classList.contains("sb-word-open")) close();
      else attachment.show(word);
      return true;
    }
    const target = rawUnder(event);
    if (!target) return false;
    const visible = document.querySelector(".sb-host")?.shadowRoot?.querySelector(".sb-visible");
    if (toggle && active === attachment && visible && lastScan?.node === target.node && lastScan.offset === target.offset) close();
    else {
      activate();
      remember(target.node);
      lastScan = target;
      scheduleTextLookup(target.query, target.rect, target.sentence, target.targetStart, { node: target.node, offset: target.offset });
    }
    return true;
  };
  listen(root, "click", (event) => {
    if (afterTap(event)) return consume(event);
    const mouse = event as MouseEvent;
    if (mouse.button !== 0 || selected() || (held && !held(mouse))) return;
    if (open(mouse)) consume(event);
  }, true);
  for (const type of ["mousedown", "mouseup"] as const) listen(root, type, (event) => {
    if (afterTap(event)) return consume(event);
    const mouse = event as MouseEvent;
    if (mouse.button !== 0 || selected() || (held && !held(mouse))) return;
    if (wordUnder(event) || rawUnder(mouse)) event.stopImmediatePropagation();
  }, true);
  listen(root, "mouseover", (event) => {
    over = wordUnder(event);
    if (trigger === "click" || afterTap(event) || selected() || (held && !held(event as MouseEvent))) return;
    if (over) {
      activate();
      remember(over);
      scheduleShow(over);
    }
  });
  listen(root, "mousemove", (event) => {
    const mouse = event as MouseEvent;
    if (!owns(event.target as Node | null)) return;
    lastPointer = mouse;
    over = wordUnder(event);
    if (over || trigger === "click" || afterTap(event) || selected() || mouse.buttons || (held && !held(mouse))) return;
    if (!open(mouse) && active === attachment && !(event.target as Element | null)?.closest?.(".sb-host")) scheduleHide();
  });
  listen(root, "mouseout", (event) => {
    const next = (event as MouseEvent).relatedTarget as Node | null;
    if (!next || !over?.contains(next)) over = null;
    if (!next || !root.contains(next)) lastPointer = null;
  });
  const modifierKey: Record<string, string> = { alt: "Alt", ctrl: "Control", shift: "Shift", meta: "Meta" };
  listen(window, "keydown", (event) => {
    if (!held || event.key !== modifierKey[trigger] || !held(event) || event.repeat || event.isComposing || selected()) return;
    const focused = document.activeElement;
    if (focused?.matches("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    if (over) attachment.show(over);
    else if (lastPointer) open(lastPointer);
  });
  for (const type of ["keydown", "keyup"] as const) listen(root, type, (event) => {
    const key = event as KeyboardEvent;
    const word = wordUnder(event);
    if (!word || key.isComposing || key.altKey || key.ctrlKey || key.metaKey || key.shiftKey || !["Enter", " "].includes(key.key)) return;
    consume(event);
    if (type === "keydown" && !key.repeat) attachment.show(word);
  }, true);

  listen(root, "pointerdown", (event) => {
    const touch = event as PointerEvent;
    if (!owns(event.target as Node | null)) return;
    if (touch.pointerType === "mouse") {
      if (touch.button === 0 && !selected() && (!held || held(touch)) && (wordUnder(event) || rawUnder(touch))) event.stopImmediatePropagation();
      return;
    }
    if (touch.pointerType !== "touch" && touch.pointerType !== "pen") return;
    if (pointer?.ids.size) { pointer.cancelled = true; pointer.ids.add(touch.pointerId); return; }
    pointer = { ids: new Set([touch.pointerId]), x: touch.clientX, y: touch.clientY, target: event.target, cancelled: false };
    if (!selected() && (wordUnder(event) || rawUnder(touch))) event.stopImmediatePropagation();
    else if (active === attachment && !(event.target as Element | null)?.closest?.(".sb-host")) close();
  }, true);
  listen(root, "pointermove", (event) => {
    const touch = event as PointerEvent;
    if (pointer?.ids.has(touch.pointerId) && Math.hypot(touch.clientX - pointer.x, touch.clientY - pointer.y) > 10) pointer.cancelled = true;
  });
  listen(root, "pointercancel", (event) => {
    if (pointer) { pointer.cancelled = true; pointer.ids.delete((event as PointerEvent).pointerId); }
  });
  listen(root, "pointerup", (event) => {
    const touch = event as PointerEvent;
    if (!owns(event.target as Node | null)) return;
    if (touch.pointerType === "mouse") {
      if (touch.button === 0 && !selected() && (!held || held(touch)) && (wordUnder(event) || rawUnder(touch))) event.stopImmediatePropagation();
      return;
    }
    if (touch.pointerType !== "touch" && touch.pointerType !== "pen") return;
    const down = pointer;
    down?.ids.delete(touch.pointerId);
    if (down?.ids.size) return;
    pointer = null;
    if (selected() || (down && (down.cancelled || down.target !== event.target
      || Math.hypot(touch.clientX - down.x, touch.clientY - down.y) > 10))) return;
    if (open(touch, true)) {
      lastTap = { target: event.target, until: Date.now() + 800 };
      consume(event);
    }
  }, true);
  return attachment;
}

function detach(): void {
  for (const attachment of attachments.values()) attachment.detach();
}

function attachmentFor(word: Node | null): Attachment | undefined {
  for (let node: Node | null = word; node; node = node.parentNode) {
    const attachment = attachments.get(node as HTMLElement | Document);
    if (attachment) return attachment;
  }
}

function show(word: HTMLElement): void {
  (attachmentFor(word) ?? active)?.show(word);
}

// `apiHost` is exposed because a host that wants to CHANGE one answer (an Anki
// add-on answering "do I know this" from the collection) needs the standard one
// to start from, and cannot import a module here.
const ShirabeCard = { attach, detach, show, dismiss: dismissPopup, apiHost, createLink, glossLanguagesFrom, loadSnapshot, snapshotHost, collectReadableRuns, createAnkiHost };
(globalThis as unknown as { ShirabeCard: typeof ShirabeCard }).ShirabeCard = ShirabeCard;
export default ShirabeCard;
