import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens, OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { IntegrationId, IntegrationStatus, McpTool } from "../shared.js";
import type { SecretStorage } from "./openrouter.js";
import { exact, text, object, redact } from "./validate.js";
import { oauthCallback } from "./plugin-oauth.js";

const endpoints = {notion:"https://mcp.notion.com/mcp",canva:"https://mcp.canva.com/mcp",firecrawl:"https://mcp.firecrawl.dev/v2/mcp-oauth"};
const ids: IntegrationId[]=["google-drive","canva","notion","firecrawl"];
type Saved = {apiKey?:string;clientId?:string;clientSecret?:string;client?:OAuthClientInformationMixed;tokens?:OAuthTokens;expiresAt?:number};
const driveTools:McpTool[]=[
  {name:"drive_search",description:"Znajdź pliki i foldery na Google Drive (tylko odczyt).",inputSchema:{type:"object",properties:{query:{type:"string"},pageToken:{type:"string"}},additionalProperties:false}},
  {name:"drive_read",description:"Odczytaj plik tekstowy, dokument Google lub arkusz CSV (do 1 MB).",inputSchema:{type:"object",properties:{fileId:{type:"string"}},required:["fileId"],additionalProperties:false}},
];
export function integrationId(value: unknown): IntegrationId {
  if (!ids.includes(value as IntegrationId)) throw Error("INVALID_PLUGIN");return value as IntegrationId;
}
/** OAuth discovery may only contact the selected provider, never arbitrary LAN hosts. */
export function integrationUrl(id:IntegrationId,value:string|URL) {
  const url=new URL(value);
  const domains=id==="google-drive"?["googleapis.com","accounts.google.com"]:id==="notion"?["notion.com","notion.so"]:id==="canva"?["canva.com"]:["firecrawl.dev"];
  if(url.protocol!=="https:" || url.username || url.password || (url.port && url.port!=="443") || !domains.some(d=>url.hostname===d || url.hostname.endsWith("."+d))) throw Error("PLUGIN_HOST_BLOCKED");
  return url;
}
export class Integrations {
  private clients=new Map<IntegrationId,Client>();
  private tools=new Map<IntegrationId,McpTool[]>();
  private states=new Map<IntegrationId,IntegrationStatus["state"]>();
  private operations=new Map<IntegrationId,AbortController>();
  private cancelOAuth?:()=>void;
  private sessions=new Map<IntegrationId,AbortController>();
  private calling=new Set<IntegrationId>();
  private readonly file:string;
  constructor(private directory:string,private secrets:SecretStorage,private open:(url:string)=>Promise<void>,private fetcher:typeof fetch=fetch) {this.file=join(directory,"plugin-connections.enc");}
  private read():Partial<Record<IntegrationId,Saved>> {
    if(!existsSync(this.file))return {};
    if(!this.secrets.available())throw Error("PLUGIN_ENCRYPTION_UNAVAILABLE");
    return JSON.parse(this.secrets.decrypt(readFileSync(this.file)));
  }
  private write(id:IntegrationId,value:Saved|undefined) {
    if(!this.secrets.available())throw Error("PLUGIN_ENCRYPTION_UNAVAILABLE");
    const all=this.read();if(value)all[id]=value;else delete all[id];
    mkdirSync(this.directory,{recursive:true});
    writeFileSync(this.file+".tmp",this.secrets.encrypt(JSON.stringify(all)),{mode:0o600});renameSync(this.file+".tmp",this.file);
  }
  list():IntegrationStatus[] {
    const encryptionAvailable=this.secrets.available();let saved:Partial<Record<IntegrationId,Saved>>={};
    try{saved=this.read();}catch{/* A locked vault never implies a connected account. */}
    return ids.map(id=>({id,state:this.states.get(id)??"disconnected",configured:!!saved[id],toolCount:this.tools.get(id)?.length??0,encryptionAvailable}));
  }
  save(input:unknown) {
    const p=exact(input,["id","apiKey","clientId","clientSecret"]),id=integrationId(p.id);
    if(this.operations.has(id)||this.clients.has(id)||this.states.get(id)==="connected")throw Error("PLUGIN_DISCONNECT_FIRST");
    const value=this.read()[id]??{};
    for(const key of ["apiKey","clientId","clientSecret"] as const) if(p[key]!==undefined) {
      if(key==="apiKey" && id!=="firecrawl")throw Error("INVALID_INPUT");
      value[key]=text(p[key],4096,true).trim()||undefined;
    }
    if(id==="google-drive" && (!value.clientId?.endsWith(".apps.googleusercontent.com")))throw Error("PLUGIN_GOOGLE_CLIENT_REQUIRED");
    // Credentials identify a different account/client; never reuse its old grant.
    delete value.tokens;delete value.client;delete value.expiresAt;this.write(id,value);
  }
  private network(id:IntegrationId,signal?:AbortSignal):typeof fetch {
    return async(input,init)=>{
      const url=integrationUrl(id,input instanceof Request?input.url:String(input));
      const request=new Request(input,init);
      const response=await this.fetcher(new Request(url,request),{redirect:"error",signal:AbortSignal.any([AbortSignal.timeout(60000),...(signal?[signal]:[]),request.signal])});
      // Bound JSON and SSE messages while preserving streaming for the SDK.
      if(!response.body)return response;
      let size=0;
      const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;if(size>4*1024*1024)throw Error("PLUGIN_RESPONSE_LIMIT");controller.enqueue(chunk);}}));
      return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
    };
  }
  async connect(input:unknown) {
    const p=exact(input,["id"]),id=integrationId(p.id);
    if(this.operations.size)throw Error("PLUGIN_CONNECTION_BUSY");
    if(this.states.get(id)==="connected")return;
    if(!this.secrets.available())throw Error("PLUGIN_ENCRYPTION_UNAVAILABLE");
    const operation=new AbortController();this.operations.set(id,operation);this.states.set(id,"connecting");
    let callback:Awaited<ReturnType<typeof oauthCallback>>|undefined;
    let client:Client|undefined;
    try {
      const saved=this.read()[id]??{};
      callback=await oauthCallback();this.cancelOAuth=()=>callback?.close();
      if(id==="google-drive") {
        if(!saved.clientId)throw Error("PLUGIN_GOOGLE_CLIENT_REQUIRED");
        if(!saved.tokens) {
          const verifier=randomBytes(32).toString("base64url"),url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
          url.search=new URLSearchParams({client_id:saved.clientId,redirect_uri:callback.url,response_type:"code",scope:"https://www.googleapis.com/auth/drive.readonly",access_type:"offline",prompt:"consent",state:callback.state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"}).toString();
          await this.open(url.href);
          const code=await callback.code;
          await this.googleToken(saved,{code,code_verifier:verifier,redirect_uri:callback.url,grant_type:"authorization_code"},operation.signal);
        }
        await this.driveRequest(saved,"https://www.googleapis.com/drive/v3/about?fields=user(displayName)",operation.signal);
        this.tools.set(id,driveTools);
      } else {
        const network=this.network(id,operation.signal);
        let verifier="";
        const provider:OAuthClientProvider={
          redirectUrl:callback.url,
          clientMetadata:{client_name:"Agenting OS",redirect_uris:[callback.url],grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:saved.clientSecret?"client_secret_post":"none"},
          state:()=>callback!.state,
          clientInformation:()=>saved.client??(saved.clientId?{client_id:saved.clientId,...(saved.clientSecret?{client_secret:saved.clientSecret}:{})}:undefined),
          saveClientInformation:value=>{operation.signal.throwIfAborted();saved.client=value;this.write(id,saved);},
          tokens:()=>saved.tokens,
          saveTokens:value=>{operation.signal.throwIfAborted();saved.tokens=value;this.write(id,saved);},
          redirectToAuthorization:url=>this.open(integrationUrl(id,url).href),
          saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>verifier,
          invalidateCredentials:scope=>{operation.signal.throwIfAborted();if(scope==="all"||scope==="tokens")delete saved.tokens;if(scope==="all"||scope==="client")delete saved.client;this.write(id,saved);},
        };
        const makeTransport=()=>new StreamableHTTPClientTransport(new URL(id==="firecrawl"&&saved.apiKey?"https://mcp.firecrawl.dev/v2/mcp":endpoints[id]),{fetch:network,authProvider:saved.apiKey?undefined:provider,requestInit:saved.apiKey?{headers:{Authorization:`Bearer ${saved.apiKey}`}}:undefined});
        let transport=makeTransport();
        client=new Client({name:"Agenting OS",version:"0.5.0"});
        try {await client.connect(transport);} catch(error) {
          if(!(error instanceof UnauthorizedError))throw error;
          await transport.finishAuth(await callback.code);
          await client.close();
          client=new Client({name:"Agenting OS",version:"0.5.0"});transport=makeTransport();
          await client.connect(transport);
        }
        const tools:McpTool[]=[],seen=new Set<string>();let cursor:string|undefined;
        for(let page=0;page<10;page++) {
          const result=await client.listTools(cursor?{cursor}:undefined);
          for(const tool of result.tools) {
            if(tools.length>=200||tools.some(t=>t.name===tool.name)||JSON.stringify(tool.inputSchema).length>16000)throw Error("PLUGIN_TOOL_LIMIT");
            tools.push({name:tool.name,description:tool.description?.slice(0,4000)??"",inputSchema:tool.inputSchema});
          }
          if(!result.nextCursor)break;
          if(page===9||seen.has(result.nextCursor))throw Error("PLUGIN_TOOL_LIMIT");
          cursor=result.nextCursor;seen.add(cursor);
        }
        operation.signal.throwIfAborted();this.clients.set(id,client);this.tools.set(id,tools);
        const connectedClient=client;
        client.onclose=()=>{
          if(this.clients.get(id)!==connectedClient)return;
          this.clients.delete(id);this.tools.delete(id);this.states.set(id,"error");
          this.sessions.get(id)?.abort();this.sessions.delete(id);
        };
      }
      operation.signal.throwIfAborted();this.sessions.set(id,operation);this.states.set(id,"connected");
    } catch(error) {
      await client?.close().catch(()=>{});this.clients.delete(id);this.tools.delete(id);
      if(!operation.signal.aborted)this.states.set(id,"error");
      const message=error instanceof Error?error.message:"";
      throw Error(message.startsWith("PLUGIN_")?message:"PLUGIN_CONNECTION_FAILED");
    } finally {callback?.close();this.cancelOAuth=undefined;this.operations.delete(id);}
  }
  async disconnect(input:unknown) {
    const p=exact(input,["id","forget"]),id=integrationId(p.id);
    if(p.forget!==undefined && typeof p.forget!=="boolean")throw Error("INVALID_INPUT");
    if(this.operations.has(id)){this.operations.get(id)!.abort();this.cancelOAuth?.();}
    this.sessions.get(id)?.abort();this.sessions.delete(id);
    const client=this.clients.get(id);this.clients.delete(id);this.tools.delete(id);this.states.set(id,"disconnected");
    await client?.close().catch(()=>{});
    if(p.forget)this.write(id,undefined);
  }
  listTools(input:unknown) {const p=exact(input,["id"]);return this.tools.get(integrationId(p.id))??[];}
  async call(input:unknown) {
    const p=exact(input,["id","name","arguments","consent"]),id=integrationId(p.id),name=text(p.name,128),args=object(p.arguments);
    if(p.consent!==true||JSON.stringify(args).length>16000)throw Error("EXPLICIT_CALL_REQUIRED");
    if(this.states.get(id)!=="connected"||!this.tools.get(id)?.some(t=>t.name===name)||this.calling.has(id))throw Error("PLUGIN_NOT_READY");
    this.calling.add(id);
    try {
      if(id==="google-drive")return {isError:false,text:redact(await this.driveCall(name,args),32000)};
      const result=await this.clients.get(id)!.callTool({name,arguments:args},undefined,{timeout:60000});
      const blocks=Array.isArray(result.content)?result.content:[];
      const content=blocks.map(b=>b.type==="text"?String(b.text):"[Wynik nietekstowy]").join("\n");
      return {isError:result.isError===true,text:redact(content,32000)};
    } catch {throw Error("PLUGIN_CALL_FAILED");} finally {this.calling.delete(id);}
  }
  private async googleToken(saved:Saved,params:Record<string,string>,signal?:AbortSignal) {
    const response=await this.network("google-drive",signal)("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({...params,client_id:saved.clientId!,...(saved.clientSecret?{client_secret:saved.clientSecret}:{})})});
    if(!response.ok)throw Error("PLUGIN_AUTH_FAILED");
    const data=object(await response.json());
    saved.tokens={access_token:text(data.access_token,16000),token_type:"Bearer",refresh_token:typeof data.refresh_token==="string"?data.refresh_token:saved.tokens?.refresh_token};
    signal?.throwIfAborted();
    saved.expiresAt=Date.now()+Math.max(0,Number(data.expires_in)||3600)*1000;this.write("google-drive",saved);
  }
  private async driveRequest(saved:Saved,url:string,signal?:AbortSignal) {
    signal ??= this.sessions.get("google-drive")?.signal;
    if(!saved.tokens)throw Error("PLUGIN_AUTH_REQUIRED");
    if((saved.expiresAt??0)<Date.now()+60000 && saved.tokens.refresh_token)await this.googleToken(saved,{grant_type:"refresh_token",refresh_token:saved.tokens.refresh_token},signal);
    const response=await this.network("google-drive",signal)(url,{headers:{Authorization:`Bearer ${saved.tokens.access_token}`}});
    if(!response.ok)throw Error("PLUGIN_DRIVE_FAILED");return response;
  }
  private async driveCall(name:string,args:Record<string,unknown>) {
    const saved=this.read()["google-drive"]!;
    if(name==="drive_search") {
      const p=exact(args,["query","pageToken"]),query=p.query?text(p.query,500):"";
      const url=new URL("https://www.googleapis.com/drive/v3/files");
      url.search=new URLSearchParams({pageSize:"50",fields:"nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",q:"trashed=false"+(query?` and name contains '${query.replaceAll("\\","\\\\").replaceAll("'","\\'")}'`:""),...(p.pageToken?{pageToken:text(p.pageToken,4096)}:{})}).toString();
      return JSON.stringify(await (await this.driveRequest(saved,url.href)).json(),null,2);
    }
    const p=exact(args,["fileId"]),fileId=text(p.fileId,200);
    if(!/^[\w-]+$/.test(fileId))throw Error("INVALID_INPUT");
    const base=`https://www.googleapis.com/drive/v3/files/${fileId}`;
    const meta=object(await (await this.driveRequest(saved,base+"?fields=mimeType,size")).json());
    if(Number(meta.size)>1000000)throw Error("PLUGIN_RESPONSE_LIMIT");
    const mime=String(meta.mimeType),exportMime=mime==="application/vnd.google-apps.document"?"text/plain":mime==="application/vnd.google-apps.spreadsheet"?"text/csv":null;
    if(!exportMime&&!mime.startsWith("text/")&&mime!=="application/json")throw Error("PLUGIN_TEXT_ONLY");
    const response=await this.driveRequest(saved,base+(exportMime?`/export?mimeType=${encodeURIComponent(exportMime)}`:"?alt=media"));
    const body=await response.text();if(Buffer.byteLength(body)>1000000)throw Error("PLUGIN_RESPONSE_LIMIT");return body;
  }
  async close(){for(const id of ids)await this.disconnect({id});}
}
