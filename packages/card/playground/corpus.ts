import type { Definition } from "../src/word-card/types.js";

const sense = (text: string, pos: string, code: string, position = 0) => ({
  position,
  glosses: [{ lang: "eng" as const, tag: "EN", text }],
  partsOfSpeech: [{ label: pos, code, category: "pos" as const }],
  tags: [],
});

const word = (headword: string, reading: string, gloss: string, pos: string, code: string, extra: Partial<Definition> = {}): Definition => ({
  headword, reading,
  entry: `jmdict:${headword}`,
  url: `https://shirabe.org/en/words/${headword}-${reading}`,
  common: true, jlpt: "N4", frequency: 500,
  pitch: [{ downstep: 1, audioUrl: null }],
  senses: [sense(gloss, pos, code)],
  examples: [],
  ...extra,
});

/** Enough of a dictionary to exercise the card, written by hand. */
export const WORDS: Record<string, Definition> = {
  "猫": word("猫", "ねこ", "cat", "Noun", "n", { jlpt: "N5", frequency: 1204 }),
  "座る": word("座る", "すわる", "to sit", "Godan verb", "v5r", {
    forms: [{ text: "坐る", common: false, rare: true }],
  }),
  "窓": word("窓", "まど", "window", "Noun", "n", { jlpt: "N4" }),
  "静か": word("静か", "しずか", "quiet, still", "Na-adjective", "adj-na"),
  "読む": word("読む", "よむ", "to read", "Godan verb", "v5m", { jlpt: "N5" }),
  "本": word("本", "ほん", "book", "Noun", "n", { jlpt: "N5", frequency: 210 }),
  "君": word("君", "きみ", "you", "Pronoun", "pn", {
    senses: [{ ...sense("you", "Pronoun", "pn"), tags: [{ label: "Usually kana", code: "uk", category: "misc" as const }] }],
  }),
  "食べる": word("食べる", "たべる", "to eat", "Ichidan verb", "v1", {
    jlpt: "N5",
    senses: [sense("to eat", "Ichidan verb", "v1"), sense("to live on (e.g. a salary)", "Ichidan verb", "v1", 1)],
  }),
};

/** Lines to read, already cut into words: the playground exercises the CARD, so
    it does not pretend to tokenize. Each entry is [surface, lemma-or-null]. */
export const SENTENCES: Array<Array<[string, string | null]>> = [
  [["猫", "猫"], ["が", null], ["窓", "窓"], ["に", null], ["静か", "静か"], ["に", null], ["座る", "座る"], ["。", null]],
  [["君", "君"], ["は", null], ["本", "本"], ["を", null], ["読む", "読む"], ["の", null], ["が", null], ["好き", null], ["？", null]],
  [["猫", "猫"], ["は", null], ["何", null], ["を", null], ["食べる", "食べる"], ["の", null], ["？", null]],
];
