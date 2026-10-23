import React from "react";
import type { Project } from "../shared";
import { Icon } from "./ui";

export function ProjectOverview({projects, pl, onNew, onOpen, onChat}: {
  projects: Project[]; pl: boolean; onNew: () => void; onOpen: (id: string) => void;
  onChat: (id: string) => void; onLimits: () => void;
}) {
  return <section className="project-overview">
    <header><div><h1>{pl ? "Twoje projekty" : "Your projects"}</h1><p>{pl ? "Wróć do pracy lub rozpocznij coś nowego." : "Pick up your work or start something new."}</p></div><button className="primary" onClick={onNew}><Icon name="plus" />{pl ? "Nowy projekt" : "New project"}</button></header>
    <div className="overview-projects">{projects.map(project => <article key={project.id}>
      <Icon name="folder" /><button className="project-title" onClick={() => onOpen(project.id)}>{project.name}<small>{pl ? "Otwórz projekt" : "Open project"}</small></button>
      <button className="secondary" onClick={() => onChat(project.id)}><Icon name="message" />{pl ? "Nowa rozmowa" : "New conversation"}</button>
    </article>)}{!projects.length && <p>{pl ? "Dodaj pierwszy projekt, aby połączyć rozmowy, zadania i pamięć." : "Add your first project to connect conversations, tasks and memory."}</p>}</div>

  </section>;
}
