// Gloss languages and their order: the extension's copy of the server's
// Locales module. Kept free of browser/storage imports so the dictionary engine
// (and its tests) can use it without a WebExtension environment.

// Gloss codes as packs store them (Locales::GLOSS_TO_DB values). The public pack
// ships English and Spanish; private overlays may carry any supported language.
export type GlossLanguage = "jpn" | "eng" | "spa" | "fre" | "ger" | "dut" | "rus" | "swe" | "hun" | "slv";

export const GLOSS_LABELS: Record<GlossLanguage, string> = {
  jpn: "日本語", eng: "English", spa: "Español", fre: "Français", ger: "Deutsch",
  dut: "Nederlands", rus: "Русский", swe: "Svenska", hun: "Magyar", slv: "Slovenščina",
};

// The tag that sits in front of a meaning when a word is glossed in more than
// one language. Two letters, because it repeats on every row of every sense and
// its whole job is to be skipped by the reader who only wants one of them.
export const GLOSS_TAGS: Record<GlossLanguage, string> = {
  jpn: "JA", eng: "EN", spa: "ES", fre: "FR", ger: "DE", dut: "NL", rus: "RU",
  swe: "SV", hun: "HU", slv: "SL",
};

// Locales::GLOSS_TO_DB.
const UI_TO_GLOSS: Record<string, GlossLanguage> = {
  ja: "jpn", en: "eng", es: "spa", fr: "fre", de: "ger", nl: "dut", ru: "rus",
  sv: "swe", hu: "hun", sl: "slv",
};
const GLOSS_TO_UI = Object.fromEntries(Object.entries(UI_TO_GLOSS).map(([ui, db]) => [db, ui])) as Record<GlossLanguage, string>;

// The account's ordered language stack (Prefs#languages, e.g. ["es","en"])
// mapped into pack codes, dropping languages this pack doesn't ship. Order is
// the whole point: it decides which meaning block renders first, exactly as
// Locales.source_stack_for does on the web.
export function glossLanguagesFrom(uiCodes: readonly string[]): GlossLanguage[] {
  const mapped = uiCodes.map((code) => UI_TO_GLOSS[code]).filter((code): code is GlossLanguage => !!code);
  return [...new Set(mapped)];
}

export function uiLanguagesFrom(glossCodes: readonly GlossLanguage[]): string[] {
  return [...new Set(glossCodes.map((code) => GLOSS_TO_UI[code]))];
}

// English is the last-resort gloss, mirroring Locales.with_english_fallback: a
// sense with no gloss in your languages still reads rather than rendering blank.
export function withEnglishFallback(languages: readonly GlossLanguage[]): GlossLanguage[] {
  return [...new Set([...languages, "eng" as const])];
}
