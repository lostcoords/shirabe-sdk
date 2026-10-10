import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
if (!input) throw new Error("Usage: node script/import-openapi.mjs CONTRACT");
const contract = readFileSync(input, "utf8").replace(/^( {2}x-logo:\r?\n {4}url:)[^\r\n]*/m, "$1 '%LOGO_URL%'");
const version = contract.match(/^info:\r?\n(?: {2}.*\r?\n)*? {2}version:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m)?.[1];
if (!version) throw new Error("The contract must declare a stable info.version");

const apiPath = "packages/api/package.json";
const cardPath = "packages/card/package.json";
const api = JSON.parse(readFileSync(apiPath, "utf8"));
const card = JSON.parse(readFileSync(cardPath, "utf8"));
if (card.dependencies["@shirabe-org/api"] !== api.version)
  throw new Error("The card dependency must match the current API version");

if (version !== api.version) {
  const previous = api.version.split(".").map(Number);
  const next = version.split(".").map(Number);
  const difference = next.map((part, index) => part - previous[index]).find((part) => part !== 0);
  if (!(difference > 0)) throw new Error("Refusing an older OpenAPI version");
  if (!/^\d+\.\d+\.\d+$/.test(card.version))
    throw new Error("Set a stable card version before importing a new API version");
  const [major, minor, patch] = card.version.split(".").map(Number);
  api.version = version;
  card.version = `${major}.${minor}.${patch + 1}`;
  card.dependencies["@shirabe-org/api"] = version;
  writeFileSync(apiPath, `${JSON.stringify(api, null, 2)}\n`);
  writeFileSync(cardPath, `${JSON.stringify(card, null, 2)}\n`);
}
writeFileSync("packages/api/openapi/shirabe.bundled.yaml", contract);
