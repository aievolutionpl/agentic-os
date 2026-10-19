import { text } from "./validate.js";
function local(host: string) {
  return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(host);
}
function privateHost(host: string) {
  return (
    local(host) ||
    /^(0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(
      host,
    )
  );
}
export function browserUrl(value: unknown, allowLocal = true): string {
  const url = new URL(text(value, 8192));
  if (
    url.username ||
    url.password ||
    !(
      (url.protocol === "https:" && !privateHost(url.hostname)) ||
      (allowLocal &&
        local(url.hostname) &&
        ["http:", "https:"].includes(url.protocol))
    )
  )
    throw Error("UNSAFE_BROWSER_URL");
  return url.href;
}
export function isLocalUrl(value: string) {
  try {
    return local(new URL(value).hostname);
  } catch {
    return false;
  }
}
