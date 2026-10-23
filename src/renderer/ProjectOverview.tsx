import React, { useEffect, useState } from "react";
import type { Project, ProviderQuotaCard } from "../shared";
import { Icon } from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import { quotaSummary } from "./LimitLink";

export function ProjectOverview({projects, pl, onNew, onOpen, onChat, onLimits}: {
  projects: Project[]; pl: boolean; onNew: () => void; onOpen: (id: string) => void;
  onChat: (id: string) => void; onLimits: () => void;
}) {
  const [quotas, setQuotas] = useState<ProviderQuotaCard[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const read = () => window.agenting?.quotaScan?.().then(rows => { if (alive) { setQuotas(rows); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    void read(); const timer = setInterval(() => void read(), 60000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return <section className="project-overview">
    <header><div><h1>{pl ? "Twoje projekty" : "Your projects"}</h1><p>{pl ? "Wróć do pracy lub rozpocznij coś nowego." : "Pick up your work or start something new."}</p></div><button className="primary" onClick={onNew}><Icon name="plus" />{pl ? "Nowy projekt" : "New project"}</button></header>
    <div className="overview-projects">{projects.map(project => <article key={project.id}>
      <Icon name="folder" /><button className="project-title" onClick={() => onOpen(project.id)}>{project.name}<small>{pl ? "Otwórz projekt" : "Open project"}</small></button>
      <button className="secondary" onClick={() => onChat(project.id)}><Icon name="message" />{pl ? "Nowa rozmowa" : "New conversation"}</button>
    </article>)}{!projects.length && <p>{pl ? "Dodaj pierwszy projekt, aby połączyć rozmowy, zadania i pamięć." : "Add your first project to connect conversations, tasks and memory."}</p>}</div>
    <section className="overview-limits"><header><h2>{pl ? "Limity agentów" : "Agent limits"}</h2><button className="text-action" onClick={onLimits}>{pl ? "Szczegóły" : "Details"}<Icon name="chevron" /></button></header>
      {failed && <p role="status">{pl ? "Nie udało się odświeżyć limitów." : "Could not refresh limits."}</p>}
      <div>{quotas.map(card => { const summary = quotaSummary(card, pl); return <button className="overview-quota" key={card.id} onClick={onLimits}><ProviderIcon provider={card.icon} /><span>{card.name}<strong>{summary?.value ?? (pl ? "Brak odczytu limitu" : "No limit reading")}</strong><small>{summary?.note ?? (pl ? "Sprawdź połączenie limitów" : "Check the limits connection")}</small></span></button>; })}</div>
    </section>
  </section>;
}
