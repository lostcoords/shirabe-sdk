import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function watchSdk(root) {
  let timer;
  let building;
  let pending = false;
  let closed = false;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  };
  const rebuild = () => {
    if (closed) return;
    if (building) { pending = true; return building; }
    building = new Promise((complete, fail) => {
      const child = spawn("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
      child.on("error", fail);
      child.on("exit", (code, signal) => code === 0 ? complete() : fail(new Error(`SDK build failed (${signal ?? code})`)));
    })
      .catch((error) => console.error(`${error.message}; waiting for the next SDK edit.`))
      .finally(() => {
        building = null;
        if (pending && !closed) { pending = false; schedule(); }
      });
    return building;
  };
  const watchers = [];
  const close = async () => {
    closed = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    await building;
  };
  try {
    for (const name of ["api", "card"]) {
      const directory = join(root, "packages", name);
      watchers.push(watch(join(directory, "src"), { recursive: true }, schedule));
      watchers.push(watch(directory, (_, filename) => {
        if (["package.json", "tsconfig.json", "tsconfig.build.json"].includes(String(filename))) schedule();
      }));
    }
    await rebuild();
    console.log(`Watching SDK: ${root}`);
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const close = await watchSdk(root);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => close().then(() => process.exit(0)));
}
