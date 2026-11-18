import type { Definition, Sense } from "./types.js";

// A sense as one line of TEXT, for the places that have to name a meaning rather
// than draw it: the two sense pickers' checkbox labels, and the card form's
// meaning rows.
//
// It lives here rather than in either of them because both need it and neither
// owns the other: the popup imports the card form, so a helper in the popup
// would have the card form importing it back.
//
// A word glossed in two languages is joined with a middot rather than a
// semicolon, which is what separates the glosses INSIDE one language: "to eat ·
// comer" is one meaning said twice, "to eat; to drink" is two meanings.
export function senseText(sense: Sense): string {
  return sense.glosses.map((row) => row.text).join(" · ");
}

// What a word IS, as one label: "Pronoun", "Interjection". It is what tells two
// results with the same spelling apart (あれ the pronoun and あれ the
// interjection), where a kind badge reading "Word" on every row said nothing.
export function partOfSpeechLabel(definition: Definition): string | undefined {
  for (const sense of definition.senses) {
    const own = sense.partsOfSpeech[0]?.label;
    if (own) return own;
    const entryTags = sense.sourceEntry ? definition.entryTagsByEntry?.[sense.sourceEntry] : undefined;
    const entry = entryTags?.find((tag) => tag.category === "pos")?.label;
    if (entry) return entry;
  }
  return undefined;
}
