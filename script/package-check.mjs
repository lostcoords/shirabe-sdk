import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const definitions = [
  { name: "@shirabe-org/api", directory: "packages/api" },
  { name: "@shirabe-org/card", directory: "packages/card" },
];
const repositoryUrl = "git+https://github.com/lostcoords/shirabe.git";

function run(command, args, options = {}) {
  console.log(`== ${[command, ...args].join(" ")}`);
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

function exportedTargets(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportedTargets);
}

function manifestFor(definition) {
  const path = join(root, definition.directory, "package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.name !== definition.name)
    throw new Error(`${path} names ${manifest.name ?? "nothing"}`);
  if (manifest.private) throw new Error(`${definition.name} is private`);
  if (
    manifest.repository?.url !== repositoryUrl ||
    manifest.repository?.directory !== definition.directory
  ) {
    throw new Error(`${definition.name} does not identify its monorepo source`);
  }
  if (manifest.license !== "MIT")
    throw new Error(`${definition.name} is not MIT licensed`);
  if (!manifest.files?.includes("dist"))
    throw new Error(`${definition.name} does not publish dist explicitly`);
  if (
    !exportedTargets(manifest.exports).every((target) =>
      target.startsWith("./dist/"),
    )
  ) {
    throw new Error(`${definition.name} exports source files`);
  }
  for (const group of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [dependency, requested] of Object.entries(
      manifest[group] ?? {},
    )) {
      if (/^(file|link|workspace):/.test(requested))
        throw new Error(
          `${definition.name} publishes ${dependency} as ${requested}`,
        );
    }
  }
  return manifest;
}

function validateArchive(name, packed) {
  const files = packed.files.map(({ path }) => path);
  const unexpected = files.filter(
    (path) =>
      path !== "LICENSE" &&
      path !== "README.md" &&
      path !== "package.json" &&
      !path.startsWith("dist/"),
  );
  if (unexpected.length)
    throw new Error(`${name} packs unexpected files: ${unexpected.join(", ")}`);
  if (!files.includes("LICENSE")) throw new Error(`${name} packs no license`);
  if (!files.some((path) => path.startsWith("dist/") && path.endsWith(".js")))
    throw new Error(`${name} packs no JavaScript`);
  if (!files.some((path) => path.startsWith("dist/") && path.endsWith(".d.ts")))
    throw new Error(`${name} packs no declarations`);
}

const temporary = mkdtempSync(join(tmpdir(), "shirabe-packages-"));
try {
  const manifests = definitions.map(manifestFor);
  run("npm", ["run", "codegen:check", "--workspace", "@shirabe-org/api"]);
  for (const { name } of definitions)
    run("npm", ["run", "build", "--workspace", name]);

  const archives = new Map();
  for (const { name } of definitions) {
    const packed = JSON.parse(
      run(
        "npm",
        [
          "pack",
          "--silent",
          "--json",
          "--workspace",
          name,
          "--pack-destination",
          temporary,
        ],
        { capture: true },
      ),
    )[0];
    validateArchive(name, packed);
    archives.set(name, join(temporary, packed.filename));
  }

  const consumer = join(temporary, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "shirabe-package-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  run(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...definitions.map(({ name }) => archives.get(name)),
    ],
    { cwd: consumer },
  );
  writeFileSync(
    join(consumer, "smoke.mjs"),
    [
      'import { createShirabeClient } from "@shirabe-org/api";',
      "globalThis.window = { addEventListener() {} };",
      'const { wordCard } = await import("@shirabe-org/card");',
      'const { isR2AudioUrl } = await import("@shirabe-org/card/word-card/audio");',
      'if (typeof createShirabeClient !== "function" || typeof wordCard.apiHost !== "function" || typeof isR2AudioUrl !== "function") throw new Error("Package runtime exports are incomplete");',
      'console.log("Packed JavaScript imports successfully.");',
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(consumer, "smoke.ts"),
    [
      'import { createShirabeClient, parse, type Parse } from "@shirabe-org/api";',
      'import { wordCard } from "@shirabe-org/card";',
      'import { isR2AudioUrl } from "@shirabe-org/card/word-card/audio";',
      'import type { Definition, WordCardHost } from "@shirabe-org/card/word-card";',
      "const client = createShirabeClient();",
      'const parseRequest: Parameters<typeof parse>[0] = { body: { texts: ["猫"] } };',
      "const parsed: Parse | undefined = undefined;",
      "const definition: Definition | null = null;",
      "const host: WordCardHost = {",
      '  async lookup() { return { status: "found", definition }; },',
      '  async lookupEntry() { return { status: "found", definition }; },',
      "};",
      "void [client, parseRequest, parsed, host, wordCard, isR2AudioUrl];",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, noEmit: true, skipLibCheck: false }, include: ["smoke.ts"] }, null, 2)}\n`,
  );
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--project",
      join(consumer, "tsconfig.json"),
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  execFileSync(process.execPath, [join(consumer, "smoke.mjs")], {
    cwd: consumer,
    stdio: "inherit",
  });

  for (const manifest of manifests)
    console.log(`Ready: ${manifest.name}@${manifest.version}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
