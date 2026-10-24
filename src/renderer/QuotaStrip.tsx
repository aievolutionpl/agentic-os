import React, { useEffect, useState } from "react";
import type { ProviderQuotaCard } from "../shared";
import { ProviderIcon } from "./ProviderIcon";
import { quotaSummary } from "./LimitLink";
import { activeQuotaCards } from "../quota-visibility";
import { Icon } from "./ui";

export function QuotaStrip({pl,onOpen}:{pl:boolean;onOpen:()=>void}) {
  const [cards,setCards]=useState<ProviderQuotaCard[]>([]),[failed,setFailed]=useState(false);
  useEffect(()=>{
    let alive=true,pending=false;
    const read=async()=>{if(pending||!window.agenting?.quotaScan)return;pending=true;try{const [result,providers]=await Promise.all([window.agenting.quotaScan(),window.agenting.providerSettings()]);if(alive){setCards(activeQuotaCards(result,providers));setFailed(false);}}catch{if(alive)setFailed(true);}finally{pending=false;}};
    const changed=()=>void read();window.addEventListener("agenting:evidence",changed);void read();const timer=setInterval(()=>void read(),60000);return()=>{alive=false;clearInterval(timer);window.removeEventListener("agenting:evidence",changed);};
  },[]);
  return <nav className="quota-strip" aria-label={pl?"Pozostałe limity subskrypcji":"Remaining subscription limits"}>
    <button className="quota-strip-label" onClick={onOpen}><Icon name="tokens"/>{pl?"Pozostało":"Remaining"}</button>
    <div className="quota-strip-items">{cards.map(card=>{
      const summary=quotaSummary(card,pl),stale=failed||!Number.isFinite(Date.parse(card.updatedAt))||Date.now()-Date.parse(card.updatedAt)>600000;
      const match = summary?.value.match(/^(\d+)%/);
      const remaining = match ? Math.min(100,Math.max(0,Number(match[1]))) : null;
      return <button className={`quota-mini ${card.status} ${stale?"stale":""}`} key={card.id} aria-label={`${card.name}: ${summary?.value ?? (pl ? "Brak odczytu" : "Unavailable")}${stale ? (pl ? ", starszy odczyt" : ", stale reading") : ""}`} onClick={onOpen} title={`${card.name}${stale ? (pl ? " · starszy odczyt" : " · stale") : ""} · ${summary?.note??card.detail??""} · ${new Date(card.updatedAt).toLocaleString(pl?"pl":"en")}`}>
        {remaining !== null && <svg className="quota-ring" viewBox="0 0 32 32" aria-hidden="true"><circle className="quota-ring-track" cx="16" cy="16" r="12"/><circle className="quota-ring-value" cx="16" cy="16" r="12" pathLength="100" strokeDasharray={`${remaining} 100`} transform="rotate(-90 16 16)"/></svg>}<ProviderIcon provider={card.icon}/><span>{card.name}</span><strong>{summary?.value.replace(/ (zostało|left|salda)$/,"" )??(pl?"Brak odczytu":"Unavailable")}{stale&&summary?<small className="quota-stale-dot" aria-label={pl?"Starszy odczyt":"Stale reading"}>•</small>:null}</strong>
      </button>;
    })}{!cards.length&&<button className="quota-empty" onClick={onOpen}>{failed?(pl?"Nie udało się odczytać limitów":"Could not read limits"):(pl?"Połącz subskrypcje":"Connect subscriptions")}</button>}</div>
  </nav>;
}
