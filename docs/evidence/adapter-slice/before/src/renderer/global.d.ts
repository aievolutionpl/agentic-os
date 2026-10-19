import type { API } from "../shared";
declare global {
  interface Window {
    agenting?: API;
  }
}
