import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync } from "node:fs";
import { join,resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../dist/main/store.js";
import { Supervisor } from "../dist/main/supervisor.js";
import { CodexAdapter } from "../dist/main/providers.js";
import { gitText,git } from "../dist/main/git.js";
const fixture=resolve("tests/fixtures/codex-server.mjs");
const wait=async fn=>{for(let i=0;i<300;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,40));}throw Error("Run condition timed out");};
async function setup(behavior="write"){
 const dir=mkdtempSync(join(tmpdir(),"agenting-runtime-"));
 const repo=join(dir,"repo");
 await git(dir,["init","--",repo]);writeFileSync(join(repo,"original.txt"),"original\n");
 await git(repo,["add","--all"]);const tree=await gitText(repo,"write-tree"),base=await gitText(repo,"commit-tree",tree,"-m","fixture");await git(repo,["update-ref","HEAD",base]);
 const store=new Store(join(dir,"db.sqlite"));
 const project=store.createProject({name:"Fixture",root:repo,master:"codex"});
 const task=store.createTask({projectId:project.id,title:"Create result",implementer:"codex",reviewer:"claude"});
 const supervisor=new Supervisor(store,join(dir,"app"),()=>new CodexAdapter({command:process.execPath,args:[fixture],cwd:repo,env:{QA_BEHAVIOR:behavior}}));
 return {dir,repo,base,store,project,task,supervisor,async close(){await supervisor.close();store.close();rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}};
}
test("supervised protocol run seals a real worktree, redacts output and keeps the source unchanged",async()=>{
 const f=await setup();try{
  await assert.rejects(f.supervisor.start({projectId:f.project.id,taskId:f.task.id}),/CONSENT/);
  const run=await f.supervisor.start({projectId:f.project.id,taskId:f.task.id,consent:true});
  await wait(()=>f.store.runs.get(f.project.id,run.id)?.state==="awaiting_review");
  const saved=f.store.runs.get(f.project.id,run.id);
  assert.notEqual(saved.head,f.base);assert.equal(saved.threadId,"fixture-thread");assert.equal(saved.turnId,"fixture-turn");
  assert.ok(saved.summary.includes("[REDACTED]"));assert.ok(!saved.summary.includes("q".repeat(12)));
  const artifact=f.store.artifacts.get(f.project.id,f.task.id,saved.artifactId);
  assert.ok(artifact.diff.toString().includes("isolated result"));assert.equal(await gitText(f.repo,"rev-parse","HEAD"),f.base);assert.equal(existsSync(join(f.repo,"result.txt")),false);
  assert.ok(f.store.runs.events(f.project.id,run.id).some(e=>e.kind==="policy"));
  await f.supervisor.review({projectId:f.project.id,runId:run.id,consent:true});
  await wait(()=>f.store.runs.get(f.project.id,run.id).reviewState==="completed");
  assert.equal(f.store.runs.get(f.project.id,run.id).state,"awaiting_review");
  assert.ok(f.store.runs.get(f.project.id,run.id).reviewText.includes("Fixture independent"));
 }finally{await f.close();}
});
test("cancellation terminates the provider and leaves durable cancelled state and source files intact",async()=>{
 const f=await setup("hang");try{
  const run=await f.supervisor.start({projectId:f.project.id,taskId:f.task.id,consent:true});
  await wait(()=>f.store.runs.get(f.project.id,run.id)?.turnId);
  await assert.rejects(f.supervisor.start({projectId:f.project.id,taskId:f.task.id,consent:true}),/ACTIVE/);
  await f.supervisor.action({projectId:f.project.id,runId:run.id,action:"cancel"});
  const providerPid=Number(readFileSync(join(run.worktree,"fixture.pid"),"utf8"));
  assert.throws(()=>process.kill(providerPid,0),{code:"ESRCH"});
  assert.equal(f.store.runs.get(f.project.id,run.id).state,"cancelled");assert.equal(f.store.tasks(f.project.id)[0].status,"cancelled");
  assert.equal(readFileSync(join(f.repo,"original.txt"),"utf8"),"original\n");
 }finally{await f.close();}
});
test("provider crash fails closed; invalid project, dirty repository and unconsented executable are rejected",async()=>{
 const f=await setup("disconnect");try{
  await assert.rejects(f.supervisor.start({projectId:"other",taskId:f.task.id,consent:true}));
  assert.throws(()=>f.supervisor.configure({agent:"codex",command:process.execPath,args:[],protocol:"codex",consent:false}),/CONSENT/);
  writeFileSync(join(f.repo,"dirty.txt"),"dirty");
  await assert.rejects(f.supervisor.start({projectId:f.project.id,taskId:f.task.id,consent:true}),/NOT_CLEAN/);
  rmSync(join(f.repo,"dirty.txt"));
  const run=await f.supervisor.start({projectId:f.project.id,taskId:f.task.id,consent:true});
  await wait(()=>f.store.runs.get(f.project.id,run.id)?.state==="failed");assert.equal(f.store.tasks(f.project.id)[0].status,"failed");
  await assert.rejects(f.supervisor.action({projectId:"other",runId:run.id,action:"cancel"}),/NOT_FOUND/);
 }finally{await f.close();}
});
