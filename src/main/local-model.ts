import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { LocalModelSetting } from "../shared.js";
import { exact, text } from "./validate.js";

/** Reuse OpenCode's tools/ACP runtime with an explicitly selected loopback model. */
export class LocalModelConnection {
  private file: string;
  constructor(directory: string) {
    this.file = join(directory, "local-model.json");
  }
  settings(): LocalModelSetting {
    if (!existsSync(this.file))
      return {
        configured: false,
        baseURL: "http://127.0.0.1:11434/v1",
        model: "",
      };
    const saved = this.validate(JSON.parse(readFileSync(this.file, "utf8")));
    return { configured: true, ...saved };
  }
  private validate(input: unknown) {
    const p = exact(input, ["baseURL", "model"]),
      url = new URL(text(p.baseURL, 500));
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/v1\/?$/.test(url.pathname)
    )
      throw Error("LOCAL_ENDPOINT_REQUIRED");
    const model = text(p.model, 200);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model))
      throw Error("INVALID_MODEL");
    return { baseURL: url.href.replace(/\/$/, ""), model };
  }
  save(input: unknown) {
    const value = this.validate(input);
    writeFileSync(this.file + ".tmp", JSON.stringify(value), { mode: 0o600 });
    renameSync(this.file + ".tmp", this.file);
    return this.settings();
  }
  remove() {
    if (existsSync(this.file)) unlinkSync(this.file);
  }
  environment(): NodeJS.ProcessEnv {
    const settings = this.settings();
    if (!settings.configured) throw Error("LOCAL_MODEL_NOT_CONFIGURED");
    return {
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        model: `agenting-local/${settings.model}`,
        small_model: `agenting-local/${settings.model}`,
        enabled_providers: ["agenting-local"],
        provider: {
          "agenting-local": {
            npm: "@ai-sdk/openai-compatible",
            name: "Local model",
            options: { baseURL: settings.baseURL },
            models: { [settings.model]: { name: settings.model } },
          },
        },
        permission: {
          external_directory: "deny",
          bash: "deny",
          webfetch: "deny",
          websearch: "deny",
        },
      }),
    };
  }
}
