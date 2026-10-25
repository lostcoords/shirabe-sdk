import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { watchSdk } from "../packages/watch.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "shirabe-sdk-watch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  await writeFile(join(root, "package.json"), JSON.stringify({
    private: true, workspaces: manifest.workspaces, scripts: { build: manifest.scripts.build },
  }));
  for (const name of ["api", "card"]) {
    const path = join(root, "packages", name);
    await mkdir(join(path, "src"), { recursive: true });
    await writeFile(join(path, "src/index.txt"), `${name}-first`);
    await writeFile(join(path, "package.json"), JSON.stringify({
      name: `@shirabe-org/${name}`, scripts: { build: "node ../../build.mjs" },
    }));
  }
  await writeFile(join(root, "build.mjs"), `
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
const name = basename(process.cwd());
const value = readFileSync("src/index.txt", "utf8");
appendFileSync("../../build-attempts.jsonl", JSON.stringify({ name, value }) + "\\n");
if (value === "broken") process.exit(2);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.js", value);
if (name === "card") {
  const api = readFileSync("../api/dist/index.js", "utf8");
  writeFileSync("dist/shirabe-card.js", JSON.stringify({ api, card: value }));
}
`);
  return root;
}

async function eventually(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check().catch(() => false)) return;
    await delay(50);
  }
  assert.fail("The SDK watcher did not propagate the changed build");
}

test("the SDK watcher builds API before card and recovers without touching a consumer", { timeout: 30_000 }, async (t) => {
  const root = await fixture(t);
  const close = await watchSdk(root);
  try {
    const bundle = () => readFile(join(root, "packages/card/dist/shirabe-card.js"), "utf8");
    assert.deepEqual(JSON.parse(await bundle()), { api: "api-first", card: "card-first" });
    await writeFile(join(root, "packages/api/src/index.txt"), "api-second");
    await eventually(async () => JSON.parse(await bundle()).api === "api-second");
    await writeFile(join(root, "packages/api/src/index.txt"), "broken");
    await eventually(async () => (await readFile(join(root, "build-attempts.jsonl"), "utf8")).includes('"value":"broken"'));
    assert.equal(JSON.parse(await bundle()).api, "api-second");
    await writeFile(join(root, "packages/api/src/index.txt"), "api-recovered");
    await eventually(async () => JSON.parse(await bundle()).api === "api-recovered");
    const attempts = (await readFile(join(root, "build-attempts.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    const failure = attempts.findIndex(({ value }) => value === "broken");
    assert.equal(attempts[failure + 1].name, "api", "a failed API build must not start the card build");
    await writeFile(join(root, "packages/card/src/index.txt"), "card-second");
    await eventually(async () => JSON.parse(await bundle()).card === "card-second");
  } finally {
    await close();
  }
});
