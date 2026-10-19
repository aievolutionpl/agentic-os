import assert from "node:assert/strict";

const unprobed = ["openrouter", "custom", "ollama", "gemini", "hermes", "opencode", "antigravity"];
export function assertIntegrationContract(integrations) {
  assert.deepEqual(integrations.map(i => i.id).sort(), [...unprobed, "codex", "claude"].sort());
  for (const i of integrations) {
    assert.equal(i.status, "not_configured");
    assert.deepEqual(i.quota, { state: "unknown", remaining: null, unit: null,
      source: null, observedAt: null, resetAt: null });
    if (unprobed.includes(i.id)) {
      assert.equal(i.probe, undefined);
      continue;
    }
    const p = i.probe;
    assert.ok(p);
    assert.equal(p.auth, "unknown");
    assert.equal(p.provenance, "local-command");
    assert.ok(Number.isFinite(Date.parse(p.observedAt)));
    assert.equal(p.capabilities.execution, false);
    for (const key of ["version", "help", "authStatus"]) {
      assert.ok(["passed", "failed", "unavailable", "timed_out"].includes(p.commands[key]));
      assert.equal(p.capabilities[key], p.commands[key] === "passed");
    }
    assert.equal(p.installation, p.commands.version === "passed" ? "installed"
      : p.commands.version === "unavailable" ? "not_found" : "unknown");
    if (p.installation !== "installed") assert.equal(p.version, null);
  }
}

// Validate each rendered observation independently: a new snapshot performs new
// host probes, so it must not be treated as the observation already on screen.
export function assertIntegrationCards(cards) {
  assert.deepEqual(cards.map(c => c.name).sort(), ["Codex", "Claude Code", "OpenRouter API",
    "OpenAI-compatible API", "Ollama / LM Studio", "Gemini CLI", "Hermes", "OpenCode", "Antigravity"].sort());
  for (const card of cards) {
    const provider = ["Codex", "Claude Code"].includes(card.name);
    assert.equal(card.fields.Limit, "Brak danych");
    assert.equal(card.fields['Źródło'], "Brak");
    assert.equal(card.fields.Pomiar, "Nie zmierzono");
    assert.equal(card.fields.Reset, "Brak danych");
    if (!provider) {
      assert.equal(card.badge, "Nieskonfigurowane");
      assert.equal(Object.keys(card.fields).length, 4);
    } else {
      assert.ok(["Zainstalowany lokalnie", "Nie znaleziono", "Nieskonfigurowane"].includes(card.badge));
      assert.equal(Object.keys(card.fields).length, 7);
      assert.equal(card.fields['Polecenie autoryzacji'], "Brak danych");
      assert.ok(["Potwierdzone", "Brak danych"].includes(card.fields['Możliwości']));
      if (card.badge !== "Zainstalowany lokalnie") {
        assert.equal(card.fields.Wersja, "Brak danych");
        assert.equal(card.fields['Możliwości'], "Brak danych");
      } else {
        assert.match(card.fields.Wersja, /^(Brak danych|\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)$/);
      }
    }
  }
}
