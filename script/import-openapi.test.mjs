import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function importContract(contract, verify) {
  const root = mkdtempSync(join(tmpdir(), "shirabe-contract-"));
  try {
    mkdirSync(join(root, "packages/api/openapi"), { recursive: true });
    mkdirSync(join(root, "packages/card"), { recursive: true });
    writeFileSync(join(root, "packages/api/package.json"), JSON.stringify({ version: "0.6.1" }));
    writeFileSync(join(root, "packages/card/package.json"), JSON.stringify({
      version: "0.1.2", dependencies: { "@shirabe-org/api": "0.6.1" },
    }));
    writeFileSync(join(root, "packages/api/openapi/shirabe.bundled.yaml"), "original");
    writeFileSync(join(root, "input.yaml"), contract);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./import-openapi.mjs", import.meta.url)), "input.yaml"], {
      cwd: root, encoding: "utf8",
    });
    verify(result, {
      api: JSON.parse(readFileSync(join(root, "packages/api/package.json"), "utf8")),
      card: JSON.parse(readFileSync(join(root, "packages/card/package.json"), "utf8")),
      snapshot: readFileSync(join(root, "packages/api/openapi/shirabe.bundled.yaml"), "utf8"),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a new API version updates the exact card dependency and bumps its patch", () => {
  const contract = "openapi: 3.1.0\ninfo:\n  title: Shirabe API\n  version: 0.7.0\n";
  importContract(contract, (result, { api, card, snapshot }) => {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(api.version, "0.7.0");
    assert.equal(card.version, "0.1.3");
    assert.equal(card.dependencies["@shirabe-org/api"], "0.7.0");
    assert.equal(snapshot, contract);
  });
});

test("refreshing the same API version does not change package versions", () => {
  const contract = "openapi: 3.1.0\ninfo:\n  version: '0.6.1'\n";
  importContract(contract, (result, { api, card, snapshot }) => {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(api.version, "0.6.1");
    assert.equal(card.version, "0.1.2");
    assert.equal(snapshot, contract);
  });
});

for (const contract of ["invalid", "info:\n  version: 0.5.9\n", "info:\n  version: 0.6.0\n"]) {
  test(`invalid or older input leaves the snapshot and versions alone: ${contract.trim()}`, () => {
    importContract(contract, (result, { api, card, snapshot }) => {
      assert.equal(result.status, 1);
      assert.equal(api.version, "0.6.1");
      assert.equal(card.version, "0.1.2");
      assert.equal(snapshot, "original");
    });
  });
}

test("deployment-specific logo URLs do not create contract drift", () => {
  const contract = "openapi: 3.1.0\ninfo:\n  version: 0.6.1\n  x-logo:\n    url: 'https://shirabe.org/assets/shirabe-logo-new.webp'\nservers:\n  - url: https://shirabe.org\n";
  importContract(contract, (result, { snapshot }) => {
    assert.equal(result.status, 0, result.stderr);
    assert.ok(snapshot.includes("    url: '%LOGO_URL%'"));
    assert.ok(snapshot.includes("  - url: https://shirabe.org"));
  });
});
