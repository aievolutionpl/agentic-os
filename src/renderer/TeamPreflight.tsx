import React, { useEffect, useState } from "react";
import type { ProviderSetting, Task } from "../shared";
import { agentName, connectionLabel } from "./ui";

/** Reads saved evidence only. Opening this panel never invokes a provider. */
export function TeamPreflight({ tasks, pl }: { tasks: Task[]; pl: boolean }) {
  const [settings, setSettings] = useState<ProviderSetting[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setSettings(null);
    setFailed(false);
    void window
      .agenting!.providerSettings()
      .then((rows) => {
        if (alive) setSettings(rows);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  const agents = [
    ...new Set(tasks.flatMap((t) => [t.implementer, t.reviewer])),
  ];
  return (
    <section className="team-preflight" aria-labelledby="team-preflight-title">
      <div className="team-preflight-heading">
        <h3 id="team-preflight-title">
          {pl ? "Zespół przed startem" : "Team before launch"}
        </h3>
        <button
          type="button"
          className="secondary"
          onClick={() => setRevision((n) => n + 1)}
        >
          {pl ? "Odśwież zapisane dane" : "Refresh saved evidence"}
        </button>
      </div>
      <p>
        {pl
          ? `Zadania: ${tasks.length} · po jednej próbie wykonania · przegląd po zmianach · zatwierdzasz zastosowanie zmian`
          : `${tasks.length} tasks · one execution attempt each · review after changes · you approve applying changes`}
      </p>
      {failed ? (
        <p role="alert">
          {pl
            ? "Nie udało się odczytać połączeń. Sprawdź je przed startem."
            : "Could not read connections. Check them before starting."}
        </p>
      ) : settings === null ? (
        <p role="status">
          {pl ? "Odczyt zapisanych połączeń…" : "Reading saved connections…"}
        </p>
      ) : (
        <ul>
          {agents.map((agent) => {
            const setting = settings.find((s) => s.id === agent);
            const roles = [
              tasks.some((t) => t.implementer === agent) &&
                (pl ? "wykonawca" : "implementer"),
              tasks.some((t) => t.reviewer === agent) &&
                (pl ? "recenzent" : "reviewer"),
            ]
              .filter(Boolean)
              .join(" / ");
            return (
              <li key={agent} data-configured={!!setting?.configured}>
                <div>
                  <strong>{agentName(agent)}</strong>
                  <span>{roles}</span>
                </div>
                <span>
                  {setting?.configured
                    ? setting.model ||
                      (pl ? "Model ustawiony w CLI" : "Model configured in CLI")
                    : pl
                      ? "Brak połączenia — skonfiguruj w Połączenia i modele"
                      : "No connection — configure in Connections & models"}
                </span>
                {setting?.configured && (
                  <small>
                    {setting.lastCheck
                      ? `${pl ? "Ostatni test" : "Last check"}: ${connectionLabel(setting.lastCheck.state, pl)} · ${new Date(setting.lastCheck.observedAt).toLocaleString(pl ? "pl-PL" : "en-GB")}`
                      : pl
                        ? "Połączenie zapisane; test jeszcze nie został wykonany."
                        : "Connection saved; no check recorded yet."}
                  </small>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <small>
        {pl
          ? "To zapis konfiguracji, nie gwarancja dostępności modelu. Test połączenia uruchomisz w Połączenia i modele. Brak połączenia recenzenta zatrzyma kolejkę do czasu przeglądu; dostawca nie jest zastępowany automatycznie."
          : "Saved configuration does not guarantee model availability. Run a connection check in Connections & models. A missing reviewer requires manual intervention before review; providers are never silently replaced."}
      </small>
    </section>
  );
}
