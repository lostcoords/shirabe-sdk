// Furigana: distributing a reading over the kanji runs of a surface, and
// rendering it. Shared by the card's headword and, in the extension, by every
// parsed word on the page.

// Furigana only earns its place over words that actually contain kanji: a
// kana-only surface (この, では, アクセント) reads its own reading, so ruby there
// is just noise. 々〇〻 count as kanji so 人々 and the like keep their gloss.
const KANJI = /[\p{Script=Han}々〆〇〻]/u;
export const hasKanji = (surface: string): boolean => KANJI.test(surface);

export type FuriganaSegment = { text: string; ruby?: string };

// Distribute a reading across a surface so furigana sits ONLY over kanji runs,
// leaving okurigana and other kana as plain text (食べる → 食[た] + べる, not
// たべる floating over the whole word). Each surface run of kanji claims the
// stretch of reading up to where the following kana run reappears; kana runs
// pass through unchanged. If the reading can't be aligned (irregular/jukujikun
// readings, unexpected katakana), it falls back to one whole-word ruby: still
// correct, just not split. Katakana is folded to hiragana only for matching.
export function furiganaSegments(surface: string, reading: string): FuriganaSegment[] {
  const whole: FuriganaSegment[] = [{ text: surface, ruby: reading }];
  const runs = surfaceRuns(surface);
  const readingHira = kataToHira(reading);
  const segments: FuriganaSegment[] = [];
  let cursor = 0; // position within `reading`

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (!run.kanji) {
      const kana = kataToHira(run.text);
      if (readingHira.slice(cursor, cursor + kana.length) !== kana) return whole;
      segments.push({ text: run.text });
      cursor += kana.length;
      continue;
    }
    const next = runs[i + 1]; // always a kana run when present
    let end: number;
    if (!next) {
      end = reading.length;
    } else {
      const at = readingHira.indexOf(kataToHira(next.text), cursor + 1);
      if (at === -1) return whole;
      end = at;
    }
    if (end <= cursor) return whole; // a kanji with no reading of its own: bail
    segments.push({ text: run.text, ruby: reading.slice(cursor, end) });
    cursor = end;
  }

  // The surface is fully aligned. Any leftover reading is the inflectional
  // okurigana the dictionary form carries but the inflected surface dropped
  // (考える→考え: token reading かんがえる, surface reading only かんがえ). It can only
  // trail a final kana run: a trailing kanji run already consumes to the end :
  // so keep furigana over the kanji and let the unused tail (る) fall away,
  // instead of smearing the whole dictionary reading over the word.
  return segments;
}

// Split a surface into maximal runs of kanji vs. everything else, iterating by
// code point so astral-plane kanji stay intact.
function surfaceRuns(surface: string): Array<{ text: string; kanji: boolean }> {
  const runs: Array<{ text: string; kanji: boolean }> = [];
  for (const ch of surface) {
    const kanji = hasKanji(ch);
    const last = runs[runs.length - 1];
    if (last && last.kanji === kanji) last.text += ch;
    else runs.push({ text: ch, kanji });
  }
  return runs;
}

export const kataToHira = (text: string): string =>
  text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

export const hiraToKata = (text: string): string =>
  text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));

// Render `surface` into `target` with furigana over the kanji runs only: each
// kanji run gets a <ruby>, okurigana and other kana render as plain text, so the
// reading sits where it belongs instead of floating over the whole word (食べる
// → 食[た]べる, not たべる over 食べる). Shared with the popup's headword furigana.
export function appendFurigana(target: HTMLElement, surface: string, reading: string): void {
  appendFuriganaSegments(target, furiganaSegments(surface, reading));
}

/** Render segments aligned by Shirabe itself, preserving irregular readings. */
export function appendFuriganaSegments(target: HTMLElement, segments: readonly FuriganaSegment[]): void {
  for (const segment of segments) {
    if (!segment.ruby) {
      target.append(segment.text);
      continue;
    }
    const ruby = document.createElement("ruby");
    ruby.append(segment.text);
    const rt = document.createElement("rt");
    rt.textContent = segment.ruby;
    ruby.append(rt);
    target.append(ruby);
  }
}

// A page parsed while furigana was Off contains plain word spans, but every
// span retains its reading in data-reading. Switching to a visible mode can
