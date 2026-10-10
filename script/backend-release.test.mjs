import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareRelease, publishedVersion, releaseSource, releaseVersions, waitForPackages } from "./backend-release.mjs";

const sha = "a".repeat(40);
const event = { action: "backend_release", client_payload: { backend_sha: sha } };
const contract = (version, extra = "") => `openapi: 3.1.0\ninfo:\n  version: ${version}\n${extra}`;
const api = { version: "0.6.1" };
const card = { version: "0.1.2", dependencies: { "@shirabe-org/api": "0.6.1" } };

test("dispatch and manual retries fetch only the fixed repository at an immutable SHA", () => {
  const source = releaseSource("repository_dispatch", event);
  assert.equal(source.spec_url, `https://api.github.com/repos/lostcoords/shirabe/contents/openapi/dist/shirabe.bundled.yaml?ref=${sha}`);
  assert.deepEqual(releaseSource("workflow_dispatch", { inputs: { backend_sha: sha } }), source);
  assert.throws(() => releaseSource("push", event), /dispatch/);
  assert.throws(() => releaseSource("repository_dispatch", { ...event, action: "other" }), /backend_release/);
  for (const backend_sha of [undefined, "main", "a".repeat(39), "A".repeat(40), `${sha}\n`, `${sha}; echo unsafe`, {}]) {
    assert.throws(() => releaseSource("repository_dispatch", { ...event, client_payload: { backend_sha } }), /full lowercase commit SHA/);
  }
});

test("new stable spec versions bump API and the card dependency patch exactly once", () => {
  assert.deepEqual(releaseVersions(contract("0.7.0"), contract("0.6.1"), api, card), { api_version: "0.7.0", card_version: "0.1.3" });
  assert.deepEqual(releaseVersions(contract("0.6.1"), contract("0.6.1"), api, card), { api_version: "0.6.1", card_version: "0.1.2" });
  assert.throws(() => releaseVersions(contract("0.5.0"), contract("0.6.1"), api, card), /older/);
  assert.throws(() => releaseVersions(contract("0.7.0-beta.1"), contract("0.6.1"), api, card), /stable/);
  assert.throws(() => releaseVersions(contract("0.7.0"), contract("0.6.1"), api, { ...card, dependencies: { "@shirabe-org/api": "0.5.0" } }), /dependency/);
});

test("same-version contract changes cannot silently skip or publish, but deployed logos are normalized", () => {
  assert.throws(() => releaseVersions(contract("0.6.1", "paths: {}\n"), contract("0.6.1"), api, card), /info.version bump/);
  const withLogo = (url) => contract("0.6.1", `  x-logo:\n    url: '${url}'\n`);
  assert.deepEqual(releaseVersions(withLogo("https://shirabe.org/assets/logo.webp"), withLogo("%LOGO_URL%"), api, card), { api_version: "0.6.1", card_version: "0.1.2" });
});

test("only a registry 404 means unpublished; auth, server errors and wrong versions fail closed", async () => {
  assert.equal(await publishedVersion("@shirabe-org/api", "0.6.1", async () => new Response("", { status: 404 })), false);
  assert.equal(await publishedVersion("@shirabe-org/api", "0.6.1", async () => Response.json({ version: "0.6.1" })), true);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(publishedVersion("@shirabe-org/api", "0.6.1", async () => new Response("", { status })), /Cannot check/);
  }
  await assert.rejects(publishedVersion("@shirabe-org/api", "0.6.1", async () => Response.json({ version: "0.6.0" })), /wrong version/);
});

async function fixture(runTest) {
  const root = mkdtempSync(join(tmpdir(), "shirabe-release-test-"));
  try {
    mkdirSync(join(root, "packages/api/openapi"), { recursive: true });
    mkdirSync(join(root, "packages/card"), { recursive: true });
    writeFileSync(join(root, "packages/api/package.json"), JSON.stringify(api));
    writeFileSync(join(root, "packages/card/package.json"), JSON.stringify(card));
    writeFileSync(join(root, "packages/api/openapi/shirabe.bundled.yaml"), contract("0.6.1"));
    await runTest(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const fetchRelease = (spec, published = []) => async (url) => {
  if (url.startsWith("https://api.github.com/")) return new Response(spec);
  return published.some((name) => url.includes(encodeURIComponent(name)))
    ? Response.json({ version: url.split("/").at(-1), dependencies: { "@shirabe-org/api": spec.match(/version: (\S+)/)?.[1] } }) : new Response("", { status: 404 });
};

test("preparation imports the SHA-pinned contract through the real importer and retries without double-bumping", async () => {
  await fixture(async (root) => {
    let imports = 0;
    const options = {
      root, sourceToken: "test-source-token", fetcher: fetchRelease(contract("0.7.0")),
      run(command, [input], { cwd }) {
        assert.equal(command, "script/update-openapi");
        assert.equal(readFileSync(input, "utf8"), contract("0.7.0"));
        execFileSync(process.execPath, [fileURLToPath(new URL("./import-openapi.mjs", import.meta.url)), input], { cwd });
        imports++;
      },
    };
    const plan = await prepareRelease("repository_dispatch", event, options);
    assert.equal(plan.skip, "false");
    assert.equal(plan.api_version, "0.7.0");
    assert.equal(plan.card_version, "0.1.3");
    assert.equal(JSON.parse(readFileSync(join(root, "packages/card/package.json"))).dependencies["@shirabe-org/api"], "0.7.0");
    const retry = await prepareRelease("repository_dispatch", event, { ...options, fetcher: fetchRelease(contract("0.7.0"), ["@shirabe-org/api"]) });
    assert.equal(retry.skip, "false");
    assert.equal(retry.card_version, "0.1.3");
    const finished = await prepareRelease("repository_dispatch", event, { ...options, fetcher: fetchRelease(contract("0.7.0"), ["@shirabe-org/api", "@shirabe-org/card"]) });
    assert.equal(finished.skip, "true");
    assert.equal(imports, 2);
  });
});

test("bad payload, missing source, drift and registry failures never invoke the importer", async () => {
  await fixture(async (root) => {
    const run = () => assert.fail("Must not mutate packages");
    await assert.rejects(prepareRelease("repository_dispatch", { ...event, client_payload: {} }, { root, sourceToken: "test-source-token", run }), /backend_sha/);
    await assert.rejects(prepareRelease("repository_dispatch", event, { root, sourceToken: "test-source-token", run, fetcher: async () => new Response("", { status: 404 }) }), /released contract/);
    await assert.rejects(prepareRelease("repository_dispatch", event, { root, sourceToken: "test-source-token", run, fetcher: fetchRelease(contract("0.6.1", "paths: {}\n")) }), /info.version bump/);
    await assert.rejects(prepareRelease("repository_dispatch", event, {
      root, sourceToken: "test-source-token", run, fetcher: async (url) => url.startsWith("https://api.") ? new Response(contract("0.7.0")) : new Response("", { status: 503 }),
    }), /Cannot check/);
    assert.equal(JSON.parse(readFileSync(join(root, "packages/api/package.json"))).version, "0.6.1");
  });
});

test("publication waits for registry visibility and times out instead of publishing a missing dependency", async () => {
  let polls = 0;
  let sleeps = 0;
  await waitForPackages("0.7.0", undefined, {
    attempts: 3,
    fetcher: async () => ++polls === 3 ? Response.json({ version: "0.7.0" }) : new Response("", { status: 404 }),
    sleep: async (ms) => { assert.equal(ms, 10_000); sleeps++; },
  });
  assert.equal(sleeps, 2);
  await assert.rejects(waitForPackages("0.7.0", "0.1.3", {
    attempts: 2, fetcher: fetchRelease(""), sleep: async () => {},
  }), /within five minutes/);
  const requests = [];
  await waitForPackages("0.7.0", "0.1.3", {
    fetcher: async (url) => { requests.push(url); return Response.json({ version: url.split("/").at(-1), dependencies: { "@shirabe-org/api": "0.7.0" } }); },
  });
  assert.deepEqual(requests.map((url) => url.split("/").at(-1)), ["0.7.0", "0.1.3"]);
});

test("release helpers can be imported by a Node evaluation without invoking the CLI", () => {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
    const { releaseSource } = await import(${JSON.stringify(new URL("./backend-release.mjs", import.meta.url).href)});
    console.log(releaseSource('workflow_dispatch', { inputs: { backend_sha: '${sha}' } }).backend_sha);
  `], { encoding: "utf8" });
  assert.equal(output.trim(), sha);
});

test("the private spec fetch authenticates only to GitHub, never the npm registry", async () => {
  await fixture(async (root) => {
    const requests = [];
    const plan = await prepareRelease("repository_dispatch", event, {
      root, sourceToken: "test-source-token",
      fetcher: async (url, options) => {
        requests.push({ url, options });
        if (url.startsWith("https://api.github.com/")) return new Response(contract("0.6.1"));
        return Response.json({ version: url.split("/").at(-1), dependencies: { "@shirabe-org/api": "0.6.1" } });
      },
      run: () => assert.fail("Published packages must not invoke the importer"),
    });
    assert.equal(plan.skip, "true");
    assert.deepEqual(requests[0].options, {
      headers: { Accept: "application/vnd.github.raw+json", Authorization: "Bearer test-source-token" }, redirect: "error",
    });
    assert.ok(requests.slice(1).every(({ options }) => options === undefined));
    await assert.rejects(prepareRelease("repository_dispatch", event, {
      root, fetcher: () => assert.fail("Missing source credentials must not fetch"),
    }), /SHIRABE_SOURCE_TOKEN/);
  });
});

test("a published card version with the wrong API dependency cannot count as a completed release", async () => {
  await assert.rejects(publishedVersion("@shirabe-org/card", "0.1.3", async () => Response.json({
    version: "0.1.3", dependencies: { "@shirabe-org/api": "0.6.1" },
  }), "0.7.0"), /different API dependency/);
});
