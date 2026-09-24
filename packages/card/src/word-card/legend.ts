import book from "./resources/legend.json" with { type: "json" };
import { uiLanguagesFrom, type GlossLanguage } from "./languages.js";

// The Legend, as the popup carries it: the same entries the website's Legend
// book shows, so tapping "Na-adjective" on a sense chip explains it in the card
// instead of sending the reader to a tab they have to come back from.
//
// Both halves are GENERATED from the server (`bin/rails extension:legend`,
// Extension::Legend), and that is the point rather than a convenience. Which
// entry explains a code is `SearchHelper#legend_slug`, forty-odd cases and four
// regex families; the text is `legend.terms.*` in the locale files. A hand-kept
// TypeScript copy of either is a copy that drifts, and a drifted legend is a
// confident wrong explanation, which is worse than no chip at all. So the codes
// arrive expanded (`adj-na` → `na-adjective`, every code the dictionary
// actually carries) and the terms arrive translated.
//
// A code with no entry is not a failure: the book explains what a learner can
// tell apart, and JMdict splits far finer than that. Those chips stay plain.

export type LegendTerm = { label: string; jp?: string; body: string; example?: string };
export type TagPresentation = { shortLabel: string; fullLabel: string; explanation?: string; example?: string; jp?: string };
export type TagDisplayLocale = "en" | "es";

/** Which lookup names the entry for a code. The two are separate tables and
    must stay that way: the server's part-of-speech rules end in a catch-all for
    the verb classes, which reads the usage tag `vulg` as a verb. A chip always
    knows which kind of annotation it came from, so it never has to guess. */
export type LegendKind = "pos" | "usage";

type Book = { codes: Record<LegendKind, Record<string, string>>; terms: Record<string, Record<string, LegendTerm>> };

const legend = book as Book;

const shortLabels: Record<string, Partial<Record<"en" | "es", string>>> = {
  abbreviation: { en: "Abbrev.", es: "Abrev." },
  childish: { en: "Childish", es: "Infantil" },
  conjunction: { en: "Conj." },
  counter: { en: "Counter", es: "Contador" },
  euphemistic: { en: "Euphemism", es: "Eufemismo" },
  "godan-verb": { es: "V. godan" },
  "i-adjective": { en: "I-adj.", es: "Adj. en i" },
  "ichidan-verb": { en: "Ichidan", es: "V. ichidan" },
  interjection: { en: "Interj.", es: "Interj." },
  "internet-slang": { en: "Net slang", es: "Jerga web" },
  "intransitive-verb": { en: "Intrans.", es: "Intrans." },
  "kana-alone": { en: "Kana only", es: "Solo kana" },
  "manga-slang": { en: "Manga sl.", es: "J. manga" },
  "na-adjective": { en: "Na-adj.", es: "Adj. en na" },
  "name-entity": { en: "Entity", es: "Entidad" },
  "no-adjective": { en: "No-adj.", es: "Adj. en no" },
  "noun-prefix": { en: "Noun pref.", es: "Sust. pref" },
  "noun-suffix": { en: "Noun suf.", es: "Sust. suf." },
  onomatopoeic: { en: "Mimetic", es: "Mimético" },
  "prenominal-adjective": { en: "Pre-noun", es: "Prenominal" },
  "taru-adjective": { en: "Taru adj.", es: "Adj. taru" },
  "to-adverb": { es: "Adv. en to" },
  "transitive-verb": { en: "Trans.", es: "Trans." },
  yojijukugo: { en: "4-kanji", es: "4 kanji" },
};

const specificLabels: Record<string, Record<"en" | "es", string>> = {
  "pos:unc": { en: "Unclass.", es: "Sin clas." },
  "pos:num": { en: "Numeric", es: "Numeral" },
  "pos:aux-v": { en: "Aux. verb", es: "V. aux." },
  "pos:aux-adj": { en: "Aux. adj.", es: "Adj. aux." },
  "pos:vk": { en: "Kuru verb", es: "Verbo kuru" },
  "pos:adj-f": { en: "Pre-noun", es: "Prenominal" },
};

/** The brief label on a dictionary chip. The Legend keeps the full explanation. */
export function chipLabel(code: string, category: string, full: string, languages: readonly GlossLanguage[]): string {
  if (category === "nameType") return languages.includes("spa") ? "Nombre" : "Name";
  const kind: LegendKind | undefined = category === "partOfSpeech" ? "pos" : category === "misc" ? "usage" : undefined;
  const slug = kind && legend.codes[kind]?.[code];
  const locale = uiLanguagesFrom(languages).find((value): value is "en" | "es" => value === "en" || value === "es") ?? "en";
  if (kind === "pos" && /^v[24]/.test(code)) return locale === "es" ? "V. clásico" : "Classical";
  if (kind && specificLabels[`${kind}:${code}`]) return specificLabels[`${kind}:${code}`][locale];
  const label = slug && legend.terms[slug]?.[locale]?.label;
  const short = (slug && shortLabels[slug]?.[locale]) || label;
  if (short) return short;

  const stripped = full.replace(/\s*\([^)]*\)/g, "").replace(/\s+-\s.*$/, "").trim();
  const fallback = stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : code;
  return [...fallback].length <= 10 ? fallback : [...code].slice(0, 10).join("");
}

/** The text for one dictionary tag. Only English and Spanish are built in;
    hosts can replace the whole presentation when mapping API tags. */
export function tagPresentation(code: string, category: string, sourceLabel: string, languages: readonly GlossLanguage[], displayLocale?: TagDisplayLocale): TagPresentation {
  const presentationLanguages = displayLocale ? [displayLocale === "es" ? "spa" : "eng"] as const : languages;
  const kind: LegendKind | undefined = category === "partOfSpeech" || category === "pos" ? "pos"
    : category === "misc" ? "usage" : undefined;
  const term = kind ? legendTerm(code, kind, presentationLanguages) : null;
  const shortLabel = chipLabel(code, category === "pos" ? "partOfSpeech" : category, sourceLabel, presentationLanguages);
  return {
    shortLabel,
    fullLabel: term?.label ?? sourceLabel,
    ...(term ? { explanation: term.body, ...(term.example ? { example: term.example } : {}), ...(term.jp ? { jp: term.jp } : {}) } : {}),
  };
}

/** The entry explaining a JMdict code, in the first of the reader's languages
    that has one, or null where the book has nothing to say about it. */
export function legendTerm(code: string, kind: LegendKind, languages: readonly GlossLanguage[]): LegendTerm | null {
  const slug = legend.codes[kind]?.[code];
  if (!slug) return null;

  const translations = legend.terms[slug];
  if (!translations) return null;

  // English last, always: it is the language every entry is written in, so a
  // reader whose own language is missing an entry still gets an explanation.
  for (const locale of [ ...uiLanguagesFrom(languages), "en" ]) {
    const term = translations[locale];
    if (term) return term;
  }
  return null;
}
