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
/** Miniature of each palette for the Settings gallery: navigation, page, surface, accent. */
export const THEME_PREVIEWS: Record<ThemeMode, {nav:string;bg:string;surface:string;accent:string}> = {
  white: {nav:"#f5f6f8",bg:"#ffffff",surface:"#dce1e8",accent:"#285fc1"},
  light: {nav:"#dfe8f2",bg:"#eaf0f5",surface:"#ffffff",accent:"#2e618d"},
  classic: {nav:"#eee3d7",bg:"#f3efe9",surface:"#fffdfa",accent:"#a74325"},
  dark: {nav:"#122136",bg:"#0c1522",surface:"#1b2b40",accent:"#a5d8f4"},
  claude: {nav:"#20272c",bg:"#15181b",surface:"#282e33",accent:"#bdcbd6"},
  codex: {nav:"#12111c",bg:"#08070e",surface:"#27243c",accent:"#ffb23e"},
  matrix: {nav:"#010804",bg:"#010603",surface:"#0b2515",accent:"#39ff7a"},
};
