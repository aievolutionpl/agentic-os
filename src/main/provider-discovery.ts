import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Agent } from "../shared.js";
import { resolveOnPath } from "./connectors.js";
import { geminiScript, hermesLaunch } from "./provider-launch.js";

/** Only discover paths; never execute installers, wrappers, or provider sign-in automatically. */
export function detectExecutables(): Partial<Record<Agent, string>> {
  const result: Partial<Record<Agent, string>> = {};
  for (const [id, command] of [
    ["codex", "codex"],
    ["claude", "claude"],
    ["opencode", "opencode"],
    ["local", "opencode"],
    ["gemini", "gemini"],
    ["hermes", "hermes"],
    ["antigravity", "agy"],
  ] as const) {
    const path = resolveOnPath(command);
    // A native binary anywhere (PATH or a documented install folder) beats a .cmd shim:
    // e.g. Claude Code's native installer next to an older npm global install.
    const native = resolveOnPath(command, process.env, process.platform, {
      native: true,
    });
    if (native) result[id] = native;
    else if (path && !/\.(cmd|bat|ps1)$/i.test(path)) result[id] = path;
    if (id === "gemini" && path && /\.cmd$/i.test(path)) {
      const script = geminiScript(path);
      if (script) result.gemini = script;
    }
    if (id === "hermes" && path && /\.cmd$/i.test(path)) {
      try {
        hermesLaunch(path, ["acp"], homedir());
        result.hermes = path;
      } catch { /* best effort: failure here must not mask the primary result */ }
    }
    if (id === "codex" && path && process.platform === "win32") {
      const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
      const packageArch = process.arch === "arm64" ? "arm64" : "x64";
      const base = join(dirname(path), "node_modules", "@openai", "codex");
      const candidates = [
        join(
          base,
          "node_modules",
          "@openai",
          `codex-win32-${packageArch}`,
          "vendor",
          `${arch}-pc-windows-msvc`,
          "bin",
          "codex.exe",
        ),
        join(
          base,
          "node_modules",
          "@openai",
          `codex-win32-${packageArch}`,
          "vendor",
          `${arch}-pc-windows-msvc`,
          "codex",
          "codex.exe",
        ),
        join(base, "vendor", `${arch}-pc-windows-msvc`, "codex", "codex.exe"),
        join(base, "vendor", `${arch}-pc-windows-msvc`, "bin", "codex.exe"),
      ];
      const native = candidates.find((p) => existsSync(p));
      if (native) result.codex = native;
    }
  }
  if (!result.hermes) {
    const candidates =
      process.platform === "win32"
        ? [
            join(
              process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
              "hermes",
              "bin",
              "hermes.exe",
            ),
            join(
              process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
              "hermes",
              "bin",
              "hermes.cmd",
            ),
            join(homedir(), ".local", "bin", "hermes.exe"),
            join(
              homedir(),
              ".hermes",
              "hermes-agent",
              ".venv",
              "Scripts",
              "hermes.exe",
            ),
          ]
        : [
            join(homedir(), ".local", "bin", "hermes"),
            join(
              homedir(),
              ".hermes",
              "hermes-agent",
              ".venv",
              "bin",
              "hermes",
            ),
          ];
    const found = candidates.find((p) => existsSync(p));
    if (found) {
      try {
        hermesLaunch(found, ["acp"], homedir());
        result.hermes = found;
      } catch { /* best effort: failure here must not mask the primary result */ }
    }
  }
  return result;
}
