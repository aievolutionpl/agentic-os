import React, { useEffect, useState } from "react";
import type { ChatSession, Project } from "../shared";
import { Icon } from "./ui";

export function BrandMark() {
  return <svg viewBox="0 0 40 40" width="32" height="32" aria-hidden="true"><path d="M20 3 35 12v16L20 37 5 28V12Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/><path d="m12 25 8-14 8 14M15 21h10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="20" cy="29" r="1.7" fill="currentColor"/></svg>;
}
export function WorkspaceNavigation({ projects, pl, view, navigate, openChat, newProject, settings, close, onRenamed }: {
  projects: Project[]; pl: boolean; view: string; navigate: (view: string, project?: string) => void;
  openChat: (id: string, project?: string) => void; newProject: () => void; settings: () => void; close: () => void; onRenamed: () => void;
}) {
  const [chats, setChats] = useState<ChatSession[]>([]), [failed, setFailed] = useState(false);
  const [rename, setRename] = useState<Project | null>(null), [name, setName] = useState("");
  const [saving, setSaving] = useState(false), [renameError, setRenameError] = useState(false);
  const edit = (project: Project) => { setRename(project); setName(project.name); setRenameError(false); };
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
      {[["chat", "message", "Rozmowy", "Conversations"], ["center", "folder", "Projekty", "Projects"], ["shared-memory", "memory", "Pamięć", "Memory"], ["skills", "skill", "Skille", "Skills"], ["schedule", "clock", "ScheduleJob", "ScheduleJob"], ["quota", "tokens", "Limity", "Limits"]].map(([id, icon, polish, english]) => <button key={id} className={`nav-item ${view === id ? "selected" : ""}`} aria-current={view === id ? "page" : undefined} onClick={() => go(id!)}><Icon name={icon!} /><span>{pl ? polish : english}</span></button>)}
      <details className="nav-more"><summary><Icon name="grid" />{pl ? "Więcej" : "More"}</summary>
        {[["inbox", "inbox", "Zadania", "Tasks"], ["terminal", "terminal", "Terminal", "Terminal"], ["harness", "layers", "Harness", "Harness"]].map(([id, icon, polish, english]) => <button key={id} className={`nav-item ${view === id ? "selected" : ""}`} onClick={() => go(id!)}><Icon name={icon!} /><span>{pl ? polish : english}</span></button>)}
      </details>
    </nav>
    <div className="project-heading"><h2 id="projects-title">{pl ? "Projekty" : "Projects"}</h2><button className="icon-button" aria-label={pl ? "Nowy projekt" : "New project"} onClick={newProject}><Icon name="plus" /></button></div>
    <nav className="project-tree" aria-label={pl ? "Projekty i rozmowy" : "Projects and conversations"}>
      {projects.map(project => <details key={project.id} open className="project-branch"><summary onDoubleClick={e => { e.preventDefault(); edit(project); }} onKeyDown={e => { if (e.key === "F2") { e.preventDefault(); edit(project); } }} onContextMenu={e => { e.preventDefault(); edit(project); }}><Icon name="folder" />{rename?.id === project.id ? <input className="project-name-input" aria-label={pl ? "Nazwa projektu" : "Project name"} autoFocus ref={element => { if(element && document.activeElement !== element){element.focus();element.select();} }} maxLength={120} value={name} disabled={saving} onChange={e=>setName(e.target.value)} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"){e.preventDefault();void saveName();}if(e.key==="Escape"){e.preventDefault();setRename(null);}}} /> : <span title={project.name}>{project.name}</span>}</summary><div className="project-children">
        {rename?.id === project.id && <div className="inline-rename-actions"><button disabled={saving || !name.trim()} onClick={()=>void saveName()}><Icon name="check"/>{pl?"Zapisz":"Save"}</button><button disabled={saving} onClick={()=>setRename(null)} aria-label={pl?"Anuluj zmianę nazwy":"Cancel rename"}><Icon name="close"/></button>{renameError&&<small role="alert">{pl?"Nie udało się zapisać":"Could not save"}</small>}</div>}
        <div className="project-shortcuts"><button onClick={() => { openChat("", project.id); close(); }}><Icon name="plus" />{pl ? "Rozmowa" : "Chat"}</button><button className="rename-project icon-button" aria-label={`${pl ? "Zmień nazwę" : "Rename"}: ${project.name}`} onClick={() => edit(project)}><Icon name="edit" /></button><button className="project-link" title={pl ? "Otwórz projekt" : "Open project"} aria-label={`${pl ? "Otwórz projekt" : "Open project"}: ${project.name}`} onClick={() => go("project", project.id)}><Icon name="grid" /><span className="sr-only">{project.name}</span></button></div>
        {chats.filter(chat => chat.projectId === project.id).map(chat => <button key={chat.id} className="tree-chat" onClick={() => { openChat(chat.id); close(); }} title={chat.title}><Icon name="message" /><span>{chat.title}</span></button>)}
      </div></details>)}
      {failed && <small role="status">{pl ? "Nie udało się odświeżyć rozmów." : "Could not refresh conversations."}</small>}
    </nav>
    <button className="nav-item workspace-settings" onClick={settings}><Icon name="settings" /><span>{pl ? "Ustawienia" : "Settings"}</span></button>
  </>;
}
