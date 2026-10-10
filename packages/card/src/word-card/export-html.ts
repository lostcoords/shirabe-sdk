import type { Sense } from "./types.js";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function className(prefix: string, part: string): string {
  if (!/^[a-z][a-z0-9-]*$/i.test(prefix)) throw new Error("Invalid HTML class prefix");
  return `${prefix}-${part}`;
}

export function renderDefinitionHtml(senses: readonly Sense[], classPrefix: string): string {
  if (!senses.length) return "";
  const name = (part: string) => className(classPrefix, part);
  return `<ol class="${name("senses")}">${senses.map((sense) => {
    const tags = [...sense.partsOfSpeech, ...sense.tags].map((tag) => escapeHtml(tag.label)).join(", ");
    const usages = (sense.usages ?? []).map((usage) =>
      `<div class="${name("usage")}">${usage.title ? `<small class="${name("gloss-title")}">${escapeHtml(usage.title)}</small>` : ""}${escapeHtml(usage.text)}</div>`).join("");
    const notes = (sense.notes ?? []).map((note) => `<div class="${name("sense-note")}">${escapeHtml(note)}</div>`).join("");
    return `<li class="${name("sense")}">${tags ? `<small class="${name("pos")}">${tags}</small> ` : ""}<div class="${name("gloss")}">${glossHtml(sense.glosses, name)}</div>${usages}${notes}</li>`;
  }).join("")}</ol>`;
}

function glossHtml(glosses: Sense["glosses"], name: (part: string) => string): string {
  const tagged = new Set(glosses.map((gloss) => gloss.lang)).size > 1;
  const rows: string[] = [];
  for (let start = 0; start < glosses.length;) {
    let end = start + 1;
    while (end < glosses.length && glosses[end]!.lang === glosses[start]!.lang) end += 1;
    const group = glosses.slice(start, end);
    const stacked = group[0]!.lang === "jpn" || group.some((gloss) => gloss.title);
    const items = group.map((gloss) => {
      const text = `${gloss.title ? `<small class="${name("gloss-title")}">${escapeHtml(gloss.title)}</small>` : ""}${escapeHtml(gloss.text)}`;
      return stacked ? `<div class="${name("gloss-item")}">${text}</div>` : text;
    });
    const label = tagged ? `<small class="${name("gloss-lang")}">${escapeHtml(group[0]!.tag)}</small>` : "";
    rows.push(`<div class="${name("gloss-row")}">${label}${items.join(stacked ? "" : "; ")}</div>`);
    start = end;
  }
  return rows.join("");
}

const SMALL_KANA = "ゃゅょャュョぁぃぅぇぉァィゥェォ";

function pitchMorae(reading: string, downstep: number): Array<{ text: string; high: boolean; drop: boolean }> {
  const morae: string[] = [];
  for (const character of reading) {
    const previous = morae.at(-1);
    if (previous && SMALL_KANA.includes(character)) morae[morae.length - 1] = previous + character;
    else morae.push(character);
  }
  const high = (index: number) =>
    downstep === 0 ? index > 0 : downstep === 1 ? index === 0 : index > 0 && index < downstep;
  return morae.map((text, index) => ({ text, high: high(index), drop: high(index) && !high(index + 1) }));
}

export function pitchCategory(reading: string, downstep: number): "heiban" | "atamadaka" | "nakadaka" | "odaka" {
  if (downstep === 0) return "heiban";
  if (downstep === 1) return "atamadaka";
  return downstep >= pitchMorae(reading, downstep).length ? "odaka" : "nakadaka";
}

export function renderPitchHtml(reading: string, downstep: number, classPrefix: string): string {
  const morae = pitchMorae(reading, downstep);
  if (!morae.length) return "";
  const name = (part: string) => className(classPrefix, part);
  return `<span class="${name("pitch")}">${morae.map((mora) =>
    `<span class="${name("mora")}${mora.high ? ` ${name("mora--high")}` : ""}${mora.drop ? ` ${name("mora--drop")}` : ""}">${escapeHtml(mora.text)}</span>`
  ).join("")}<span class="${name("downstep")}">[${downstep}]</span></span>`;
}
