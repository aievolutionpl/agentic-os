import type { ProviderQuotaCard, ProviderSetting } from "./shared.js";

/** Show actual enabled accounts once, rather than both OpenCode and its billing provider. */
export function activeQuotaCards(cards: ProviderQuotaCard[], providers: ProviderSetting[], hidden: string[] = []) {
  const enabled = new Set(providers.filter(p => p.configured).map(p => String(p.id)));
  const used = cards.filter(c => c.id !== "gemini" && (c.isCustom || enabled.has(c.id) || (c.id === "openrouter" && cards.some(other => other.via === c.id && enabled.has(other.id)))));
  return used.filter(c => !hidden.includes(c.id) && !(c.via && used.some(other => other.id === c.via && !hidden.includes(other.id))));
}
