import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "shirabe-api-generated-"));
const generated = join(temporary, "generated");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

try {
  run("npx", ["--no-install", "openapi-ts"], {
    env: { ...process.env, SHIRABE_OPENAPI_OUTPUT: generated },
  });
  run(process.execPath, ["scripts/generate-bound-operations.mjs", generated]);

  const comparison = spawnSync("diff", ["-qr", "src/generated", generated], {
    cwd: packageRoot,
    stdio: "inherit",
  });
  if (comparison.error) throw comparison.error;
  if (comparison.status !== 0) {
    throw new Error("Generated API client is stale. Run: npm run codegen");
  }

  console.log("Generated API client matches openapi/shirabe.bundled.yaml.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
