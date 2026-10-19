import { test } from "node:test";
import assert from "node:assert/strict";
import { assertIntegrationContract, assertIntegrationCards } from "../scripts/integration-contract.mjs";
import { Store } from "../dist/main/store.js";
import { probeProviders, withProviderProbes } from "../dist/main/adapters.js";

test("provider probes use only the documented fixed commands and redact command output", async () => {
  const calls = [];
  const results = await probeProviders(async (executable, args, timeoutMs) => {
    calls.push({ executable, args: [...args], timeoutMs });
    return {
      code: 0,
      stdout: `${executable} 9.8.7\nSECRET_ACCESS_TOKEN=should-not-leak`,
      stderr: "stderr secret should not leak",
    };
  }, () => "2026-10-19T00:00:00.000Z");
  assert.deepEqual(calls, [
    { executable: "codex", args: ["--version"], timeoutMs: 2000 },
    { executable: "codex", args: ["--help"], timeoutMs: 2000 },
    { executable: "codex", args: ["login", "status"], timeoutMs: 2000 },
    { executable: "claude", args: ["--version"], timeoutMs: 2000 },
    { executable: "claude", args: ["--help"], timeoutMs: 2000 },
    { executable: "claude", args: ["auth", "status"], timeoutMs: 2000 },
  ]);
  assert.equal(results[0].probe.version, "9.8.7");
  assert.equal(results[0].probe.auth, "unknown");
  assert.equal(results[0].probe.capabilities.execution, false);
  assert.equal(results[0].quota.remaining, null);
  assert.equal(results[0].quota.source, null);
  assert.equal(JSON.stringify(results).includes("SECRET_ACCESS_TOKEN"), false);
  assert.equal(JSON.stringify(results).includes("stderr secret"), false);
});

test("missing or timed-out commands remain unknown without claiming installation or auth", async () => {
  const results = await probeProviders(async (_executable, args) => ({
    code: null,
    stdout: "",
    stderr: "",
    error: args[0] === "--version" ? "not_found" : "timed_out",
  }), () => "2026-10-19T00:00:00.000Z");
  for (const result of results) {
    assert.equal(result.probe.installation, "not_found");
    assert.equal(result.probe.version, null);
    assert.equal(result.probe.auth, "unknown");
    assert.equal(result.probe.capabilities.authStatus, false);
    assert.equal(result.quota.state, "unknown");
  }
});

for (const outcome of ["passed", "unavailable", "timed_out", "failed"]) {
  test(`integration smoke contract: ${outcome}, with seven unprobed entries`, async () => {
    const store = new Store(":memory:");
    try {
      const probes = await probeProviders(async () => ({code: outcome === "passed" ? 0 : 1,
        stdout: "tool 1.2.3", stderr: "", ...(outcome === "unavailable" ? {error: "not_found"}
          : outcome === "timed_out" ? {error: "timed_out"} : {})}));
      const integrations = withProviderProbes(store.integrations(), probes);
      assertIntegrationContract(integrations);
      const cards = integrations.map(i => ({name: i.name,
        badge: !i.probe || i.probe.installation === "unknown" ? "Nieskonfigurowane"
          : i.probe.installation === "installed" ? "Zainstalowany lokalnie" : "Nie znaleziono",
        fields: {Limit: "Brak danych", Źródło: "Brak", Pomiar: "Nie zmierzono", Reset: "Brak danych",
          ...(i.probe ? {Wersja: i.probe.version ?? "Brak danych", "Polecenie autoryzacji": "Brak danych",
            Możliwości: outcome === "passed" ? "Potwierdzone" : "Brak danych"} : {})}}));
      assertIntegrationCards(cards);
      cards[2].badge = "Zainstalowany lokalnie";
      assert.throws(() => assertIntegrationCards(cards));
      integrations[0].probe.capabilities.execution = true;
      assert.throws(() => assertIntegrationContract(integrations));
    } finally { store.close(); }
  });
}
