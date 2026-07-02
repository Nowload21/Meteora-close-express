import esbuild from "esbuild";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

/** Entry points that must be bundled (they import npm deps). */
const bundledEntries = {
  "main-world": "src/main-world.ts", // MAIN world: UI button + DLMM + Jupiter + wallet
};

/** Small scripts with no npm deps — copied/bundled lightly. */
const plainEntries = {
  "content-bridge": "src/content-bridge.ts", // ISOLATED world: chrome.storage bridge
  "background": "src/background.ts", // service worker: cross-origin fetch proxy
  "popup": "src/popup.ts", // options/popup page
};

mkdirSync("dist", { recursive: true });

const shared = {
  bundle: true,
  format: "iife",
  target: "chrome111",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": watch ? '"development"' : '"production"',
    "process.env.ANCHOR_BROWSER": "true",
  },
};

const bundledCtxOptions = {
  ...shared,
  entryPoints: bundledEntries,
  outdir: "dist",
  inject: ["src/buffer-shim.js"],
  plugins: [
    NodeGlobalsPolyfillPlugin({ buffer: true, process: true }),
    NodeModulesPolyfillPlugin(),
  ],
};

const plainCtxOptions = {
  ...shared,
  entryPoints: plainEntries,
  outdir: "dist",
};

function copyStatic() {
  cpSync("public", "dist", { recursive: true });
}

if (watch) {
  const c1 = await esbuild.context(bundledCtxOptions);
  const c2 = await esbuild.context(plainCtxOptions);
  await c1.watch();
  await c2.watch();
  copyStatic();
  console.log("watching…");
} else {
  await esbuild.build(bundledCtxOptions);
  await esbuild.build(plainCtxOptions);
  copyStatic();
  console.log("build done → dist/");
}
