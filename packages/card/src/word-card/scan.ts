import { scheduleHide, scheduleTextLookup } from "./card.js";
import { isReadable, readableRunAt, sentenceAround } from "./wrap.js";
export { sentenceAround } from "./wrap.js";

/**
 * Turning a pointer over raw text into a lookup without adding page markup.
 *
 * This is how a surface with text but no tokenizer reads: an Anki card, a page
 * the extension has not parsed, anything that has Japanese on screen and nothing
 * that has cut it into words. The character under the cursor begins the query.
 * The surrounding sentence and caret offset let a host find the whole word.
 *
 * It lives here rather than in a host because every host needs the same three
 * awkward pieces: the caret at a point, the logical text that follows it across
 * inline markup, and the sentence around it for a mined card.
 */
export type ScanOptions = {
  /** Where to listen. Defaults to the document. */
  root?: HTMLElement | Document;
  /** Answered per event: whether this pointer position should scan at all. A
      host uses it for its own gating (a modifier key, a per-site setting). */
  shouldScan?(event: MouseEvent): boolean;
  /** Elements a scan must never start inside, beyond the card's own. */
  skip?: string;
  onScan?(): void;
};

const OURS = ".sb-word, .sb-host, input, textarea, select, [contenteditable='true']";

export function attachScanner(options: ScanOptions = {}): () => void {
  const root = options.root ?? document;
  const skip = options.skip ? `${OURS}, ${options.skip}` : OURS;

  const onMove = (event: Event) => {
    scanPointer(event as MouseEvent, skip, options.shouldScan, options.onScan, root);
  };
  // Touch has no hover, so a tap is the gesture that means "read this".
  const onTap = (event: Event) => {
    if ((event as PointerEvent).pointerType === "touch") {
      onMove(event);
    }
  };
  root.addEventListener("mousemove", onMove);
  root.addEventListener("pointerup", onTap);
  return () => {
    root.removeEventListener("mousemove", onMove);
    root.removeEventListener("pointerup", onTap);
  };
}

/** Read a pointer target without opening a popup or consuming the gesture. */
export function scanTargetAt(event: MouseEvent, skip = OURS, root: HTMLElement | Document = document) {
  const element = event.target instanceof Node
    ? event.target.nodeType === Node.ELEMENT_NODE ? event.target as Element : event.target.parentElement
    : null;
  if (!element || !root.contains(element) || !isReadable(element, skip)) return null;
  const caret = caretAt(event.clientX, event.clientY);
  if (!caret || !root.contains(caret.node) || !isReadable(caret.node.parentElement, skip)) return null;
  if (caret.offset < 0 || caret.offset >= caret.node.length) return null;

  const run = readableRunAt(caret.node, root, { skip });
  const source = run?.nodes.find((source) => source.node === caret.node);
  if (!run || !source) return null;
  const offset = source.start + caret.offset;
  const query = [...run.text.slice(offset)].slice(0, 32).join("");
  if (!startsJapanese(query)) return null;

  const range = document.createRange();
  range.setStart(caret.node, caret.offset);
  range.setEnd(caret.node, Math.min(caret.offset + 1, caret.node.length));
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;

  const sentence = sentenceAround(run.text, offset);
  const at = (sentenceOffset: number) => {
    const absolute = offset - sentence.targetStart + sentenceOffset;
    const source = run.nodes.find((part) => part.start <= absolute && absolute < part.start + part.text.length);
    return source ? { node: source.node, offset: absolute - source.start } : null;
  };
  return { ...caret, query, rect, sentence: sentence.text, targetStart: sentence.targetStart, at };
}

export function scanPointer(event: MouseEvent, skip = OURS, shouldScan?: (event: MouseEvent) => boolean, onScan?: () => void,
  root?: HTMLElement | Document, mode: { immediate?: boolean; contextual?: boolean } = {}): boolean {
  if (shouldScan && !shouldScan(event)) return false;
  if ((event.target as Element | null)?.closest?.(skip)) return false;
  const target = scanTargetAt(event, skip, root);
  if (!target) {
    if (event.type === "mousemove") scheduleHide();
    return false;
  }
  onScan?.();
  scheduleTextLookup(target.query, target.rect, target.sentence, target.targetStart,
    { node: target.node, offset: target.offset, at: target.at }, "text", mode);
  return true;
}

export function caretAt(x: number, y: number): { node: Text; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position?.offsetNode.nodeType === Node.TEXT_NODE) return { node: position.offsetNode as Text, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range?.startContainer.nodeType === Node.TEXT_NODE ? { node: range.startContainer as Text, offset: range.startOffset } : null;
}

export function startsJapanese(text: string): boolean {
  return /^[々〇〻\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}
