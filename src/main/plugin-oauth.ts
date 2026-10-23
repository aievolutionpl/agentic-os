import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

/** One loopback callback, validated before accepting a code. Nothing binds to LAN. */
export async function oauthCallback(port = 48573) {
  const state = randomBytes(32).toString("base64url");
  let accept!: (code: string) => void, reject!: (error: Error) => void;
  const code = new Promise<string>((resolve, fail) => { accept=resolve; reject=fail; });
  void code.catch(() => {});
  const server = createServer((req,res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    if (req.method !== "GET" || url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
      res.writeHead(400);res.end("Invalid authorization callback.");return;
    }
    const value=url.searchParams.get("code");
    if (url.searchParams.has("error") || !value || value.length>4096) {
      reject(Error("PLUGIN_AUTH_DENIED"));res.end("Nie przyznano dostępu. Wróć do Agenting OS.");
    } else {accept(value);res.end("Autoryzacja odebrana. Wróć do Agenting OS, aby sprawdzić połączenie.");}
    server.close();
  });
  await new Promise<void>((resolve,fail) => {server.once("error",fail);server.listen(port,"127.0.0.1",resolve);});
  const address=server.address();
  if (!address || typeof address === "string") throw Error("PLUGIN_CALLBACK_FAILED");
  const timer=setTimeout(()=>{reject(Error("PLUGIN_AUTH_TIMEOUT"));server.close();},180000);
  return {state,code,url:`http://127.0.0.1:${address.port}/callback`,close(){clearTimeout(timer);reject(Error("PLUGIN_AUTH_CANCELLED"));server.close();server.closeAllConnections();}};
}
