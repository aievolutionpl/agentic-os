import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { request } from "node:https";
import { getCACertificates } from "node:tls";
import type { OpenRouterModel, OpenRouterSetting } from "../shared.js";
import { exact, text } from "./validate.js";

export interface SecretStorage {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}
export type JsonRequest = (
  path: "/key" | "/models",
  key?: string,
) => Promise<any>;
/** Fixed origin, verified TLS, no redirects, bounded body and elapsed time. */
export const openRouterRequest: JsonRequest = (path, key) =>
  new Promise((resolve, reject) => {
    if (!["/key", "/models"].includes(path))
      return reject(Error("INVALID_ENDPOINT"));
    const req = request(
      `https://openrouter.ai/api/v1${path}`,
      {
        ca: [...getCACertificates("default"), ...getCACertificates("system")],
        method: "GET",
        headers: key
          ? { Authorization: `Bearer ${key}`, Accept: "application/json" }
          : { Accept: "application/json" },
      },
      (res) => {
        let body = "",
          size = 0;
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          size += Buffer.byteLength(chunk);
          if (size > 4 * 1024 * 1024) req.destroy(Error("RESPONSE_LIMIT"));
          else body += chunk.toString("utf8");
        });
        res.on("error", () => {
          clearTimeout(timer);
          reject(Error("OPENROUTER_UNAVAILABLE"));
        });
        res.on("end", () => {
          clearTimeout(timer);
          if (res.statusCode !== 200)
            return reject(
              Error(
                res.statusCode === 401
                  ? "OPENROUTER_AUTH_FAILED"
                  : "OPENROUTER_UNAVAILABLE",
              ),
            );
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(Error("INVALID_RESPONSE"));
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(Error("OPENROUTER_TIMEOUT")),
      10000,
    );
    req.on("error", () => {
      clearTimeout(timer);
      reject(Error("OPENROUTER_UNAVAILABLE"));
    });
    req.end();
  });

export class OpenRouterConnection {
  private readonly path: string;
  constructor(
    private directory: string,
    private secrets: SecretStorage,
    private requestJson = openRouterRequest,
  ) {
    this.path = join(directory, "openrouter-connection.json");
  }
  private read(): { encryptedKey: string; model: string } | null {
    if (!existsSync(this.path)) return null;
    const row = JSON.parse(readFileSync(this.path, "utf8"));
    if (
      typeof row.encryptedKey !== "string" ||
      row.encryptedKey.length > 20000 ||
      typeof row.model !== "string"
    )
      throw Error("INVALID_CONNECTION");
    return row;
  }
  settings(): OpenRouterSetting {
    const row = this.read();
    return {
      configured: !!row,
      model: row?.model ?? "",
      encryptionAvailable: this.secrets.available(),
    };
  }
  save(input: unknown): OpenRouterSetting {
    const p = exact(input, ["apiKey", "model", "consent"]);
    if (p.consent !== true) throw Error("EXPLICIT_CONSENT_REQUIRED");
    if (!this.secrets.available()) throw Error("SECURE_STORAGE_UNAVAILABLE");
    const model = text(p.model, 200);
    if (!/^[A-Za-z0-9._:-]+\/[A-Za-z0-9._:/-]+$/.test(model))
      throw Error("INVALID_MODEL");
    const key =
      p.apiKey === undefined || p.apiKey === "" ? null : text(p.apiKey, 4096);
    if (key && !/^[A-Za-z0-9_-]{20,4096}$/.test(key))
      throw Error("INVALID_API_KEY");
    const previous = key ? null : this.read();
    const encryptedKey = key
      ? this.secrets.encrypt(key).toString("base64")
      : previous?.encryptedKey;
    if (!encryptedKey) throw Error("API_KEY_REQUIRED");
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path + ".tmp", JSON.stringify({ encryptedKey, model }), {
      mode: 0o600,
    });
    renameSync(this.path + ".tmp", this.path);
    return this.settings();
  }
  remove() {
    if (existsSync(this.path)) unlinkSync(this.path);
  }
  private key() {
    const row = this.read();
    if (!row || !this.secrets.available())
      throw Error("OPENROUTER_NOT_CONFIGURED");
    return this.secrets.decrypt(Buffer.from(row.encryptedKey, "base64"));
  }
  async models(): Promise<OpenRouterModel[]> {
    const body = await this.requestJson("/models");
    if (!Array.isArray(body?.data)) throw Error("INVALID_RESPONSE");
    return body.data
      .slice(0, 3000)
      .filter(
        (m: any) => typeof m.id === "string" && typeof m.name === "string",
      )
      .map((m: any) => ({
        id: m.id.slice(0, 200),
        name: m.name.slice(0, 200),
        contextLength: Number.isFinite(m.context_length)
          ? m.context_length
          : null,
      }));
  }
  quota() {
    return this.requestJson("/key", this.key());
  }
  /** Secret is passed directly to the trusted child, never returned over IPC. */
  environment(): NodeJS.ProcessEnv {
    const row = this.read();
    if (!row) return {};
    return {
      OPENROUTER_API_KEY: this.key(),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        model: `openrouter/${row.model}`,
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
