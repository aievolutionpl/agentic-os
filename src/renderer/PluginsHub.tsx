import React,{useEffect,useState} from "react";
import type {IntegrationId,IntegrationStatus,McpTool,Project} from "../shared";
import {Icon} from "./ui";

const catalog: {id:IntegrationId;name:string;icon:string;description:string;guide:string;color:string}[]=[
 {id:"google-drive",name:"Google Drive",icon:"folder",description:"Szukaj plików, czytaj dokumenty i dodawaj wiedzę do projektu.",guide:"https://developers.google.com/identity/protocols/oauth2/native-app",color:"#528461"},
 {id:"canva",name:"Canva",icon:"palette",description:"Połącz projekty graficzne i narzędzia tworzenia materiałów marki.",guide:"https://www.canva.dev/docs/apps/mcp/",color:"#7962bf"},
 {id:"notion",name:"Notion",icon:"skill",description:"Pracuj z dokumentami, stronami i bazami swojego zespołu.",guide:"https://developers.notion.com/guides/mcp/get-started-with-mcp",color:"#7d8291"},
 {id:"firecrawl",name:"Firecrawl",icon:"globe",description:"Szukaj w internecie i zamieniaj strony w materiały do analizy.",guide:"https://docs.firecrawl.dev/mcp-server",color:"#b96536"},
];
const stateLabels={disconnected:"Niepołączony",connecting:"Oczekiwanie na logowanie…",connected:"Połączony",error:"Sprawdź połączenie"};
function message(error:unknown) {
 const value=String(error);
 if(value.includes("GOOGLE_CLIENT_REQUIRED"))return "Dodaj Client ID aplikacji typu Desktop z Google Cloud. Włącz Google Drive API, potem zaloguj się.";
 if(value.includes("CONNECTION_BUSY"))return "Dokończ lub anuluj poprzednie logowanie.";
 if(value.includes("ENCRYPTION"))return "Systemowy magazyn szyfrowania jest niedostępny. Połączenie nie zostało zapisane.";
 if(value.includes("TIMEOUT"))return "Upłynął czas logowania. Spróbuj ponownie.";
 if(value.includes("CANCELLED"))return "Logowanie anulowane.";
 if(value.includes("AUTH_DENIED"))return "Dostęp nie został zatwierdzony w przeglądarce.";
 return "Nie udało się zakończyć operacji. Sprawdź dostęp do konta i instrukcję dostawcy. Canva może wymagać zarejestrowania klienta OAuth.";
}
export function PluginsHub({projects}:{projects:Project[]}) {
 const api=window.agenting!;
 const [statuses,setStatuses]=useState<IntegrationStatus[]>([]),[selected,setSelected]=useState<IntegrationId>("notion"),[tools,setTools]=useState<McpTool[]>([]);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[apiKey,setApiKey]=useState(""),[clientId,setClientId]=useState(""),[secret,setSecret]=useState("");
 const [toolName,setToolName]=useState(""),[args,setArgs]=useState("{}"),[consent,setConsent]=useState(false),[result,setResult]=useState<{text:string;isError:boolean}|null>(null),[project,setProject]=useState(projects[0]?.id??"");
 const item=catalog.find(p=>p.id===selected)!,status=statuses.find(s=>s.id===selected),tool=tools.find(t=>t.name===toolName);
 async function refresh(){setStatuses(await api.integrationList());}
 useEffect(()=>{let active=true;const load=()=>void api.integrationList().then(s=>{if(active)setStatuses(s);}).catch(()=>{if(active)setNotice("Nie udało się wczytać połączeń.");});load();const timer=setInterval(load,2000);return()=>{active=false;clearInterval(timer);};},[]);
 useEffect(()=>{let active=true;setResult(null);setToolName("");setTools([]);setArgs("{}");setConsent(false);setApiKey("");setClientId("");setSecret("");setNotice("");void api.integrationTools({id:selected}).then(t=>{if(active)setTools(t);}).catch(()=>{});return()=>{active=false;};},[selected,status?.state]);
 async function act(action:()=>Promise<unknown>,done="Gotowe.") {setBusy(true);setNotice("");try{await action();await refresh();setNotice(done);}catch(error){setNotice(message(error));}finally{setBusy(false);}}
 return <section className="plugins-hub"><header className="library-heading"><div><h1>Pluginy</h1><p>Twoje aplikacje, połączone z workspace.</p></div><span className="helper">{statuses.filter(s=>s.state==="connected").length} aktywnych</span></header>
  <div className="integration-grid">{catalog.map(p=>{const connection=statuses.find(s=>s.id===p.id);return <button key={p.id} className={`integration-card ${connection?.state??"disconnected"} ${selected===p.id?"selected":""}`} aria-pressed={selected===p.id} disabled={busy} onClick={()=>setSelected(p.id)}><span className="integration-icon" style={{color:p.color}}><Icon name={p.icon}/></span><strong>{p.name}</strong><span>{p.description}</span><small>{stateLabels[connection?.state??"disconnected"]}</small></button>;})}</div>
  <section className="integration-detail" aria-label={`Połączenie ${item.name}`}><header><h2>{item.name}</h2><button className="text-action" onClick={()=>void api.openExternalLink?.({url:item.guide}).catch(()=>setNotice("Nie udało się otworzyć instrukcji."))}>Instrukcja dostawcy <Icon name="arrow"/></button></header>
   <p className="helper">Zatwierdzasz dostęp w przeglądarce. Klucze i sesje są szyfrowane lokalnie. Wyłączenie zamyka połączenie w Agenting OS; uprawnienia możesz też cofnąć u dostawcy.</p>
   <div className="panel-actions">
    <button className="primary" disabled={busy||status?.state==="connected"||!status?.encryptionAvailable} onClick={()=>void act(()=>api.integrationConnect({id:selected}),"Połączono. Narzędzia są dostępne poniżej.")}><Icon name="globe"/>{status?.configured?"Połącz ponownie":"Połącz konto"}</button>
    {(status?.state==="connected"||status?.state==="connecting")&&<button className="secondary" onClick={()=>void api.integrationDisconnect({id:selected}).then(refresh).catch(e=>setNotice(message(e)))}>{status.state==="connecting"?"Anuluj logowanie":"Wyłącz plugin"}</button>}
    {status?.configured&&<button className="text-action" disabled={busy} onClick={()=>void act(()=>api.integrationDisconnect({id:selected,forget:true}),"Usunięto zapisane połączenie z tej aplikacji.")}>Usuń zapisane połączenie</button>}
   </div>
   {(selected==="google-drive"||selected==="canva"||selected==="firecrawl")&&<details className="integration-credentials" open={selected==="google-drive"&&!status?.configured}><summary>{selected==="firecrawl"?"Połączenie kluczem API": "Konfiguracja OAuth"}</summary>
    {selected==="google-drive"&&<p>W Google Cloud utwórz klienta OAuth typu <strong>Desktop app</strong> i włącz Google Drive API. Dostęp jest tylko do odczytu. Dla aplikacji w trybie testowym dodaj swoje konto jako użytkownika testowego.</p>}
    {selected==="canva"&&<p>Jeśli Canva wymaga własnej aplikacji, włącz Canva MCP w portalu dewelopera i dodaj adres powrotu: <code>http://127.0.0.1:48573/callback</code>.</p>}
    <form onSubmit={e=>{e.preventDefault();void act(async()=>{await api.integrationSave({id:selected,...(selected==="firecrawl"?{apiKey}:{clientId,clientSecret:secret})});setApiKey("");setClientId("");setSecret("");},"Zapisano konfigurację. Teraz wybierz Połącz konto.");}}>
     {selected==="firecrawl"?<label>Klucz API Firecrawl<input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} required maxLength={4096}/></label>:<><label>Client ID<input autoComplete="off" value={clientId} onChange={e=>setClientId(e.target.value)} required maxLength={4096}/></label><label>Client secret<input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} maxLength={4096}/></label></>}
     <button className="secondary" disabled={busy||status?.state==="connected"||!status?.encryptionAvailable}>Zapisz konfigurację</button>
    </form></details>}
   {notice&&<p role="status" className="integration-notice">{notice}</p>}
   {status?.state==="connected"&&<section className="plugin-tools"><h3>Narzędzia · {tools.length}</h3><p className="helper">Wykonaj wybrane narzędzie, a wynik możesz przekazać agentom przez pamięć projektu. Operacje mogą zmieniać dane lub zużywać limit usługi.</p>
    <label>Wybierz narzędzie<select value={toolName} onChange={e=>{setToolName(e.target.value);setConsent(false);setResult(null);setArgs("{}");}}><option value="">Wybierz…</option>{tools.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select></label>
    {tool&&<><p>{tool.description}</p><details><summary>Format parametrów</summary><pre>{JSON.stringify(tool.inputSchema,null,2)}</pre></details><label>Parametry (JSON)<textarea rows={5} value={args} onChange={e=>{setArgs(e.target.value);setConsent(false);}} spellCheck={false}/></label><label className="plugin-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Zezwalam na wykonanie tego narzędzia z podanymi parametrami.</label><button className="primary" disabled={busy||!consent} onClick={()=>void act(async()=>{const parsed:unknown=JSON.parse(args);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("INVALID_ARGUMENTS");setResult(await api.integrationCall({id:selected,name:toolName,arguments:parsed as Record<string,unknown>,consent:true}));setConsent(false);},"Narzędzie zakończyło pracę. Sprawdź wynik poniżej.")}>Wykonaj narzędzie</button></>}
    {result&&<div className="plugin-result"><h3>{result.isError?"Narzędzie zgłosiło błąd":"Wynik"}</h3><pre>{result.text}</pre>{!result.isError&&<div className="panel-actions"><select aria-label="Projekt dla wyniku pluginu" value={project} onChange={e=>setProject(e.target.value)}><option value="">Wybierz projekt…</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="secondary" disabled={!project||busy||!result.text} onClick={()=>void act(()=>api.createMemory({projectId:project,scope:"project",source:`${item.name} · ${toolName}`,content:result.text.slice(0,6000)}),"Wynik dodano do pamięci projektu. Agenci mogą korzystać z niego w kolejnych rozmowach.")}>Dodaj wynik do pamięci</button></div>}</div>}
   </section>}
  </section>
 </section>;
}
