import type { Definition } from "./types.js";

/** Apply Shirabe's per-dictionary reveal setting to a card from any host. */
export function applyDictionaryReveal(definition: Definition, modes: Readonly<Record<string, "show" | "hover">>): Definition {
  const bySlug = Object.fromEntries(Object.entries(modes).map(([source, mode]) => [source.split(":", 1)[0], mode]));
  return {
    ...definition,
    senses: definition.senses.map((sense) => {
      const slug = sense.ref?.split("#", 1)[0] ?? sense.sourceEntry?.split(":", 1)[0];
      return { ...sense, covered: !!slug && bySlug[slug] === "hover" };
    }),
  };
}
