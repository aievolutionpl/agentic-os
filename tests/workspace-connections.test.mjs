import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../dist/main/store.js';
import {activeQuotaCards} from '../dist/quota-visibility.js';
import {Integrations,integrationUrl} from '../dist/main/integrations.js';
import {oauthCallback} from '../dist/main/plugin-oauth.js';

test('dashboard includes enabled accounts only, with one card per billing source',()=>{
 const cards=[{id:'codex'},{id:'claude'},{id:'opencode',via:'openrouter'},{id:'openrouter'},{id:'antigravity'},{id:'own',isCustom:true}];
 const providers=[{id:'codex',configured:true},{id:'claude',configured:false},{id:'opencode',configured:true}];
 assert.deepEqual(activeQuotaCards(cards,providers).map(c=>c.id),['codex','openrouter','own']);
 assert.deepEqual(activeQuotaCards(cards,[]).map(c=>c.id),['own']);
});
test('disabled skills leave discovery and context, preserving edits through re-enable',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agenting-toggle-')),store=new Store(join(dir,'test.sqlite'));
 try {
  const p=store.createProject({name:'Skills',root:dir,master:'codex'}),id='builtin:copywriting';
  await store.extensions.install(p.id,id);
  const path=join(dir,'.agents/skills/copywriting/SKILL.md'),disabled=join(dir,'.agents/disabled-skills/copywriting/SKILL.md');
  writeFileSync(path,readFileSync(path,'utf8')+'\nLocal edit.\n');
  store.extensions.toggle({projectId:p.id,id,enabled:false});
  assert.equal(store.extensions.get(p.id,id).enabled,false);assert.equal(existsSync(path),false);assert.equal(existsSync(disabled),true);
  assert.ok(!store.extensions.skills(p.id,[id]).some(s=>s.id===id));
  await store.extensions.install(p.id,id);assert.equal(existsSync(path),false,'Install must not silently re-enable');
  store.extensions.toggle({projectId:p.id,id,enabled:true});
  assert.match(readFileSync(path,'utf8'),/Local edit/);assert.ok(store.extensions.skills(p.id,[]).some(s=>s.id===id));
  store.db.exec("CREATE TRIGGER reject_toggle BEFORE UPDATE ON extensions BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END");
  assert.throws(()=>store.extensions.toggle({projectId:p.id,id,enabled:false}),/fixture write failure/);
  assert.equal(existsSync(path),true,'Database failures must restore active skill files');
  assert.equal(store.extensions.get(p.id,id).enabled,true);
  store.db.exec("DROP TRIGGER reject_toggle");
  store.runs.configure('codex',process.execPath,[],'codex');store.runs.disableProvider('codex');
  assert.equal(store.runs.provider('codex').consent,false);assert.equal(store.runs.provider('codex').command,process.execPath);
 }finally{store.close();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('plugin network blocks non-provider hosts, credentials and loopback',()=>{
 for(const url of ['http://mcp.notion.com/mcp','https://notion.com.evil.test','https://127.0.0.1','https://x:y@mcp.notion.com/mcp','https://mcp.notion.com:8080'])assert.throws(()=>integrationUrl('notion',url));
 assert.equal(integrationUrl('notion','https://mcp.notion.com/mcp').hostname,'mcp.notion.com');
});
test('OAuth callback rejects wrong state and closes on cancellation',async()=>{
 const callback=await oauthCallback(0);
 try {
  assert.equal((await fetch(callback.url+'?code=bad&state=wrong')).status,400);
  const response=await fetch(callback.url+'?code=verified&state='+callback.state);
  assert.equal(response.status,200);assert.equal(await callback.code,'verified');
 }finally{callback.close();}
 const cancelled=await oauthCallback(0);cancelled.close();await assert.rejects(cancelled.code,/CANCELLED/);
});
test('remote MCP connects, paginates, requires consent and disconnects without leaking secrets',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agenting-plugin-')),key='fc-unit-test-secret';
 const secrets={available:()=>true,encrypt:v=>Buffer.from(Buffer.from(v).toString('base64')),decrypt:v=>Buffer.from(v.toString(),'base64').toString()};
 const calls=[];
 const fetcher=async(url,options)=>{
  const request=new Request(url,options);
  calls.push({url:request.url,headers:request.headers});
  const raw=await request.text();const body=raw?JSON.parse(raw):null;
  if(body?.id===undefined)return new Response(null,{status:202});
  let result;
  if(body.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
  else if(body.method==='tools/list')result=body.params?.cursor?{tools:[{name:'second',inputSchema:{type:'object'}}]}:{tools:[{name:'first',inputSchema:{type:'object'}}],nextCursor:'next'};
  else result={content:[{type:'text',text:'Verified fixture result'}]};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{headers:{'Content-Type':'application/json'}});
 };
 const plugins=new Integrations(dir,secrets,async()=>{throw Error('Should not open browser for API key');},fetcher);
 try {
  plugins.save({id:'firecrawl',apiKey:key});
  assert.ok(!readFileSync(join(dir,'plugin-connections.enc'),'utf8').includes(key));
  assert.ok(!JSON.stringify(plugins.list()).includes(key));
  await plugins.connect({id:'firecrawl'});
  assert.equal(plugins.list().find(p=>p.id==='firecrawl').state,'connected');
  assert.equal(plugins.listTools({id:'firecrawl'}).length,2);
  await assert.rejects(plugins.call({id:'firecrawl',name:'first',arguments:{},consent:false}),/EXPLICIT_CALL/);
  assert.equal((await plugins.call({id:'firecrawl',name:'first',arguments:{},consent:true})).text,'Verified fixture result');
  await plugins.disconnect({id:'firecrawl',forget:true});
  await assert.rejects(plugins.call({id:'firecrawl',name:'first',arguments:{},consent:true}),/NOT_READY/);
  assert.equal(plugins.list().find(p=>p.id==='firecrawl').configured,false);
  assert.ok(calls.every(c=>c.url.startsWith('https://mcp.firecrawl.dev/')&&!c.url.includes(key)));
 }finally{await plugins.close();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
