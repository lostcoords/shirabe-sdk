import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function normalizeContract(contract) {
  return contract.replace(/^( {2}x-logo:\r?\n {4}url:)[^\r\n]*/m, "$1 '%LOGO_URL%'");
}

export function contractVersion(contract) {
  const version = contract.match(/^info:\r?\n(?: {2}.*\r?\n)*? {2}version:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m)?.[1];
  if (!version) throw new Error("The contract must declare a stable info.version");
  return version;
}

export function contractVersions(contract, api, card) {
  const version = contractVersion(contract);
  if (card.dependencies["@shirabe-org/api"] !== api.version)
    throw new Error("The card dependency must match the current API version");
  if (version === api.version) return { api_version: api.version, card_version: card.version };
  const difference = version.split(".").map((part, index) => Number(part) - Number(api.version.split(".")[index])).find((part) => part !== 0);
  if (!(difference > 0)) throw new Error("Refusing an older OpenAPI version");
  if (!/^\d+\.\d+\.\d+$/.test(card.version))
    throw new Error("Set a stable card version before importing a new API version");
  const [major, minor, patch] = card.version.split(".").map(Number);
  return { api_version: version, card_version: `${major}.${minor}.${patch + 1}` };
}

export function importContract(input) {
  const contract = normalizeContract(readFileSync(input, "utf8"));
  const apiPath = "packages/api/package.json";
  const cardPath = "packages/card/package.json";
  const api = JSON.parse(readFileSync(apiPath, "utf8"));
  const card = JSON.parse(readFileSync(cardPath, "utf8"));
  const versions = contractVersions(contract, api, card);
  if (versions.api_version !== api.version) {
    api.version = versions.api_version;
    card.version = versions.card_version;
    card.dependencies["@shirabe-org/api"] = versions.api_version;
    writeFileSync(apiPath, `${JSON.stringify(api, null, 2)}\n`);
    writeFileSync(cardPath, `${JSON.stringify(card, null, 2)}\n`);
  }
  writeFileSync("packages/api/openapi/shirabe.bundled.yaml", contract);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: node script/import-openapi.mjs CONTRACT");
  importContract(input);
}
