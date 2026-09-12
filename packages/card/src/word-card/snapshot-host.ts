import { toDefinition } from "./api-host.js";
import type { ApiWordDetail } from "./api-types.js";
import type { CardToken, LookupContext, LookupFound, LookupResult, WordCardHost } from "./host.js";
import type { GlossLanguage } from "./types.js";
import { glossLanguagesFrom, uiLanguagesFrom } from "./languages.js";
import { isR2AudioUrl, isSnapshotRecordingFilename } from "./audio.js";

export const MAX_SNAPSHOT_BYTES = 128 * 1024;
export const SNAPSHOT_FORMAT_VERSION = 1;
const MAX_TEXT_UNITS = 4096;
const MAX_TOKENS = 128;
const MAX_ENTRY_BYTES = 24 * 1024;
const MAX_RECORDING_BYTES = 1024 * 1024;
const MEDIA_NAME = /^_shirabe_snapshot_v(?:1|2)_([a-f0-9]{64})\.json$/;
const encoder = new TextEncoder();

export type SnapshotRecording = {
  filename: string;
  sha256: string;
  bytes: number;
  mimeType: "audio/mp4" | "audio/mpeg";
  attribution: "Shirabe";
  license: "Permitted for Anki deck synchronization and export";
};
type SnapshotCandidate = Omit<ApiWordDetail, "pitch"> & {
  pitch: Array<ApiWordDetail["pitch"][number] & { recording?: SnapshotRecording }>;
};
export type SnapshotResult = { tokenIndex: number; candidates: SnapshotCandidate[] };
export type SnapshotSegment = { text: string; contentHash: string; tokens: CardToken[]; results: SnapshotResult[] };
export type PreparedSnapshot = {
  formatVersion: 1;
  contentVersion: string;
  createdAt: number;
  complete: boolean;
  preferences?: { languages: string[]; dictionaryReveal: Record<string, "show" | "hover"> };
  sources?: Array<{ slug: string; name: string; attribution?: string | null; source?: { name?: string; url?: string; license?: string; licenseUrl?: string } | null }>;
  segments: SnapshotSegment[];
};

/** Dictionary versions, order and locale must identify the same contentVersion.
 * Only exact visible-side texts may activate snapshot results. Create a fresh
 * host for each card side; supplying a fallback permits online misses.
 */
export type SnapshotHostOptions = {
  contentVersion: string;
  apiBase: string;
  languages?: GlossLanguage[];
  texts?: readonly string[];
  fetch?: typeof globalThis.fetch;
};

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotate = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** SHA-256 of UTF-8 text, also available in reviewer origins without Web Crypto. */
export function snapshotHash(text: string): string {
  return hashBytes(encoder.encode(text));
}

function hashBytes(bytes: Uint8Array): string {
  const data = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(data.length - 4, bytes.length * 8);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!, y = w[i - 2]!;
      w[i] = w[i - 16]! + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + w[i - 7]! + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = Array.from(hash);
    for (let i = 0; i < 64; i++) {
      const t1 = h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!;
      const t2 = (rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    for (const [i, word] of [a, b, c, d, e, f, g, h].entries()) hash[i] += word;
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

type Reader = (value: unknown) => unknown;
type Shape = Reader | { [key: string]: Shape };
function bounded(value: unknown, remaining: number, depth = 0): number {
  if (remaining < 0 || depth > 16) throw new Error("Snapshot data exceeds its limit");
  if (typeof value === "string") {
    if (value.length > remaining) throw new Error("Snapshot text exceeds its limit");
    remaining -= encoder.encode(JSON.stringify(value)).length;
  } else if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      if (value.length > remaining / 2) throw new Error("Snapshot array exceeds its limit");
      remaining -= 2;
      for (const [index, item] of value.entries()) remaining = bounded(item, remaining - Number(index > 0), depth + 1);
    } else {
      remaining -= 2;
      let first = true;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        remaining = bounded(key, remaining - Number(!first), depth + 1);
        first = false;
        remaining = bounded((value as Record<string, unknown>)[key], remaining - 1, depth + 1);
      }
    }
  } else if (value === null || typeof value === "boolean" || typeof value === "number") remaining -= JSON.stringify(value).length;
  else throw new Error("Invalid snapshot value");
  if (remaining < 0) throw new Error("Snapshot data exceeds its limit");
  return remaining;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid snapshot object");
  return value as Record<string, unknown>;
}
const string = (max = 512): Reader => (value) => {
  if (typeof value !== "string" || value.length > max || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error("Invalid snapshot text");
  return value;
};
const integer: Reader = (value) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid snapshot number");
  return value;
};
const number = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid snapshot number");
  return value;
};
const boolean: Reader = (value) => {
  if (typeof value !== "boolean") throw new Error("Invalid snapshot boolean");
  return value;
};
const nullable = (shape: Shape): Reader => (value) => value === null ? null : clean(shape, value);
const array = (shape: Shape, max: number): Reader => (value) => {
  if (!Array.isArray(value) || value.length > max) throw new Error("Snapshot array exceeds its limit");
  return value.map((item) => clean(shape, item));
};
function clean(shape: Shape, value: unknown): unknown {
  if (typeof shape === "function") return shape(value);
  const raw = record(value);
  const out: Record<string, unknown> = {};
  for (const [field, reader] of Object.entries(shape)) {
    const key = field.replace(/\?$/, "");
    if (field.endsWith("?") && !Object.hasOwn(raw, key)) continue;
    out[key] = clean(reader, raw[key]);
  }
  return out;
}
const TAG: Shape = { category: string(), code: string(), label: string(), "scope?": string() };
const SOURCE_TAG: Shape = { name: string(), category: string(), "notes?": string(2048), order: number, score: number };
const PITCH: Reader = (value) => {
  const pitch = clean({ downstep: integer, pattern: string() }, value) as SnapshotCandidate["pitch"][number];
  try {
    const raw = record(record(value).recording);
    if (isSnapshotRecordingFilename(raw.filename) && raw.sha256 === raw.filename.slice(8, 72)
      && Number.isSafeInteger(raw.bytes) && (raw.bytes as number) > 0 && (raw.bytes as number) <= MAX_RECORDING_BYTES
      && raw.mimeType === (raw.filename.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg")
      && raw.attribution === "Shirabe" && raw.license === "Permitted for Anki deck synchronization and export") {
      pitch.recording = { filename: raw.filename, sha256: raw.sha256 as string, bytes: raw.bytes as number,
        mimeType: raw.filename.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg", attribution: raw.attribution, license: raw.license };
    }
  } catch {}
  return pitch;
};
const CROSS_REFERENCE: Shape = { text: string(2048), "reading?": nullable(string(2048)), "label?": string(256) };
const CANDIDATE: Shape = {
  id: string(), dictionary: string(), sourceId: string(), headword: string(),
  "reading?": nullable(string()), common: boolean, "name?": boolean,
  "jlpt?": nullable(string()), "frequency?": nullable(integer),
  "furigana?": array({ text: string(), "ruby?": string() }, 64),
  pitch: array(PITCH, 32),
  forms: array({ text: string(), script: string(), common: boolean, "tags?": array(TAG, 32) }, 64),
  entries: array({
    order: integer, dictionary: string(), "dictionaryName?": string(), type: string(), sourceId: string(),
    "sourceHeadwords?": array({ text: string(), reading: string(), tags: array(SOURCE_TAG, 32), rules: array(string(128), 16), score: number }, 128),
    senses: array({
      position: integer, "depth?": integer, "label?": string(),
      definitions: array({ lang: string(), text: string(4096), "title?": string(2048) }, 32),
      "usages?": array({ lang: string(), text: string(4096), "title?": string(2048) }, 32),
      tags: array(TAG, 32), "sourceTags?": array(SOURCE_TAG, 128), "notes?": array(string(2048), 16),
      "related?": array(CROSS_REFERENCE, 32), "antonyms?": array(CROSS_REFERENCE, 32), "seeAlso?": array(CROSS_REFERENCE, 32),
    }, 64),
  }, 16),
  "examples?": array({ japanese: string(2048), "translations?": array({ lang: string(), text: string(2048) }, 8) }, 8),
};
const TOKEN: Shape = {
  surface: string(), start: integer, length: integer, "entry?": string(),
  "lemma?": string(), "reading?": string(), "pos?": string(), "content?": boolean,
  "inflection?": array(string(128), 16), "inflectionBase?": string(),
};
const REVEAL: Reader = (value) => {
  const entries = Object.entries(record(value));
  if (entries.length > 128) throw new Error("Invalid dictionary reveal preferences");
  return Object.fromEntries(entries.map(([key, mode]) => {
    string()(key);
    if (mode !== "show" && mode !== "hover") throw new Error("Invalid dictionary reveal mode");
    return [key, mode];
  }));
};
const PREFERENCES: Shape = { languages: array(string(), 32), dictionaryReveal: REVEAL };
const SOURCE: Shape = {
  slug: string(), name: string(), "attribution?": nullable(string(4096)),
  "source?": nullable({ "name?": string(), "url?": string(), "license?": string(), "licenseUrl?": string() }),
};

function segment(value: unknown): SnapshotSegment {
  const raw = record(value);
  const text = string(MAX_TEXT_UNITS)(raw.text) as string;
  if (snapshotHash(text) !== raw.contentHash) throw new Error("Snapshot hash does not match");
  const tokens = array(TOKEN, MAX_TOKENS)(raw.tokens) as CardToken[];
  let end = 0;
  for (const token of tokens) {
    if (!token.length || token.length !== token.surface.length || token.start < end || text.slice(token.start, token.start + token.length) !== token.surface) throw new Error("Snapshot offsets do not match");
    end = token.start + token.length;
  }
  if (!Array.isArray(raw.results) || raw.results.length > MAX_TOKENS) throw new Error("Invalid snapshot results");
  const results: SnapshotResult[] = [];
  for (const value of raw.results) {
    try {
      const raw = record(value);
      const tokenIndex = integer(raw.tokenIndex) as number;
      if (tokenIndex >= tokens.length || results.some((r) => r.tokenIndex === tokenIndex)) continue;
      const candidates = array(CANDIDATE, 3)(raw.candidates) as SnapshotCandidate[];
      if (candidates.some((c) => !c.entries.length || encoder.encode(JSON.stringify(c)).length > MAX_ENTRY_BYTES)) continue;
      results.push({ tokenIndex, candidates });
    } catch { continue; }
  }
  return { text, contentHash: raw.contentHash as string, tokens, results };
}

/** Unknown, oversized or malformed data is a cache miss. Unknown fields never survive. */
export function validateSnapshot(value: unknown): PreparedSnapshot | null {
  try {
    if (typeof value === "string") {
      if (value.length > MAX_SNAPSHOT_BYTES || encoder.encode(value).length > MAX_SNAPSHOT_BYTES) return null;
      value = JSON.parse(value);
    }
    bounded(value, MAX_SNAPSHOT_BYTES);
    const raw = record(value);
    if (raw.formatVersion !== SNAPSHOT_FORMAT_VERSION) return null;
    const contentVersion = string(128)(raw.contentVersion) as string;
    const createdAt = integer(raw.createdAt) as number;
    if (!contentVersion || !Array.isArray(raw.segments) || raw.segments.length > 16) return null;
    const segments: SnapshotSegment[] = [];
    let units = 0, tokens = 0;
    for (const value of raw.segments) {
      let parsed: SnapshotSegment;
      try { parsed = segment(value); } catch { continue; }
      units += parsed.text.length;
      tokens += parsed.tokens.length;
      if (units > MAX_TEXT_UNITS || tokens > MAX_TOKENS || segments.some((s) => s.text === parsed.text)) return null;
      segments.push(parsed);
    }
    const pitches = segments.flatMap((s) => s.results.flatMap((r) => r.candidates.flatMap((c) => c.pitch)));
    const recordings = new Map<string, SnapshotRecording>();
    let conflicting = false;
    for (const { recording } of pitches) {
      if (!recording) continue;
      const previous = recordings.get(recording.filename);
      if (previous && JSON.stringify(previous) !== JSON.stringify(recording)) conflicting = true;
      recordings.set(recording.filename, recording);
    }
    if (conflicting || recordings.size > 16 || [...recordings.values()].reduce((sum, r) => sum + r.bytes, 0) > 4 * MAX_RECORDING_BYTES) {
      for (const pitch of pitches) delete pitch.recording;
    }
    const complete = raw.complete === true && segments.length === raw.segments.length && segments.every((s) =>
      s.tokens.every((t, i) => t.content === false || s.results.some((r) =>
        r.tokenIndex === i && (!t.entry || r.candidates.some((c) => `${c.dictionary}:${c.sourceId}` === t.entry)))));
    const out: PreparedSnapshot = { formatVersion: 1, contentVersion, createdAt, segments, complete };
    if (Object.hasOwn(raw, "preferences")) out.preferences = clean(PREFERENCES, raw.preferences) as PreparedSnapshot["preferences"];
    if (Object.hasOwn(raw, "sources")) out.sources = array(SOURCE, 128)(raw.sources) as PreparedSnapshot["sources"];
    return encoder.encode(JSON.stringify(out)).length <= MAX_SNAPSHOT_BYTES ? out : null;
  } catch { return null; }
}

async function readSnapshotStream(stream: ReadableStream<Uint8Array>, maximum: number, controller: AbortController): Promise<Uint8Array> {
  const reader = stream.getReader();
  const bytes = new Uint8Array(maximum);
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  controller.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (controller.signal.aborted) throw new Error("Snapshot loading was cancelled");
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw new Error("Snapshot loading was cancelled");
      if (done) return bytes.subarray(0, size);
      if (value.length > maximum - size) throw new Error("Snapshot data exceeds its limit");
      bytes.set(value, size);
      size += value.length;
    }
  } catch (error) {
    if (controller.signal.aborted) cancel();
    else controller.abort();
    throw error;
  } finally {
    controller.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function decompressSnapshot(value: string, controller: AbortController): Promise<PreparedSnapshot | null> {
  const envelope = record(JSON.parse(value));
  bounded(envelope, MAX_SNAPSHOT_BYTES);
  if (envelope.formatVersion !== 2 || envelope.encoding !== "gzip-base64") return null;
  const decodedBytes = integer(envelope.decodedBytes) as number;
  const encoded = string(MAX_SNAPSHOT_BYTES)(envelope.data) as string;
  if (!decodedBytes || decodedBytes > MAX_SNAPSHOT_BYTES || !encoded || typeof DecompressionStream !== "function") return null;
  const binary = atob(encoded);
  if (btoa(binary) !== encoded) return null;
  const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const bytes = await readSnapshotStream(stream, decodedBytes, controller);
  if (bytes.length !== decodedBytes) return null;
  return validateSnapshot(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Load a filename from ShirabeLookup as data, bounded before JSON parsing. */
export async function loadSnapshot(filename: string, options: { fetch?: typeof globalThis.fetch } = {}): Promise<PreparedSnapshot | null> {
  const match = typeof filename === "string" && MEDIA_NAME.exec(filename);
  if (!match) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(filename, { credentials: "same-origin", redirect: "error", signal: controller.signal });
    if (!response.ok || !response.body) return null;
    if (Number(response.headers.get("content-length")) > MAX_SNAPSHOT_BYTES) { controller.abort(); return null; }
    const bytes = await readSnapshotStream(response.body, MAX_SNAPSHOT_BYTES, controller);
    if (hashBytes(bytes) !== match[1]) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return filename.startsWith("_shirabe_snapshot_v1_") ? validateSnapshot(text) : await decompressSnapshot(text, controller);
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

const missing = (): LookupResult => ({ status: "failed", message: "Offline data is unavailable for this text. Connect to look it up." });
const missingRecording = () => ({ error: "Couldn't load saved pronunciation. Sync media or prepare this card again." });

async function loadRecording(recording: SnapshotRecording, fetcher: typeof globalThis.fetch): Promise<{ dataUrl: string } | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(recording.filename, { credentials: "same-origin", redirect: "error", signal: controller.signal });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > recording.bytes) {
      controller.abort();
      return missingRecording();
    }
    const bytes = new Uint8Array(recording.bytes);
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.length > bytes.length) { controller.abort(); await reader.cancel(); return missingRecording(); }
        bytes.set(value, size);
        size += value.length;
      }
    } finally { reader.releaseLock(); }
    if (size !== recording.bytes || hashBytes(bytes) !== recording.sha256) return missingRecording();
    const mp3 = bytes.length > 2 && (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 || String.fromCharCode(...bytes.subarray(0, 3)) === "ID3");
    const boxSize = bytes.length >= 16 ? new DataView(bytes.buffer).getUint32(0) : 0;
    const m4a = boxSize >= 16 && boxSize <= bytes.length - 8 && boxSize % 4 === 0
      && String.fromCharCode(...bytes.subarray(4, 12)) === "ftypM4A ";
    if (!(recording.mimeType === "audio/mp4" ? m4a : mp3)) return missingRecording();
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { dataUrl: `data:${recording.mimeType};base64,${btoa(binary)}` };
  } catch { return missingRecording(); }
  finally { clearTimeout(timeout); }
}

/** Wrap an optional permitted online host. Snapshots never supply study state. */
export function snapshotHost(fallback: WordCardHost | undefined, snapshot: unknown, options: SnapshotHostOptions): WordCardHost {
  const parsed = validateSnapshot(snapshot);
  const segments = parsed?.contentVersion === options.contentVersion ? parsed.segments : [];
  const active = new Set<SnapshotSegment>();
  const playable = new Map<string, SnapshotRecording>();
  const clips = new Map<string, ReturnType<typeof loadRecording>>();
  const allowed = options.texts ? new Set(options.texts) : undefined;
  function activate(text: string): SnapshotSegment | undefined {
    if (allowed && !allowed.has(text)) return;
    const found = segments.find((s) => s.text === text);
    if (found) active.add(found);
    return found;
  }
  for (const text of options.texts ?? []) activate(text);
  const savedLanguages = parsed?.preferences && glossLanguagesFrom(parsed.preferences.languages);
  const languages = savedLanguages?.length ? savedLanguages : options.languages ?? ["eng"];
  const exampleNotice = parsed?.sources?.find((source) => source.slug === "tatoeba");
  const [attribution, ...references] = exampleNotice?.attribution?.split(/\r?\n/) ?? [];
  const exampleSource = exampleNotice && {
    source: [attribution || exampleNotice.name,
      !attribution?.includes(exampleNotice.source?.license ?? "") ? exampleNotice.source?.license : null].filter(Boolean).join(" · "),
    reference: ["Sources saved with this card:", ...new Set([
      ...references, exampleNotice.source?.name, exampleNotice.source?.url,
      exampleNotice.source?.license, exampleNotice.source?.licenseUrl,
    ].filter(Boolean))].join("\n"),
  };
  function result(candidates: SnapshotCandidate[], token?: CardToken, selected = candidates[0]): LookupFound {
    const definition = selected ? toDefinition(JSON.parse(JSON.stringify(selected)), options.apiBase.replace(/\/$/, ""), languages) : null;
    if (definition) {
      definition.offline = true;
      definition.preparedAt = parsed!.createdAt;
      if (exampleSource) definition.examples = definition.examples.map((example, index) => {
        const translations = selected!.examples?.[index]?.translations ?? [];
        const language = example.translation && uiLanguagesFrom(languages).find((language) =>
          translations.some((translation) => translation.lang === language && translation.text === example.translation));
        return { ...example, ...exampleSource, ...(language ? { translationLanguage: language } : {}) };
      });
      definition.pitch = selected!.pitch.map((pitch) => {
        if (pitch.recording && selected!.reading) playable.set(pitch.recording.filename, pitch.recording);
        return { downstep: pitch.downstep, audioUrl: selected!.reading ? pitch.recording?.filename ?? null : null };
      });
      if (token?.inflection?.length) {
        definition.sourceForm = token.surface;
        definition.inflection = [...token.inflection];
        definition.inflectionBase = token.inflectionBase;
      }
      definition.senses = definition.senses.map((sense) => {
        const slug = sense.ref?.split("#")[0];
        const covered = !!slug && Object.entries(parsed?.preferences?.dictionaryReveal ?? {}).some(([source, mode]) => source.split(":")[0] === slug && mode === "hover");
        return { ...sense, covered };
      });
    }
    return {
      status: "found",
      definition,
      candidates: candidates.map((c) => ({ entry: `${c.dictionary}:${c.sourceId}`, headword: c.headword, reading: c.reading ?? null, common: c.common })),
    };
  }
  function matches(token: CardToken, query: string, context?: LookupContext): boolean {
    return (token.lemma ?? token.surface) === query
      && (!context?.surface || token.surface === context.surface)
      && (!context?.reading || token.reading === context.reading)
      && (!context?.pos || token.pos === context.pos);
  }
  const host: WordCardHost = {
    audio: {
      async clip(url) {
        if (isR2AudioUrl(url) && fallback) return fallback.audio ? fallback.audio.clip(url) : { dataUrl: url };
        const recording = playable.get(url);
        if (!recording) return missingRecording();
        let pending = clips.get(url);
        if (!pending) {
          pending = loadRecording(recording, options.fetch ?? globalThis.fetch);
          clips.set(url, pending);
        }
        const clip = await pending;
        if ("error" in clip) clips.delete(url);
        return clip;
      },
    },
    async tokenize(text) {
      const prepared = activate(text);
      if (prepared) return prepared.tokens.map((t) => ({ ...t, ...(t.inflection ? { inflection: [...t.inflection] } : {}) }));
      if (fallback?.tokenize) return fallback.tokenize(text);
      throw new Error("Offline token spans are unavailable for this text");
    },
    async lookup(query, kind, context) {
      playable.clear();
      const hits: { result: SnapshotResult; token: CardToken }[] = [];
      for (const s of active) {
        const first = kind === "text" && s.text === query ? s.tokens.findIndex((t) => t.content !== false) : -1;
        for (const r of s.results) {
          const token = s.tokens[r.tokenIndex]!;
          if (token.content !== false && (kind === "text" ? r.tokenIndex === first : matches(token, query, context))) hits.push({ result: r, token });
        }
      }
      const candidateIdentity = (candidate: SnapshotCandidate) => JSON.stringify({
        ...candidate, pitch: candidate.pitch.map(({ downstep, pattern }) => ({ downstep, pattern })),
      });
      const identity = ({ result, token }: typeof hits[number]) => JSON.stringify({
        candidates: result.candidates.map(candidateIdentity),
        inflection: token.inflection, inflectionBase: token.inflectionBase,
        source: token.inflection?.length ? token.surface : undefined,
      });
      if (hits.length && hits.every((hit) => identity(hit) === identity(hits[0]!))) return result(hits[0]!.result.candidates, hits[0]!.token);
      if (hits.length) {
        const richest = hits.reduce((a, b) => a.result.candidates.length >= b.result.candidates.length ? a : b);
        const candidates = richest.result.candidates;
        const entries = candidates.map((candidate) => `${candidate.dictionary}:${candidate.sourceId}`);
        const ordered = candidates.map(candidateIdentity);
        const queryIdentity = (token: CardToken) => JSON.stringify({
          query: token.lemma ?? token.surface, surface: token.surface, reading: token.reading,
          pos: token.pos, entry: token.entry, inflection: token.inflection, inflectionBase: token.inflectionBase,
        });
        const query = queryIdentity(richest.token);
        if (new Set(entries).size === entries.length && hits.every((hit) => {
          if (!hit.result.candidates.length || queryIdentity(hit.token) !== query) return false;
          const first = hit.result.candidates[0]!;
          if (!hit.token.entry && `${first.dictionary}:${first.sourceId}` !== entries[0]) return false;
          const subset = hit.result.candidates.map(candidateIdentity);
          let index = 0;
          for (const candidate of ordered) if (candidate === subset[index]) index++;
          return index === subset.length;
        })) return result(candidates, richest.token);
      }
      return fallback ? fallback.lookup(query, kind, context) : missing();
    },
    async lookupEntry(entry, surface) {
      playable.clear();
      for (const s of active) {
        for (const r of s.results) {
          const token = s.tokens[r.tokenIndex]!;
          const candidate = r.candidates.find((c) => `${c.dictionary}:${c.sourceId}` === entry && [token.surface, token.lemma, c.headword].includes(surface));
          if (candidate) return result(r.candidates, token.surface === surface ? token : undefined, candidate);
        }
      }
      return fallback ? fallback.lookupEntry(entry, surface) : missing();
    },
  };
  return new Proxy(host, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      if (!fallback) return undefined;
      const value = Reflect.get(fallback, property, fallback);
      return typeof value === "function" ? value.bind(fallback) : value;
    },
    has(target, property) {
      return Reflect.has(target, property) || !!fallback && Reflect.has(fallback, property);
    },
  });
}
