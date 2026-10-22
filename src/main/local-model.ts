import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { get, request } from "node:http";
import { join } from "node:path";
import type {
  LocalModelDiscovery,
  LocalModelPingResult,
  LocalModelSetting,
} from "../shared.js";
import { exact, text } from "./validate.js";

function validateLoopbackBaseUrl(rawUrl: string): URL {
  const url = new URL(text(rawUrl, 500));
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
  return url;
}

function httpGetJson(url: string, timeoutMs = 2000): Promise<unknown | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val: unknown | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    let req;
    try {
      req = get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          if (body.length < 65_536) body += chunk;
        });
        res.on("end", () => {
          try {
            done(JSON.parse(body));
          } catch {
            done(null);
          }
        });
      });
    } catch {
      done(null);
      return;
    }
    req.on("timeout", () => {
      req.destroy();
      done(null);
    });
    req.on("error", () => done(null));
  });
}

function httpPostJson(
  url: string,
  payload: unknown,
  timeoutMs = 5000,
): Promise<{ statusCode: number; body: unknown | null }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (statusCode: number, body: unknown | null) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, body });
    };
    const data = JSON.stringify(payload);
    let req;
    try {
      req = request(
        url,
        {
          method: "POST",
          timeout: timeoutMs,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(data),
          },
        },
        (res) => {
          let raw = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            if (raw.length < 65_536) raw += chunk;
          });
          res.on("end", () => {
            try {
              done(res.statusCode ?? 0, JSON.parse(raw));
            } catch {
              done(res.statusCode ?? 0, null);
            }
          });
        },
      );
    } catch {
      done(0, null);
      return;
    }
    req.on("timeout", () => {
      req.destroy();
      done(0, null);
    });
    req.on("error", () => done(0, null));
    req.end(data);
  });
}

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
      url = validateLoopbackBaseUrl(String(p.baseURL ?? ""));
    const model = text(p.model, 200);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model))
      throw Error("INVALID_MODEL");
    return { baseURL: url.href.replace(/\/$/, ""), model };
  }
  async discover(input?: unknown): Promise<LocalModelDiscovery> {
    const rawBase =
      input &&
      typeof input === "object" &&
      typeof (input as { baseURL?: unknown }).baseURL === "string" &&
      (input as { baseURL: string }).baseURL.trim()
        ? (input as { baseURL: string }).baseURL.trim()
        : this.settings().baseURL;
    const url = validateLoopbackBaseUrl(rawBase);
    const cleanBase = url.href.replace(/\/$/, "");
    const origin = `${url.protocol}//${url.host}`;
    const started = Date.now();

    const [v1Body, ollamaTags] = await Promise.all([
      httpGetJson(`${cleanBase}/models`, 2000),
      httpGetJson(`${origin}/api/tags`, 2000),
    ]);
    const latencyMs = Math.max(1, Date.now() - started);

    const models = new Set<string>();
    if (
      v1Body &&
      typeof v1Body === "object" &&
      Array.isArray((v1Body as { data?: unknown }).data)
    ) {
      for (const item of (v1Body as { data: { id?: unknown }[] }).data) {
        if (typeof item?.id === "string" && item.id.trim())
          models.add(item.id.trim().slice(0, 200));
      }
    }
    if (
      ollamaTags &&
      typeof ollamaTags === "object" &&
      Array.isArray((ollamaTags as { models?: unknown }).models)
    ) {
      for (const item of (ollamaTags as { models: { name?: unknown }[] })
        .models) {
        if (typeof item?.name === "string" && item.name.trim())
          models.add(item.name.trim().slice(0, 200));
      }
    }

    const reachable = v1Body !== null || ollamaTags !== null;
    const provider =
      ollamaTags !== null
        ? "ollama"
        : url.port === "1234"
          ? "lmstudio"
          : "openai-local";

    return {
      reachable,
      baseURL: cleanBase,
      provider,
      models: [...models].slice(0, 50),
      latencyMs,
      observedAt: new Date().toISOString(),
    };
  }
  async ping(input: unknown): Promise<LocalModelPingResult> {
    const p = exact(input, ["baseURL", "model"]);
    const valid = this.validate(p);
    const started = Date.now();
    const res = await httpPostJson(
      `${valid.baseURL}/chat/completions`,
      {
        model: valid.model,
        messages: [{ role: "user", content: "Respond with OK" }],
        max_tokens: 8,
        temperature: 0,
      },
      6000,
    );
    const latencyMs = Math.max(1, Date.now() - started);
    if (res.statusCode >= 200 && res.statusCode < 300 && res.body) {
      const choices = (
        res.body as {
          choices?: { message?: { content?: unknown } }[];
        }
      ).choices;
      const content =
        typeof choices?.[0]?.message?.content === "string"
          ? choices[0].message.content.trim().slice(0, 120)
          : "OK";
      return {
        ok: true,
        model: valid.model,
        latencyMs,
        detail: content || "OK",
        observedAt: new Date().toISOString(),
      };
    }
    // Fallback check against /v1/models if chat/completions is not loaded yet
    const discovery = await this.discover({ baseURL: valid.baseURL });
    if (discovery.reachable && discovery.models.includes(valid.model)) {
      return {
        ok: true,
        model: valid.model,
        latencyMs: discovery.latencyMs,
        detail: "MODEL_LISTED_READY",
        observedAt: new Date().toISOString(),
      };
    }
    return {
      ok: false,
      model: valid.model,
      latencyMs,
      detail: discovery.reachable ? "MODEL_NOT_FOUND" : "SERVER_UNREACHABLE",
      observedAt: new Date().toISOString(),
    };
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
