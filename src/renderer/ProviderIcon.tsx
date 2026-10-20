import React from "react";
import codex from "@lobehub/icons-static-svg/icons/codex.svg";
import claude from "@lobehub/icons-static-svg/icons/claude-color.svg";
import hermes from "@lobehub/icons-static-svg/icons/hermesagent.svg";
import antigravity from "@lobehub/icons-static-svg/icons/antigravity-color.svg";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg";
import github from "@lobehub/icons-static-svg/icons/github.svg";

// Brand artwork distributed by Lobe Icons (MIT), bundled locally.
const brands: Record<string, string> = { codex, claude, hermes, antigravity, opencode, openrouter, github };
export function ProviderIcon({ provider }: { provider: string }) {
  const asset = brands[provider];
  return <span className={`provider-glyph glyph-${provider}`} aria-hidden="true">
    {asset ? ["claude", "antigravity"].includes(provider)
      ? <img src={asset} alt="" />
      : <span className="brand-mask" style={{ maskImage: `url("${asset}")`, WebkitMaskImage: `url("${asset}")` }} />
      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8m-4-4v4M8 9h8m-8 3h5"/></svg>}
  </span>;
}
