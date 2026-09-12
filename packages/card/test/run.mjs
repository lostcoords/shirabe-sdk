// Bundle the suite and run it under node:test, the way the extension does: the
// card is TypeScript with `.js` import specifiers, which Node cannot run and
// esbuild can.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "shirabe-card-test-"));
const args = process.argv.slice(2);
const integrationOnly = args[0] === "--integration";
const requested = integrationOnly ? args.slice(1) : args;
const integrationTests = new Set([
  "test/anki-bootstrap.test.ts",
  "test/desktop-storage.test.ts",
  "test/readme-integration.test.ts",
  "test/snapshot-host.test.ts",
  "test/standalone.test.ts",
]);
const tests = readdirSync("test").filter((name) => name.endsWith(".test.ts"))
  .sort().map((name) => `test/${name}`)
  .filter((path) => requested.length ? requested.includes(path) : integrationTests.has(path) === integrationOnly);
if (!tests.length) throw new Error("No matching card tests");

try {
  await build({
    entryPoints: tests,
    bundle: true, platform: "node", format: "cjs", outdir: dir, logLevel: "silent",
  });
  execFileSync(process.execPath, ["--test", `${dir}/*.js`], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
