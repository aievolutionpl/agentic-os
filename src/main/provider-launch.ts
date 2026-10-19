import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type { ProcessSpec } from "./rpc.js";

function inside(root: string, target: string) {
  const rel = relative(realpathSync.native(root), realpathSync.native(target));
  return !!rel && !isAbsolute(rel) && !rel.split(/[\\/]/).includes("..");
}
/** Resolve npm's declared JavaScript entry point, without executing its shell shim. */
export function geminiScript(shim: string): string | null {
  const root = join(dirname(shim), "node_modules", "@google", "gemini-cli");
  try {
    const meta = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const bin = typeof meta.bin === "string" ? meta.bin : meta.bin?.gemini;
    if (
      meta.name !== "@google/gemini-cli" ||
      typeof bin !== "string" ||
      isAbsolute(bin)
    )
      return null;
    const entry = join(root, bin);
    return /\.js$/i.test(entry) && inside(root, entry)
      ? realpathSync.native(entry)
      : null;
  } catch {
    return null;
  }
}

const HERMES_ENTRY =
  "import sys; sys.path.insert(0, sys.argv.pop(1)); import hermes_bootstrap; from hermes_cli.main import main; sys.exit(main())";
/** Official Windows source installs expose a cmd shim. Launch their Python bootstrap directly. */
export function hermesLaunch(
  command: string,
  args: string[],
  cwd: string,
): ProcessSpec {
  if (!/\.cmd$/i.test(command)) return { command, args, cwd };
  if (
    basename(command).toLowerCase() !== "hermes.cmd" ||
    statSync(command).size > 64000
  )
    throw Error("HERMES_LAUNCHER_UNSUPPORTED");
  const home = dirname(dirname(realpathSync.native(command)));
  const python = readFileSync(command, "utf8").match(
    /^"([^"\r\n]+[\\/]python\.exe)"\s+-I\s+-c\s+/m,
  )?.[1];
  const checkout = join(home, "hermes-agent");
  if (
    !python ||
    !isAbsolute(python) ||
    !existsSync(join(checkout, "hermes_bootstrap.py")) ||
    !inside(join(home, "tools"), python)
  )
    throw Error("HERMES_LAUNCHER_UNSUPPORTED");
  return {
    command: realpathSync.native(python),
    args: ["-I", "-c", HERMES_ENTRY, realpathSync.native(checkout), ...args],
    cwd,
    env: { HERMES_HOME: home, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  };
}
