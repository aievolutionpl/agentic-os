import type { ThemeMode } from "../shared";
/** Visible palettes. Persisted IDs remain stable across upgrades. */
export const THEME_CHOICES: {value:ThemeMode;label:string}[] = [
  {value:"white",label:"Pure White"},
  {value:"light",label:"Pearl"},
  {value:"classic",label:"Light Orange"},
  {value:"dark",label:"Midnight"},
  {value:"claude",label:"Graphite"},
  {value:"codex",label:"AI Evolution"},
  {value:"matrix",label:"Matrix Terminal"},
];
