import React, { useEffect, useState } from "react";
import type { ChatSession, Project } from "../shared";
import appLogo from "./assets/agenting-logo.png";
import appLogoDark from "./assets/agenting-logo-dark.png";
import { Icon } from "./ui";

export function BrandMark() {
  return <span className="app-logo-crop"><img className="app-logo-light" src={appLogo} alt="" /><img className="app-logo-dark" src={appLogoDark} alt="" /></span>;
}
export function WorkspaceNavigation({ projects, pl, view, navigate, openChat, newProject, settings, close, onRenamed }: {
  projects: Project[]; pl: boolean; view: string; navigate: (view: string, project?: string) => void;
  openChat: (id: string, project?: string) => void; newProject: () => void; settings: () => void; close: () => void; onRenamed: () => void;
}) {
  const [chats, setChats] = useState<ChatSession[]>([]), [failed, setFailed] = useState(false);
  const [rename, setRename] = useState<Project | null>(null), [name, setName] = useState("");
  const [saving, setSaving] = useState(false), [renameError, setRenameError] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("agenting-collapsed-projects") ?? "[]");
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("agenting-collapsed-projects", JSON.stringify(collapsed)); } catch { /* Navigation still works without storage. */ }
  }, [collapsed]);
  const visibleProjects = projects.filter(project => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const allCollapsed = visibleProjects.length > 0 && visibleProjects.every(project => collapsed.includes(project.id));
  const edit = (project: Project) => { setCollapsed(ids => ids.filter(id => id !== project.id)); setRename(project); setName(project.name); setRenameError(false); };
  async function saveName() {
    if (!rename || !name.trim() || saving) return;
    setSaving(true); setRenameError(false);
    try { await window.agenting!.projectRename!({id: rename.id, name: name.trim()}); onRenamed(); setRename(null); }
    catch { setRenameError(true); } finally { setSaving(false); }
  }
  useEffect(() => {
    let alive = true;
    const read = () => window.agenting?.chatList?.().then(rows => { if (alive) { setChats(rows); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    void read(); const timer = setInterval(() => void read(), 2500);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const go = (id: string, project?: string) => { navigate(id, project); close(); };
  return <>
    <div className="brand"><span className="brand-mark"><BrandMark /></span><strong>Agenting OS</strong><button className="icon-button drawer-close" aria-label={pl ? "Zamknij menu" : "Close menu"} onClick={close}><Icon name="close" /></button></div>
    <button className="new-conversation" onClick={() => { openChat(""); close(); }}><Icon name="plus" />{pl ? "Nowa rozmowa" : "New conversation"}</button>
    <nav className="primary-nav" aria-label="Agenting OS">
      {[["chat", "message", "Rozmowy", "Conversations"], ["shared-memory", "memory", "Pamięć", "Memory"], ["skills", "skill", "Skille", "Skills"], ["plugins", "connections", "Pluginy", "Plugins"], ["schedule", "clock", "ScheduleJob", "ScheduleJob"], ["quota", "tokens", "Limity", "Limits"]].map(([id, icon, polish, english]) => <button key={id} data-section={id} className={`nav-item ${view === id ? "selected" : ""}`} aria-current={view === id ? "page" : undefined} onClick={() => go(id!)}><Icon name={icon!} /><span>{pl ? polish : english}</span></button>)}
      <details className="nav-more"><summary><Icon name="grid" />{pl ? "Więcej" : "More"}</summary>
        {[["inbox", "inbox", "Zadania", "Tasks"], ["terminal", "terminal", "Terminal", "Terminal"], ["harness", "layers", "Harness", "Harness"]].map(([id, icon, polish, english]) => <button key={id} data-section={id} className={`nav-item ${view === id ? "selected" : ""}`} onClick={() => go(id!)}><Icon name={icon!} /><span>{pl ? polish : english}</span></button>)}
      </details>
    </nav>
    <div className="project-heading"><h2 id="projects-title"><button className="text-action" onClick={() => go("center")}>{pl ? "Projekty" : "Projects"}</button><span className="project-count">{projects.length}</span></h2><div className="project-heading-actions"><button className="icon-button" disabled={!visibleProjects.length} title={pl ? (allCollapsed ? "Rozwiń projekty" : "Zwiń projekty") : (allCollapsed ? "Expand projects" : "Collapse projects")} aria-label={pl ? (allCollapsed ? "Rozwiń projekty" : "Zwiń projekty") : (allCollapsed ? "Expand projects" : "Collapse projects")} onClick={() => setCollapsed(ids => allCollapsed ? ids.filter(id => !visibleProjects.some(project => project.id === id)) : [...new Set([...ids, ...visibleProjects.map(project => project.id)])])}><Icon name="layers" /></button><button className="icon-button" aria-label={pl ? "Nowy projekt" : "New project"} onClick={newProject}><Icon name="plus" /></button></div></div>
    <label className="project-filter"><Icon name="search" /><input type="search" aria-label={pl ? "Szukaj projektów" : "Search projects"} placeholder={pl ? "Znajdź projekt…" : "Find project…"} value={query} onChange={e => setQuery(e.target.value)} /></label>
    <nav className="project-tree" aria-label={pl ? "Projekty i rozmowy" : "Projects and conversations"}>
      {visibleProjects.map(project => <details key={project.id} open={!collapsed.includes(project.id)} onToggle={e => { const open = e.currentTarget.open; setCollapsed(ids => open ? (ids.includes(project.id) ? ids.filter(id => id !== project.id) : ids) : (ids.includes(project.id) ? ids : [...ids, project.id])); }} className="project-branch"><summary onDoubleClick={e => { e.preventDefault(); edit(project); }} onKeyDown={e => { if (e.key === "F2") { e.preventDefault(); edit(project); } }} onContextMenu={e => { e.preventDefault(); edit(project); }}><Icon name="folder" />{rename?.id === project.id ? <input className="project-name-input" aria-label={pl ? "Nazwa projektu" : "Project name"} autoFocus ref={element => { if(element && document.activeElement !== element){element.focus();element.select();} }} maxLength={120} value={name} disabled={saving} onChange={e=>setName(e.target.value)} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"){e.preventDefault();void saveName();}if(e.key==="Escape"){e.preventDefault();setRename(null);}}} /> : <span title={`${project.name} — ${pl ? "kliknij dwukrotnie lub F2, aby zmienić nazwę" : "double-click or F2 to rename"}`}>{project.name}</span>}<button className="project-link icon-button" title={pl ? "Otwórz projekt" : "Open project"} aria-label={`${pl ? "Otwórz projekt" : "Open project"}: ${project.name}`} onClick={e => { e.preventDefault(); e.stopPropagation(); go("project", project.id); }}><Icon name="grid" /></button><button className="project-new-chat icon-button" aria-label={`${pl ? "Nowy czat" : "New chat"}: ${project.name}`} onClick={e=>{e.preventDefault();e.stopPropagation();openChat("",project.id);close();}}><Icon name="plus"/></button></summary><div className="project-children">
        {rename?.id === project.id && <div className="inline-rename-actions"><button disabled={saving || !name.trim()} onClick={()=>void saveName()}><Icon name="check"/>{pl?"Zapisz":"Save"}</button><button disabled={saving} onClick={()=>setRename(null)} aria-label={pl?"Anuluj zmianę nazwy":"Cancel rename"}><Icon name="close"/></button>{renameError&&<small role="alert">{pl?"Nie udało się zapisać":"Could not save"}</small>}</div>}
        {chats.filter(chat => chat.projectId === project.id).map(chat => <button key={chat.id} className="tree-chat" onClick={() => { openChat(chat.id); close(); }} title={chat.title}><Icon name="message" /><span>{chat.title}</span></button>)}
      </div></details>)}
      {!visibleProjects.length && <small className="project-empty" role="status">{pl ? (query ? "Brak pasujących projektów" : "Dodaj pierwszy projekt przyciskiem +") : (query ? "No matching projects" : "Add your first project with +")}</small>}
      {failed && <small role="status">{pl ? "Nie udało się odświeżyć rozmów." : "Could not refresh conversations."}</small>}
    </nav>
    <button className="nav-item workspace-settings" onClick={settings}><Icon name="settings" /><span>{pl ? "Ustawienia" : "Settings"}</span></button>
  </>;
}
