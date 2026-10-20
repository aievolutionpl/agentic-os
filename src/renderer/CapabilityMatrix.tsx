import React from "react";
import type { Capability } from "../shared";
import { relativeTime } from "./ui";

const COPY = {
  en: {
    title: "Verified capabilities",
    intro:
      "Each fact is shown separately. “Verified” needs a passed connection check and at least one real finished run. Checks never start inference; real runs only happen when you start them.",
    agent: "Agent",
    detected: "Detected",
    connected: "Profile",
    auth: "Sign-in",
    handshake: "Handshake",
    live: "Real run",
    roles: "Roles",
    verdict: "Status",
    yes: "Yes",
    no: "No",
    authStates: {
      verified: "Verified",
      reported: "Reported by CLI",
      missing: "Missing",
      unknown: "Unknown",
    },
    tests: { passed: "Passed", failed: "Failed", not_tested: "Not tested" },
    roleNames: {
      implementer: "implementer",
      reviewer: "reviewer",
      master: "master",
    },
    verdicts: {
      verified: "Verified",
      unverified: "Unverified",
      "needs-auth": "Needs sign-in",
      "needs-connection": "Needs connection",
      "needs-install": "Not installed",
    },
    runs: (n: number) => `${n} finished`,
  },
  pl: {
    title: "Zweryfikowane możliwości",
    intro:
      "Każdy fakt pokazujemy osobno. „Zweryfikowany” wymaga udanego sprawdzenia połączenia i co najmniej jednego rzeczywiście ukończonego zadania. Sprawdzenie nigdy nie uruchamia inferencji; prawdziwe zadania uruchamiasz tylko Ty.",
    agent: "Agent",
    detected: "Wykryty",
    connected: "Profil",
    auth: "Logowanie",
    handshake: "Handshake",
    live: "Realne zadanie",
    roles: "Role",
    verdict: "Status",
    yes: "Tak",
    no: "Nie",
    authStates: {
      verified: "Zweryfikowane",
      reported: "Zgłoszone przez CLI",
      missing: "Brak",
      unknown: "Nieznane",
    },
    tests: {
      passed: "Udany",
      failed: "Nieudany",
      not_tested: "Nietestowany",
    },
    roleNames: {
      implementer: "wykonawca",
      reviewer: "recenzent",
      master: "master",
    },
    verdicts: {
      verified: "Zweryfikowany",
      unverified: "Niezweryfikowany",
      "needs-auth": "Wymaga logowania",
      "needs-connection": "Wymaga połączenia",
      "needs-install": "Niezainstalowany",
    },
    runs: (n: number) => `${n} ukończonych`,
  },
};
const TONES: Record<Capability["verdict"], string> = {
  verified: "tone-success",
  unverified: "tone-info",
  "needs-auth": "tone-warning",
  "needs-connection": "tone-warning",
  "needs-install": "tone-muted",
};

export function CapabilityMatrix({
  capabilities,
  language,
}: {
  capabilities: Capability[];
  language: "pl" | "en";
}) {
  const t = COPY[language];
  return (
    <section className="capability-matrix" aria-labelledby="cap-title">
      <h2 className="cc-section" id="cap-title">
        {t.title}
      </h2>
      <p className="helper">{t.intro}</p>
      <div
        className="capability-scroll"
        tabIndex={0}
        aria-labelledby="cap-title"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">{t.agent}</th>
              <th scope="col">{t.detected}</th>
              <th scope="col">{t.connected}</th>
              <th scope="col">{t.auth}</th>
              <th scope="col">{t.handshake}</th>
              <th scope="col">{t.live}</th>
              <th scope="col">{t.roles}</th>
              <th scope="col">{t.verdict}</th>
            </tr>
          </thead>
          <tbody>
            {capabilities.map((c) => (
              <tr key={c.agent} data-capability={c.agent}>
                <th scope="row">
                  {c.name}
                  {c.version && <small> {c.version}</small>}
                </th>
                <td>{c.detected ? t.yes : t.no}</td>
                <td>{c.configured ? t.yes : t.no}</td>
                <td>{t.authStates[c.auth]}</td>
                <td>
                  {t.tests[c.handshake]}
                  {c.handshakeAt && (
                    <small> · {relativeTime(c.handshakeAt, language)}</small>
                  )}
                </td>
                <td>
                  {t.tests[c.live]}
                  {c.live === "passed" && (
                    <small> · {t.runs(c.successfulRuns)}</small>
                  )}
                  {c.liveAt && (
                    <small>
                      {" "}
                      ·{" "}
                      {relativeTime(new Date(c.liveAt).toISOString(), language)}
                    </small>
                  )}
                </td>
                <td>{c.roles.map((r) => t.roleNames[r]).join(", ")}</td>
                <td>
                  <span className={`state-badge ${TONES[c.verdict]}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {t.verdicts[c.verdict]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
