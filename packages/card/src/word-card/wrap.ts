import type { CardToken, WordCardHost } from "./host.js";

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿々〆〇〻ー]/;

const SKIP = "script, style, noscript, rt, rp, input, textarea, select, button, summary, label, audio, video, iframe, [contenteditable]:not([contenteditable='false']), [hidden], [inert], [aria-hidden='true'], [data-sb-skip], .sb-host";

/** Whether page text may be parsed or looked up, including ancestor visibility. */
export function isReadable(element: Element | null, skip?: string): boolean {
  if (!element?.isConnected || element.closest(skip ? `${SKIP}, ${skip}` : SKIP)) return false;
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = element.ownerDocument.defaultView!.getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse"
      || style.opacity === "0" || style.contentVisibility === "hidden") return false;
    if (ancestor.matches("details:not([open])") && !ancestor.querySelector(":scope > summary")?.contains(element)) return false;
  }
  return true;
}

export type WrapOptions = {
  /** Marks a word already wrapped, so re-running is free rather than nested. */
  marker?: string;
  signal?: AbortSignal;
  /** Additional fields or template controls to leave untouched. */
  skip?: string;
  shouldWrap?(text: Text): boolean;
  /** Keep a live lookup anchored when its source text becomes token fragments. */
  onWrapped?(source: Text, fragments: HTMLElement[]): void;
};

type RunNode = { node: Text; text: string; start: number };
type ReadableRun = { text: string; nodes: RunNode[] };
const BLOCKS = "address,article,aside,blockquote,br,caption,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tbody,td,tfoot,th,thead,tr,ul";

/** Exact unwrapped Japanese runs across inline markup, shared by parsing and offline preparation. */
export function collectReadableRuns(root: ParentNode = document.body, options: WrapOptions = {}): string[] {
  return readableRuns(root, wrappingOptions(options)).map((run) => run.text);
}

function wrappingOptions(options: WrapOptions): WrapOptions {
  const skip = `.${options.marker ?? "sb-word"}, a[href]`;
  return { ...options, skip: options.skip ? `${skip}, ${options.skip}` : skip };
}

function blockElement(element: Element): boolean {
  return element.matches(BLOCKS) || /^(block|flow-root|flex|grid|table|list-item|inline-block|inline-flex|inline-grid)$/.test(element.ownerDocument.defaultView!.getComputedStyle(element).display);
}

function readableRuns(root: ParentNode, options: WrapOptions): ReadableRun[] {
  const runs: ReadableRun[] = [];
  let run: ReadableRun = { text: "", nodes: [] };
  const boundary = () => {
    if (JAPANESE.test(run.text)) runs.push(run);
    run = { text: "", nodes: [] };
  };
  const visit = (node: Node) => {
    if (options.signal?.aborted) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (!isReadable(text.parentElement, options.skip) || options.shouldWrap?.(text) === false) return boundary();
      if (text.data) {
        run.nodes.push({ node: text, text: text.data, start: run.text.length });
        run.text += text.data;
      }
      return;
    }
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : null;
    if (element?.matches("rt,rp")) return;
    if (element && !isReadable(element, options.skip)) return boundary();
    const block = element && blockElement(element);
    if (block) boundary();
    for (const child of node.childNodes) visit(child);
    if (block) boundary();
  };
  visit(root);
  boundary();
  return runs;
}

/** The visible logical run and source offsets containing a caret. */
export function readableRunAt(node: Text, root: ParentNode, options: WrapOptions = {}): ReadableRun | undefined {
  if (!root.contains(node)) return;
  let block: ParentNode = node.parentElement ?? root;
  for (let element = node.parentElement; element && root.contains(element); element = element.parentElement) {
    block = element;
    if (element === root || blockElement(element)) break;
  }
  return readableRuns(block, options).find((run) => run.nodes.some((source) => source.node === node));
}

export function readableSelection(range: Range, root: ParentNode, options: WrapOptions = {}): {
  query: string; node: Text; offset: number; range: Range; sentence: string; targetStart: number;
} | null {
  if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const walker = range.startContainer.ownerDocument!.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const hits: Array<{ node: Text; start: number; end: number }> = [];
  let length = 0;
  for (let next: Node | null = walker.currentNode; next; next = walker.nextNode()) {
    if (next.nodeType !== Node.TEXT_NODE || !range.intersectsNode(next)) continue;
    const node = next as Text;
    if (!isReadable(node.parentElement, options.skip) || options.shouldWrap?.(node) === false) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) continue;
    length += end - start;
    if (length > 64) return null;
    hits.push({ node, start, end });
  }
  if (!hits.length) return null;
  const run = readableRunAt(hits[0]!.node, root, options);
  if (!run || hits.some(hit => !run.nodes.some(source => source.node === hit.node))) return null;
  const first = hits[0]!;
  const last = hits[hits.length - 1]!;
  let start = run.nodes.find(source => source.node === first.node)!.start + first.start;
  const end = run.nodes.find(source => source.node === last.node)!.start + last.end;
  const raw = run.text.slice(start, end);
  const query = raw.trim();
  if (!JAPANESE.test(query) || [...query].length > 32) return null;
  start += raw.length - raw.trimStart().length;
  const source = run.nodes.find(source => source.start + source.text.length > start)!;
  const tail = run.nodes.find(source => source.start + source.text.length >= start + query.length)!;
  const selected = range.cloneRange();
  selected.setStart(source.node, start - source.start);
  selected.setEnd(tail.node, start + query.length - tail.start);
  const context = sentenceAround(run.text, start);
  return { query, node: source.node, offset: start - source.start, range: selected,
    sentence: context.text, targetStart: context.targetStart };
}

/** The sentence containing a token, with its start relative to the trimmed sentence. */
export function sentenceAround(text: string, offset: number): { text: string; targetStart: number } {
  const boundaries = /[。！？!?\n]/;
  let start = offset;
  let end = offset;
  while (start > 0 && !boundaries.test(text[start - 1]!)) start -= 1;
  while (end < text.length && !boundaries.test(text[end]!)) end += 1;
  const raw = text.slice(start, Math.min(text.length, end + 1));
  const leading = raw.length - raw.trimStart().length;
  return { text: raw.trim(), targetStart: Math.max(0, offset - start - leading) };
}

/**
 * Wrap every Japanese run under `root`, asking the host to cut each one.
 *
 * Idempotent: a run already inside a `.sb-word` is left alone, so this can run
 * again when a page adds content without doubling anything.
 */
export async function wrapWords(root: ParentNode, host: WordCardHost, options: WrapOptions = {}): Promise<number> {
  if (!host.tokenize) return 0;
  const marker = options.marker ?? "sb-word";
  const collect = wrappingOptions(options);
  const runs = readableRuns(root, collect);
  const current = (run: ReadableRun) => {
    const live = readableRunAt(run.nodes[0]!.node, root, collect);
    return live?.text === run.text && live.nodes.length === run.nodes.length
      && live.nodes.every((source, index) => source.node === run.nodes[index]!.node);
  };

  let wrapped = 0;
  for (const run of runs) {
    if (options.signal?.aborted) break;
    if (!current(run)) continue;
    const tokens = await host.tokenize(run.text).catch(() => []);
    if (options.signal?.aborted) break;
    if (!tokens.length || !validTokens(run.text, tokens) || !current(run)) continue;
    const words = tokens.filter((token) => token.content !== false && JAPANESE.test(token.surface));
    for (const source of run.nodes) {
      const overlapping = words.filter((token) => token.start < source.start + source.text.length && token.start + token.length > source.start);
      if (!overlapping.length) continue;
      const fragment = spansFor(source, overlapping, marker, run.text);
      const spans = [...fragment.children] as HTMLElement[];
      source.node.replaceWith(fragment);
      options.onWrapped?.(source.node, spans);
    }
    wrapped += words.length;
  }
  return wrapped;
}

/** Fetch deduplicated study state and apply it to the current visible word identities. */
export async function paintStates(root: ParentNode, host: WordCardHost, marker = "sb-word", signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) return 0;
  if (!host.study) return 0;
  const words = [...root.querySelectorAll<HTMLElement>(`.${marker}[data-lemma]`)]
    .filter((word) => isReadable(word)).map((word) => ({ word, lemma: word.dataset.lemma! }));
  const lemmas = [...new Set(words.map(({ lemma }) => lemma))];
  if (!lemmas.length) return 0;

  const states = await host.study.states(lemmas).catch(() => null);
  if (!states || signal?.aborted) return 0;
  let painted = 0;
  for (const { word, lemma } of words) {
    if (!root.contains(word) || !isReadable(word) || word.dataset.lemma !== lemma) continue;
    const details = states[lemma];
    if (!details) continue;
    host.study.apply(word, details);
    painted += 1;
  }
  return painted;
}

function validTokens(text: string, tokens: CardToken[]): boolean {
  let end = 0;
  return tokens.every((token) => {
    if (!Number.isInteger(token.start) || !Number.isInteger(token.length) || token.length <= 0
      || token.start < end || token.start + token.length > text.length
      || text.slice(token.start, token.start + token.length) !== token.surface) return false;
    end = token.start + token.length;
    return true;
  });
}

function spansFor(source: RunNode, tokens: CardToken[], marker: string, sentence: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const token of tokens) {
    const start = Math.max(0, token.start - source.start);
    const end = Math.min(source.text.length, token.start + token.length - source.start);
    if (start > cursor) fragment.append(source.text.slice(cursor, start));
    fragment.append(wordSpan(token, marker, source.text.slice(start, end), sentence));
    cursor = end;
  }
  if (cursor < source.text.length) fragment.append(source.text.slice(cursor));
  return fragment;
}

function wordSpan(token: CardToken, marker: string, fragment: string, sentence: string): HTMLElement {
  const span = document.createElement("span");
  const context = sentenceAround(sentence, token.start);
  span.className = marker;
  span.dataset.surface = token.surface;
  span.dataset.sentence = context.text;
  span.dataset.targetStart = String(context.targetStart);
  span.dataset.targetEnd = String(context.targetStart + token.length);
  if (token.entry) span.dataset.entry = token.entry;
  span.dataset.lemma = token.lemma ?? token.surface;
  span.dataset.state = "none";
  if (token.reading) span.dataset.reading = token.reading;
  if (token.pos) span.dataset.pos = token.pos;
  if (token.inflection?.length) span.dataset.inflection = JSON.stringify(token.inflection);
  if (token.inflectionBase) span.dataset.inflectionBase = token.inflectionBase;
  span.textContent = fragment;
  return span;
}
