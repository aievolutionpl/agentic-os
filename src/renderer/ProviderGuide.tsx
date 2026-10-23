import React, { useState } from "react";
import type { Agent } from "../shared";
import { Icon } from "./ui";
import { copyText } from "./clipboard";
const guides: Partial<Record<Agent, {url: string; command?: string; login: string}>> = {
  codex: {url:"https://github.com/openai/codex", command:"npm install -g @openai/codex", login:"codex login"},
  claude: {url:"https://code.claude.com/docs/en/setup", command:"winget install Anthropic.ClaudeCode", login:"claude auth login"},
  antigravity: {url:"https://antigravity.google/docs/cli/install/", command:"irm https://antigravity.google/cli/install.ps1 | iex", login:"agy"},
  opencode: {url:"https://opencode.ai/docs/", command:"npm install -g opencode-ai", login:"OpenRouter: wpisz klucz API poniżej. Nie potrzebujesz subskrypcji Codex ani Claude."},
  hermes: {url:"https://github.com/NousResearch/hermes-agent", login:"hermes setup"},
  local: {url:"https://ollama.com/download", login:"Uruchom serwer Ollama lub LM Studio i wybierz model lokalny poniżej."},
};
export function ProviderGuide({agent,pl,onDetect}: {agent:Agent;pl:boolean;onDetect:()=>Promise<void>}) {
 const guide=guides[agent];const [notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 if(!guide)return null;
 return <details className="provider-onboarding" key={agent}><summary>{pl?"Pierwsze połączenie · krok po kroku":"First connection · step by step"}</summary>
  <ol><li>{pl?"Zainstaluj narzędzie z oficjalnej strony. Polecenie poniżej jest dla Windows; npm wymaga Node.js.":"Install from the official website. The command below is for Windows; npm needs Node.js."}{guide.command&&<p><code>{guide.command}</code></p>}</li>
  <li>{pl?"Zaloguj się w terminalu i zatwierdź dostęp w przeglądarce:":"Sign in in your terminal and approve browser access:"} <code>{guide.login}</code></li>
  <li>{pl?"Wykryj instalację, wybierz „Połącz wykryte CLI”, a następnie sprawdź połączenie.":"Detect the installation, choose Connect detected CLI, then check the connection."}</li></ol>
  <div className="panel-actions"><button type="button" className="secondary" onClick={()=>void window.agenting?.openExternalLink?.({url:guide.url}).catch(()=>setNotice(pl?"Nie udało się otworzyć strony.":"Could not open website."))}><Icon name="arrow"/>{pl?"Instrukcja dostawcy":"Official guide"}</button>
  {guide.command&&<button type="button" className="secondary" onClick={()=>void copyText(guide.command!).then(()=>setNotice(pl?"Skopiowano polecenie do PowerShell.":"Command copied for PowerShell.")).catch(()=>setNotice(pl?"Nie udało się skopiować.":"Could not copy."))}><Icon name="copy"/>{pl?"Kopiuj instalację":"Copy install command"}</button>}
  <button type="button" className="secondary" disabled={busy} onClick={()=>{setBusy(true);void onDetect().then(()=>setNotice(pl?"Lista instalacji odświeżona.":"Installations refreshed.")).catch(()=>setNotice(pl?"Nie udało się wykryć instalacji.":"Detection failed.")).finally(()=>setBusy(false));}}><Icon name="refresh"/>{pl?"Wykryj instalację":"Detect installation"}</button></div>
  {notice&&<p role="status">{notice}</p>}
 </details>;
}
