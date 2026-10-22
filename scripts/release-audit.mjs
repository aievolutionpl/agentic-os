import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

// Never print candidate secret values. This is a bounded pattern check, not certification.
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
].filter(existsSync);
const suspicious = [];
for (const file of files) {
  if (
    /(?:^|\/)(?:node_modules|\.env(?:\.|$)|auth\.json|agenting\.sqlite|release)(?:\/|$)/i.test(
      file,
    )
  )
    throw Error(`Unexpected release input: ${file}`);
  if (!/\.(?:tsx?|cts|mjs|json|md|ya?ml|txt)$/.test(file)) continue;
  const body = readFileSync(file, "utf8");
  if (
    /(?:\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bsk-[A-Za-z0-9_-]{35,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(
      body,
    ) &&
    !file.startsWith("tests/")
  )
    suspicious.push(file);
}
if (suspicious.length)
  throw Error(`Review possible credentials in: ${suspicious.join(", ")}`);
for (const file of [
  "README.md",
  "README.en.md",
  "CHANGELOG.md",
  "HANDOFF_PL.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/PROVIDERS.md",
  "docs/WORKBENCH_AUDIT.md",
  "docs/RELEASE_STATUS.md",
  "docs/research/claudex-cc-switch.md",
  "docs/evidence/release-04/README.md",
]) {
  const body = readFileSync(file, "utf8");
  for (const match of body.matchAll(
    /\]\(([^)\s]+)\)|<img[^>]+src="([^"]+)"/g,
  )) {
    const target = match[1] || match[2];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const local = target.split("#")[0];
    if (!existsSync(resolve(dirname(file), local)))
      throw Error(`Broken local documentation link: ${file} -> ${target}`);
  }
}
const inventory = JSON.parse(readFileSync("licenses/inventory.json", "utf8"));
for (const name of [
  "react",
  "react-dom",
  "electron",
  "vite",
  "electron-builder",
  "form-data",
  "ws",
  "node-pty",
  "@xterm/xterm",
  "@xterm/addon-fit",
  "react-markdown",
  "remark-gfm",
  "@lobehub/icons-static-svg",
  "@modelcontextprotocol/server-memory",
]) {
  if (!inventory.some((entry) => entry.name === name))
    throw Error(`Missing license inventory: ${name}`);
}
const skillCatalog = JSON.parse(readFileSync("resources/skills/catalog.json", "utf8"));
for (const skill of skillCatalog) {
  if (
    !/^[a-f0-9]{40}$/.test(skill.version) ||
    (!skill.source.includes(skill.version) &&
      !skill.source.startsWith("https://officialskills.sh/"))
  )
    throw Error(`Unpinned skill: ${skill.id}`);
  const dir = resolve("resources/skills", skill.slug);
  if (!existsSync(resolve(dir, "SKILL.md")) || !["LICENSE", "LICENSE.txt"].some(file => existsSync(resolve(dir, file)))) throw Error(`Missing skill instructions or license: ${skill.id}`);
}
console.log(
  `Release audit passed: ${files.length} release input paths; documentation links and dependency inventory checked.`,
);
