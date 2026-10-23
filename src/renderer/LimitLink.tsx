import React, { useState } from "react";
import type { LimitBridgeStatus, ProviderQuotaCard } from "../shared";
import { Icon, Modal, relativeTime } from "./ui";

const NAMES: Record<LimitBridgeStatus["agent"], string> = {
  claude: "Claude Code",
  antigravity: "Antigravity CLI",
};

export const formatUsd = (n: number, pl: boolean) =>
  `$${new Intl.NumberFormat(pl ? "pl" : "en", { maximumFractionDigits: 2 }).format(n)}`;

/** What one card says about the quota left, for compact places like the dashboard. */
export function quotaSummary(
  card: ProviderQuotaCard | undefined,
  pl: boolean,
): { value: string; note: string } | null {
  if (!card || card.source === "unavailable" || card.source === "manual")
    return null;
  const money = (n: number) => formatUsd(n, pl);
  // An exhausted key limit binds before any account balance.
  if (typeof card.balanceUsd === "number" && card.status !== "exhausted")
    return {
      value: pl
        ? `${money(card.balanceUsd)} salda`
        : `${money(card.balanceUsd)} left`,
      note:
        card.via === "openrouter"
          ? pl
            ? "saldo konta OpenRouter"
            : "OpenRouter account balance"
          : pl
            ? "saldo konta"
            : "account balance",
    };
  // The tightest window with a known limit says how much is really left.
  const limited = card.metrics
    .filter(
      (m) =>
        m.id !== "balance" && m.limitValue !== null && m.usedValue !== null,
    )
    .sort((a, b) => a.remainingPercent - b.remainingPercent)[0];
  if (!limited) return null;
  const reset = limited.resetsAt
    ? (pl ? " · reset " : " · resets ") +
      relativeTime(limited.resetsAt, pl ? "pl" : "en")
    : "";
  if (limited.format === "usd")
    return {
      value: `${money(Math.max(0, limited.limitValue! - limited.usedValue!))} ${pl ? "zostało" : "left"}`,
      note: `${limited.label}${reset}`,
    };
  return {
    value: `${Math.round(limited.remainingPercent)}% ${pl ? "zostało" : "left"}`,
    note: `${limited.label}${reset}`,
  };
}

/**
 * Opt-in link to a CLI's documented status line, which hands over the quota
 * of the user's own sessions. Shows exactly which file changes and how.
 */
export function LimitLink({
  status,
  pl,
  onChanged,
}: {
  status: LimitBridgeStatus;
  pl: boolean;
  onChanged: (status: LimitBridgeStatus) => void;
}) {
  const api = window.agenting;
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const name = NAMES[status.agent];
  async function run(install: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = install
        ? await api!.limitBridgeInstall!({ agent: status.agent, consent: true })
        : await api!.limitBridgeRemove!({ agent: status.agent });
      onChanged(next);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_REJECTED");
    } finally {
      setBusy(false);
    }
  }
  if (!api?.limitBridgeInstall) return null;
  return (
    <div className="limit-link" data-limit-link={status.agent}>
      {status.installed ? (
        <>
          <span className="connection-state connected">
            <Icon name="check" />
            {status.lastReadingAt
              ? pl
                ? `Limity na żywo · odczyt ${relativeTime(new Date(status.lastReadingAt).toISOString(), "pl")}`
                : `Live limits · read ${relativeTime(new Date(status.lastReadingAt).toISOString(), "en")}`
              : pl
                ? status.agent === "claude" ? "Oczekiwanie na limit · Claude przekazuje go po odpowiedzi w sesji CLI" : `Oczekiwanie na limit · otwórz ${name} i wpisz /usage`
                : status.agent === "claude" ? "Waiting for limits · Claude reports them after a CLI response" : `Waiting for limits · open ${name} and enter /usage`}
          </span>
          <button
            className="text-action"
            disabled={busy}
            onClick={() => void run(false)}
          >
            {pl ? "Odłącz" : "Unlink"}
          </button>
        </>
      ) : (
        <button
          className="secondary"
          disabled={busy || !status.readable}
          onClick={() => setOpen(true)}
        >
          <Icon name="tokens" />
          {pl ? "Pokaż limity na żywo" : "Show live limits"}
        </button>
      )}
      {!status.readable && (
        <small className="helper">
          {pl
            ? `Plik ustawień ${name} nie jest poprawnym JSON — zostawiamy go bez zmian.`
            : `${name} settings file is not valid JSON — it is left untouched.`}
        </small>
      )}
      {error && (
        <small className="error" role="alert">
          {pl
            ? "Nie udało się zmienić ustawień."
            : "Could not change the settings."}{" "}
          {error}
        </small>
      )}
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        titleId={`limit-link-${status.agent}`}
        className="limit-link-dialog"
      >
        <h2 id={`limit-link-${status.agent}`}>
          {pl ? `Limity ${name} na żywo` : `Live ${name} limits`}
        </h2>
        <p>
          {status.agent === "claude"
            ? pl
              ? "Claude Code przekazuje swojemu paskowi statusu procent okna 5 h i 7 dni Twojej subskrypcji. Agenting OS doda tam swoje polecenie, które zapisze tylko te liczby i godziny resetu."
              : "Claude Code hands its status line the used percentage of your subscription's 5-hour and 7-day windows. Agenting OS adds its own command there, which keeps only those numbers and reset times."
            : pl
              ? "Antigravity CLI przekazuje swojemu paskowi statusu pozostałą część wspólnych pul limitów. Agenting OS doda tam swoje polecenie, które zapisze tylko te liczby i godziny resetu."
              : "Antigravity CLI hands its status line the fraction left of your shared quota pools. Agenting OS adds its own command there, which keeps only those numbers and reset times."}
        </p>
        <ul className="limit-link-facts">
          <li>
            {pl ? "Zmieniany plik:" : "File changed:"}{" "}
            <code>{status.settingsPath}</code>{" "}
            {pl
              ? "(zmienia się tylko statusLine; poprzedni wpis jest zapisany do przywrócenia)"
              : "(only statusLine changes; the previous entry is kept for restore)"}
          </li>
          <li>
            {pl ? "Wpis statusLine:" : "statusLine entry:"}{" "}
            <code>{status.command}</code>
          </li>
          <li>
            {status.previous
              ? pl
                ? `Twój obecny pasek (${status.previous}) dalej działa — polecenie go wywołuje.`
                : `Your current status line (${status.previous}) keeps working — the command calls it.`
              : pl
                ? "Bez własnego paska pokażemy krótkie podsumowanie limitów."
                : "With no status line of your own, a short limit summary is shown."}
          </li>
          <li>
            {pl
              ? "Nie czytamy haseł, tokenów ani plików logowania. E-mail, ścieżki i treść rozmów nie są zapisywane."
              : "No passwords, tokens or sign-in files are read. E-mail, paths and conversation text are not stored."}
          </li>
          <li>
            {pl
              ? "Odczyt pojawia się, gdy używasz CLI. „Odłącz” przywraca poprzedni wpis."
              : "Readings arrive while you use the CLI. “Unlink” restores the previous entry."}
          </li>
        </ul>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(true)}
          >
            {pl ? "Połącz pasek statusu" : "Link the status line"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
