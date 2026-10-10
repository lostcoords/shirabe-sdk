import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The README teaches three ways to mount the card, and a snippet that no longer
// compiles teaches the wrong one. Nothing else here can catch that: the code is
// in a markdown file, so `npm run check` never sees it, and the contract it is
// written against moves.
//
// `@shirabe-org/card/*` is what a consumer writes, and inside this repository it is a
// tsconfig `paths` entry rather than an install (the extension does the same).
const PACKAGE_ROOT = resolve(".");

function snippets(): string[] {
  const readme = readFileSync("README.md", "utf8");
  return [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]!);
}

test("every TypeScript block in the README compiles against the real contract", () => {
  const blocks = snippets();
  assert.ok(blocks.length >= 2, "found the snippets");

  const dir = mkdtempSync(join(tmpdir(), "shirabe-card-readme-"));
  try {
    blocks.forEach((block, index) => writeFileSync(join(dir, `snippet-${index}.ts`), block));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        baseUrl: PACKAGE_ROOT,
        paths: {
          "@shirabe-org/card/word-card": ["src/word-card/index.ts"],
          "@shirabe-org/card/*": ["src/*"],
        },
      },
      include: ["*.ts"],
    }));

    try {
      execFileSync("tsc", ["--project", dir], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (error) {
      const report = (error as { stdout?: string }).stdout ?? String(error);
      // The line numbers are the temp file's, so name the block as the README
      // orders them: `snippet-0.ts` is the first ```ts fence.
      assert.fail(`a README snippet no longer compiles:\n${report}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
