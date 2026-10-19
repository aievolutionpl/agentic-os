import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { text } from "./validate.js";
/** Import plain skill instructions only. Supporting scripts and links never execute. */
export function readSkillFile(path: string) {
  if (!/\.md$/i.test(path) || statSync(path).size > 16000)
    throw Error("SKILL_FILE_TOO_LARGE");
  const body = text(readFileSync(path, "utf8"), 12000);
  const name =
    body.match(/^name:\s*["']?([^\r\n"']+)/m)?.[1]?.trim() ??
    basename(path, ".md");
  const license =
    body.match(/^license:\s*["']?([^\r\n"']+)/m)?.[1]?.trim() ??
    "User supplied; verify redistribution rights";
  return {
    kind: "skill",
    name: name.slice(0, 120),
    version: "local-import",
    author: "Workspace",
    license: license.slice(0, 120),
    source: basename(path),
    instructions: body,
  };
}
