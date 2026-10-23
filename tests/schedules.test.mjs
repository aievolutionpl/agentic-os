import {Chats} from "../dist/main/chats.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,SCHEMA_VERSION} from '../dist/main/store.js';
import {ScheduleRunner,nextDaily,executeScheduledChat} from '../dist/main/schedules.js';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'schedule-'));let now=new Date(2026,9,23,8,0).getTime();let store=new Store(join(dir,'db'),()=>now);const project=store.createProject({name:'Project',root:dir,master:'codex'});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {get store(){return store;},project,clock:()=>now,advance:n=>{now+=n;},reopen:()=>{store.close();store=new Store(join(dir,'db'),()=>now);},input:{title:'Review',prompt:'Inspect code read-only',projectId:project.id,agent:'codex',time:'09:00',consent:true}};}
test('Schedule validates consent, time, project and supported read-only agent',t=>{const f=fixture(t);for(const patch of [{consent:false},{time:'25:00'},{time:'9:00'},{agent:'gemini'},{agent:'antigravity'},{projectId:'unknown'},{title:''},{unexpected:1}])assert.throws(()=>f.store.schedules.save({...f.input,...patch}));assert.equal(SCHEMA_VERSION,18);});
test('Daily local schedule advances across midnight and does not replay missed days',t=>{const f=fixture(t);const job=f.store.schedules.save(f.input);assert.equal(f.store.schedules.claim(),null);f.advance(3*86400000+3600000);const claimed=f.store.schedules.claim();assert.equal(claimed.job.id,job.id);assert.equal(f.store.schedules.claim(),null);assert.ok(f.store.schedules.list()[0].nextRunAt>f.clock());f.reopen();f.store.schedules.recover();assert.equal(f.store.schedules.runs()[0].status,'interrupted');assert.equal(f.store.schedules.claim(),null);assert.equal(new Date(nextDaily('00:10',new Date(2026,9,23,23,59).getTime())).getDate(),24);});
test('Runner serializes ticks, persists result links, pause survives manual runs',async t=>{const f=fixture(t);const job=f.store.schedules.save(f.input);f.store.schedules.action({id:job.id,action:'pause'});f.advance(3600000);assert.equal(f.store.schedules.claim(),null);f.store.schedules.action({id:job.id,action:'run'});let calls=0,release;const runner=new ScheduleRunner(f.store.schedules,async(_job,onChat)=>{calls++;onChat('result-chat');await new Promise(r=>{release=r;});},f.clock);const a=runner.tick(),b=runner.tick();assert.equal(a,b);assert.equal(calls,1);assert.throws(()=>f.store.schedules.action({id:job.id,action:'run'}));release();await a;assert.equal(f.store.schedules.runs()[0].chatId,'result-chat');assert.equal(f.store.schedules.runs()[0].status,'complete');assert.equal(f.store.schedules.list()[0].enabled,false);await runner.close();});
test('Runner failures are durable and redact arbitrary provider errors; next job still runs',async t=>{const f=fixture(t);const a=f.store.schedules.save(f.input),b=f.store.schedules.save({...f.input,title:'Second'});for(const job of[a,b])f.store.schedules.action({id:job.id,action:'run'});const runner=new ScheduleRunner(f.store.schedules,async()=>{throw Error('secret provider response');},f.clock);await runner.tick();await runner.tick();assert.equal(f.store.schedules.runs().length,2);assert.ok(f.store.schedules.runs().every(r=>r.status==='failed'&&r.error==='SCHEDULE_FAILED'));await runner.close();});
test('Project rename preserves root, chats and identity and rejects invalid input',t=>{const f=fixture(t);const renamed=f.store.renameProject({id:f.project.id,name:' Nowa nazwa '});assert.equal(renamed.name,'Nowa nazwa');assert.equal(renamed.root,f.project.root);assert.equal(renamed.id,f.project.id);assert.throws(()=>f.store.renameProject({id:f.project.id,name:' '}));assert.throws(()=>f.store.renameProject({id:f.project.id,name:'valid',root:'elsewhere'}));});

test('Scheduled run uses real Chats, persists output and respects quota gate',async t=>{
  const f=fixture(t),job=f.store.schedules.save(f.input);let calls=0,exhausted=false;
  const supervisor={settings:()=>[{id:'codex',configured:true}],conversation:async(agent,root,prompt,readOnly)=>{calls++;assert.equal(readOnly,true);assert.equal(root,realpathSync.native(f.project.root));assert.match(prompt,/Inspect code read-only/);return 'Reviewed successfully';}};
  const chats=new Chats(f.store,supervisor,f.project.root,async()=>exhausted?[{id:'codex',source:'cli-stream',status:'exhausted',updatedAt:new Date().toISOString()}]:[]);
  const runner=new ScheduleRunner(f.store.schedules,(job,onChat,stopped)=>executeScheduledChat(chats,job,onChat,stopped),f.clock);
  f.store.schedules.action({id:job.id,action:'run'});await runner.tick();
  let run=f.store.schedules.runs()[0];assert.equal(run.status,'complete',JSON.stringify(run));assert.equal(f.store.chats.get(run.chatId).messages.at(-1).content,'Reviewed successfully');assert.equal(f.store.chats.get(run.chatId).projectId,f.project.id);assert.equal(f.store.projects().length,1);
  exhausted=true;f.store.schedules.action({id:job.id,action:'run'});await runner.tick();run=f.store.schedules.runs()[0];assert.equal(run.status,'failed');assert.equal(run.error,'QUOTA_EXHAUSTED');assert.equal(calls,1);
  await runner.close();await chats.close();
});

test('Scheduled chat keeps the selected project when its folder spelling is non-canonical',async t=>{
  const f=fixture(t);
  const alias=f.store.createProject({name:'Alias',root:f.project.root+'/.',master:'codex'});
  const chats=new Chats(f.store,{},f.project.root,async()=>[]);
  const chat=await chats.create({agent:'codex',mode:'chat',source:'local',projectId:alias.id});
  assert.equal(chat.projectId,alias.id);
  assert.equal(chat.root,realpathSync.native(alias.root));
  assert.equal(f.store.projects().length,2);
  await chats.close();
});
