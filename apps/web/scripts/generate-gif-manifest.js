import { readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const publicDir = path.join(root, "public");
const gifsDir = path.join(publicDir, "gifs");
const outPath = path.join(publicDir, "gifs", "manifest.json");

function main() {
  if (!existsSync(gifsDir)) {
    writeFileSync(outPath, JSON.stringify({ gifs: [] }, null, 2));
    return;
  }
  const files = readdirSync(gifsDir)
    .filter((name) => name.toLowerCase().endsWith(".gif"))
    .map((name) => name.replace(/\.gif$/i, ""))
    .sort((a, b) => a.localeCompare(b));

  writeFileSync(outPath, JSON.stringify({ gifs: files }, null, 2));
}

main();
