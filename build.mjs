import * as esbuild from "esbuild";
import { cpSync } from "fs";

const watch = process.argv.includes("--watch");

/** Copy static assets into dist/ */
function copyStatic() {
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("icon.png", "dist/icon.png");
  console.log("Copied static assets to dist/");
}

/** @type {esbuild.BuildOptions} */
const base = {
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "es2022",
  logLevel: "info",
};

const ctx = await esbuild.context({
  ...base,
  entryPoints: ["src/background.ts", "src/content.ts"],
});

if (watch) {
  copyStatic();
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  copyStatic();
}