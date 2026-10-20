import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

// JSDOM evaluates classic scripts. Adapt ESM syntax only; use the production
// bundle's actual React/components. Lazy terminal loading is tested in Electron.
const assets = "dist/renderer/assets";
const file = join(
  assets,
  readdirSync(assets).find(
    (name) => name.startsWith("index-") && name.endsWith(".js"),
  ),
);
export const bundle = transformSync(readFileSync(file, "utf8"), {
  format: "iife",
  define: {
    "import.meta.url": JSON.stringify(pathToFileURL(resolve(file)).href),
  },
}).code;
