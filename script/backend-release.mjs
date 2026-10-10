import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeContract, contractVersions } from "./import-openapi.mjs";

export function releaseSource(eventName, event) {
  if (!["repository_dispatch", "workflow_dispatch"].includes(eventName))
    throw new Error("Expected a backend release dispatch");
  if (eventName === "repository_dispatch" && event.action !== "backend_release")
    throw new Error("Expected backend_release");
  const sha = (eventName === "repository_dispatch" ? event.client_payload : event.inputs)?.backend_sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha))
    throw new Error("backend_sha must be a full lowercase commit SHA");
  return {
    backend_sha: sha,
    spec_url: `https://api.github.com/repos/lostcoords/shirabe/contents/openapi/dist/shirabe.bundled.yaml?ref=${sha}`,
  };
}

export function releaseVersions(contract, currentContract, api, card) {
  const versions = contractVersions(contract, api, card);
  if (versions.api_version === api.version && normalizeContract(contract) !== normalizeContract(currentContract))
    throw new Error("The contract changed without an info.version bump");
  return versions;
}

export async function publishedVersion(name, version, fetcher = fetch, apiVersion) {
  const response = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Cannot check ${name}@${version}: HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.version !== version) throw new Error(`Registry returned the wrong version for ${name}@${version}`);
  if (apiVersion && manifest.dependencies?.["@shirabe-org/api"] !== apiVersion)
    throw new Error(`${name}@${version} is already published with a different API dependency`);
  return true;
}

export async function prepareRelease(eventName, event, { root = ".", sourceToken, fetcher = fetch, run = execFileSync } = {}) {
  const source = releaseSource(eventName, event);
  if (!sourceToken) throw new Error("SHIRABE_SOURCE_TOKEN is required to read the private Shirabe contract");
  const response = await fetcher(source.spec_url, {
    headers: { Accept: "application/vnd.github.raw+json", Authorization: `Bearer ${sourceToken}` },
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Cannot fetch the released contract: HTTP ${response.status}`);
  const contract = await response.text();
  const api = JSON.parse(readFileSync(join(root, "packages/api/package.json"), "utf8"));
  const card = JSON.parse(readFileSync(join(root, "packages/card/package.json"), "utf8"));
  const currentContract = readFileSync(join(root, "packages/api/openapi/shirabe.bundled.yaml"), "utf8");
  const versions = releaseVersions(contract, currentContract, api, card);
  const apiPublished = await publishedVersion("@shirabe-org/api", versions.api_version, fetcher);
  const cardPublished = await publishedVersion("@shirabe-org/card", versions.card_version, fetcher, versions.api_version);
  const skip = apiPublished && cardPublished;
  if (!skip) {
    const temporary = mkdtempSync(join(tmpdir(), "shirabe-backend-release-"));
    try {
      const input = join(temporary, "openapi.yaml");
      writeFileSync(input, contract);
      run("script/update-openapi", [input], { cwd: root, stdio: "inherit" });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  return { ...source, ...versions, skip: String(skip) };
}

export async function waitForPackages(apiVersion, cardVersion, { fetcher = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 30 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await publishedVersion("@shirabe-org/api", apiVersion, fetcher) &&
        (!cardVersion || await publishedVersion("@shirabe-org/card", cardVersion, fetcher, apiVersion))) return;
    if (attempt + 1 < attempts) await sleep(10_000);
  }
  throw new Error("Published packages did not become available within five minutes");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "wait") {
    await waitForPackages(process.argv[3], process.argv[4]);
  } else if (process.argv.length === 2) {
    if (process.env.GITHUB_REF !== "refs/heads/main") throw new Error("Backend releases must run from main");
    const result = await prepareRelease(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")), { sourceToken: process.env.SHIRABE_SOURCE_TOKEN });
    for (const [name, value] of Object.entries(result)) {
      console.log(`${name}=${value}`);
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
  } else {
    throw new Error("Usage: node script/backend-release.mjs [wait API_VERSION CARD_VERSION]");
  }
}
