import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/npm-release.yml", import.meta.url), "utf8"));
const job = workflow.jobs["backend-release"];

test("manual and backend dispatches share the existing trusted publisher and serialize both packages", () => {
  assert.deepEqual(workflow.on.repository_dispatch.types, ["backend_release"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.backend_sha.required, true);
  assert.equal(workflow.concurrency.group, "sdk-release");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.equal(job.permissions["id-token"], "write");
  assert.equal(job.permissions.contents, "write");
  assert.match(workflow.jobs.publish.if, /github.event_name == 'release'/);
  assert.equal(job.steps[0].with.ref, "main");
});

const releaseSteps = job.steps.slice(job.steps.findIndex((step) => step.name === "Commit the verified SDK and tag its source"), job.steps.findIndex((step) => step.name === "Release summary"));

function executeRelease(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "shirabe-workflow-test-"));
  const log = join(root, "commands");
  try {
    mkdirSync(join(root, "bin"));
    const commands = {
      git: `echo "git $*" >> "$LOG"
if [[ "$1 $2" == 'diff --cached' ]]; then exit 1; fi
if [[ "$1 $2" == 'rev-parse --verify' ]]; then [[ "$TAG_EXISTS" == true ]]; exit; fi
if [[ "$1 $2" == 'diff --quiet' && "$TAG_DRIFT" == true ]]; then exit 1; fi
if [[ "$1" == push && "$FAIL_PUSH" == true ]]; then exit 1; fi`,
      node: `echo "node $*" >> "$LOG"
if [[ "$FAIL_WAIT" == true ]]; then exit 1; fi`,
      gh: `echo "gh $*" >> "$LOG"
if [[ "$1 $2" == 'release view' ]]; then [[ "$RELEASE_EXISTS" == true ]]; exit; fi`,
      "npm-release": `echo "publish $*" >> "$LOG"
if [[ "$1" == "$FAIL_PACKAGE" ]]; then exit 1; fi`,
      "package-check": 'echo "check $*" >> "$LOG"',
    };
    for (const [name, body] of Object.entries(commands)) {
      const path = join(root, "bin", name);
      writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
      chmodSync(path, 0o755);
    }
    const env = {
      ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, LOG: log,
      API_VERSION: "0.7.0", CARD_VERSION: "0.1.3", BACKEND_SHA: "a".repeat(40), SPEC_URL: "https://example.test/spec",
      ...options,
    };
    let error;
    try {
      for (const step of releaseSteps) {
        if (step.if && env.SKIPPED === "true") continue;
        execFileSync("/bin/bash", ["-e", "-c", step.run], { cwd: root, env, stdio: "pipe" });
      }
    } catch (failure) { error = failure; }
    return { error, commands: readFileSync(log, "utf8").trim().split("\n") };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the actual workflow commits and tags, publishes API, waits, publishes card, then verifies and records releases", () => {
  const { error, commands } = executeRelease();
  assert.equal(error, undefined);
  assert.ok(commands.indexOf("git push origin HEAD:main") < commands.indexOf("publish api-v0.7.0"));
  assert.ok(commands.indexOf("git push origin refs/tags/card-v0.1.3") < commands.indexOf("publish api-v0.7.0"));
  assert.deepEqual(commands.filter((line) => /^(publish|node|check)/.test(line)), [
    "publish api-v0.7.0", "node script/backend-release.mjs wait 0.7.0", "publish card-v0.1.3",
    "node script/backend-release.mjs wait 0.7.0 0.1.3", "check --registry",
  ]);
  assert.equal(commands.filter((line) => line.startsWith("gh release create")).length, 2);
  assert.ok(commands.indexOf("check --registry") < commands.findIndex((line) => line.startsWith("gh release create")));
});

for (const options of [{ FAIL_PUSH: "true" }, { FAIL_WAIT: "true" }, { TAG_EXISTS: "true", TAG_DRIFT: "true" }]) {
  test(`push, dependency visibility or tag drift failures stop before card publication: ${JSON.stringify(options)}`, () => {
    const { error, commands } = executeRelease(options);
    assert.ok(error);
    assert.ok(!commands.includes("publish card-v0.1.3"));
    assert.ok(!commands.some((line) => line.startsWith("gh release create")));
  });
}

test("partial publication fails visibly without creating a successful release record", () => {
  const { error, commands } = executeRelease({ FAIL_PACKAGE: "card-v0.1.3" });
  assert.ok(error);
  assert.ok(commands.includes("publish api-v0.7.0"));
  assert.ok(!commands.includes("check --registry"));
  assert.ok(!commands.some((line) => line.startsWith("gh release create")));
});

test("duplicate package releases can repair missing GitHub records without republishing", () => {
  for (const step of releaseSteps.slice(0, -1)) assert.equal(step.if, "steps.plan.outputs.skip != 'true'");
  assert.equal(releaseSteps.at(-1).name, "Record GitHub releases");
  assert.equal(releaseSteps.at(-1).if, undefined);
  const { error, commands } = executeRelease({ SKIPPED: "true", RELEASE_EXISTS: "true" });
  assert.equal(error, undefined);
  assert.ok(commands.every((line) => line.startsWith("gh release view")));
  const missing = executeRelease({ SKIPPED: "true" });
  assert.equal(missing.error, undefined);
  assert.equal(missing.commands.filter((line) => line.startsWith("gh release create")).length, 2);
  assert.ok(missing.commands.every((line) => line.startsWith("gh release")));
  assert.ok(!commands.some((line) => line.startsWith("gh release create")));
});
