import {
  readFileSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gitText } from "./git.js";
import type { Extension } from "../shared.js";
const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../resources/skills",
);
export function skillCatalog(): Extension[] {
  const entries: (Extension & { slug: string })[] = JSON.parse(
    readFileSync(join(root, "catalog.json"), "utf8"),
  );
  return entries.map((e) => ({
    ...e,
    kind: "skill",
    instructions: readFileSync(join(root, e.slug, "SKILL.md"), "utf8"),
  }));
}
function safeDirectory(parent: string, name: string) {
  const path = join(parent, name);
  if (
    existsSync(path) &&
    (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())
  )
    throw Error("SKILL_PATH_UNSAFE");
  mkdirSync(path, { recursive: true });
  return path;
}
/** Install only pinned, bundled packages; a click never downloads or executes scripts. */
export async function installSkillFiles(projectRoot: string, skill: Extension) {
  if (!skill.slug || !/^[a-z0-9-]+$/.test(skill.slug))
    throw Error("SKILL_NOT_INSTALLABLE");
  const project = realpathSync.native(projectRoot);
  const skills = safeDirectory(safeDirectory(project, ".agents"), "skills");
  const destination = join(skills, skill.slug),
    marker = join(destination, ".agenting-source.json");
  if (existsSync(destination)) {
    if (
      lstatSync(destination).isSymbolicLink() ||
      !existsSync(marker) ||
      lstatSync(marker).isSymbolicLink()
    )
      throw Error("SKILL_FOLDER_EXISTS");
    const installed = JSON.parse(readFileSync(marker, "utf8"));
    if (
      installed.source !== skill.source ||
      installed.version !== skill.version
    )
      throw Error("SKILL_FOLDER_EXISTS");
    return destination;
  }
  const source = join(root, skill.slug),
    files: { relative: string; body: Buffer }[] = [];
  function collect(folder: string) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isSymbolicLink()) throw Error("SKILL_PATH_UNSAFE");
      if (item.isDirectory()) collect(path);
      else if (item.isFile())
        files.push({
          relative: relative(source, path),
          body: readFileSync(path),
        });
    }
  }
  collect(source);
  const staging = mkdtempSync(join(skills, `.agenting-install-${skill.slug}-`));
  try {
    for (const file of files) {
      const target = join(staging, file.relative);
      if (!target.startsWith(staging + sep)) throw Error("SKILL_PATH_UNSAFE");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.body, { flag: "wx" });
    }
    writeFileSync(
      join(staging, ".agenting-source.json"),
      JSON.stringify({ source: skill.source, version: skill.version }),
    );
    if (existsSync(destination)) throw Error("SKILL_FOLDER_EXISTS");
    renameSync(staging, destination);
  } finally {
    // Only our freshly-created staging directory, resolved inside this project's skills root.
    if (
      resolve(staging).startsWith(resolve(skills) + sep) &&
      existsSync(staging)
    )
      rmSync(staging, { recursive: true, force: true });
  }
  // Exclude this local package only; do not change global Git settings or .gitignore.
  try {
    const path = resolve(
      project,
      await gitText(project, "rev-parse", "--git-path", "info/exclude"),
    );
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      throw Error("SKILL_PATH_UNSAFE");
    const body = existsSync(path) ? readFileSync(path, "utf8") : "",
      pattern = `/.agents/skills/${skill.slug}/`;
    if (!body.split(/\r?\n/).includes(pattern)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        body + `\n# Agenting OS local skill: ${skill.slug}\n${pattern}\n`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "SKILL_PATH_UNSAFE")
      throw error;
  }
  return destination;
}
