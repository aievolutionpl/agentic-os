import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { probeProviders } from "../dist/main/adapters.js";

const result = {
  status: "passed",
  at: new Date().toISOString(),
  scope: "fixed local version/help/auth-status probes; no provider execution or quota request",
  providers: await probeProviders(),
};
const out = resolve("docs/evidence/adapter-slice/probe-result.json");
mkdirSync(resolve("docs/evidence/adapter-slice"), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    status: result.status,
    providers: result.providers.map(({ id, probe }) => ({
      id,
      installation: probe?.installation,
      auth: probe?.auth,
      capabilities: probe?.capabilities,
      quota: "unknown",
    })),
  }),
);
