// Bundles the playground and serves it. esbuild does both, so there is no dev
// server of our own to keep working.
import { context } from "esbuild";

const ctx = await context({
  entryPoints: { main: "playground/main.ts" },
  bundle: true,
  format: "esm",
  outdir: "playground",
  sourcemap: "inline",
  logLevel: "info",
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: "playground", port: 4477 });
console.log(`\n  Word card playground: http://localhost:${port}\n`);
