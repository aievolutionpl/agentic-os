import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Agent } from "../shared.js";
import { resolveOnPath } from "./connectors.js";

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
    if (path && !/\.(cmd|bat|ps1)$/i.test(path)) result[id] = path;
    if (id === "gemini" && path && /\.cmd$/i.test(path)) {
      const script = join(
        dirname(path),
        "node_modules",
        "@google",
        "gemini-cli",
        "dist",
        "index.js",
      );
      if (existsSync(script)) result.gemini = script;
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
    if (found) result.hermes = found;
  }
  return result;
}
