import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeUsage, parseClaudeUsage } from "../dist/main/claude-usage.js";

test("Claude usage accepts valid account windows, not context tokens or malformed percentages", () => {
  const now = Date.now(), resets_at = new Date(now + 3600000).toISOString();
  const result = parseClaudeUsage({ five_hour: {utilization: 20, resets_at}, seven_day: {utilization: 100, resets_at}, context_window: {utilization: 10,resets_at}, seven_day_opus: {utilization: -1,resets_at} }, now);
  assert.deepEqual(Object.keys(result.windows), ["five_hour", "seven_day"]);
  assert.equal(result.windows.five_hour.usedPercent,20);
  assert.equal(parseClaudeUsage({five_hour:{utilization:10,resets_at:"2020-01-01"}},now),null);
});

test("Claude account reader confines credentials to Anthropic, deduplicates and backs off", async t => {
  const dir=mkdtempSync(join(tmpdir(),"claude-usage-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(join(dir,".credentials.json"),JSON.stringify({claudeAiOauth:{accessToken:"fixture-only",expiresAt:Date.now()+60000}}));
  let calls=0;
  const reader=new ClaudeUsage(dir,async(url,options)=>{
    calls++;assert.equal(url,"https://api.anthropic.com/api/oauth/usage");assert.equal(options.redirect,"error");assert.equal(options.headers.Authorization,"Bearer fixture-only");
    return new Response(JSON.stringify({five_hour:{utilization:15,resets_at:new Date(Date.now()+60000).toISOString()}}),{status:200});
  });
  const [a,b]=await Promise.all([reader.read(),reader.read()]);assert.deepEqual(a,b);await reader.read();assert.equal(calls,1);
  const limited=new ClaudeUsage(dir,async()=>{calls++;return new Response("",{status:429});});
  assert.equal(await limited.read(),null);assert.equal(await limited.read(),null);assert.equal(calls,2);
});

test("missing or expired credentials never cause a network request", async t => {
  const dir=mkdtempSync(join(tmpdir(),"claude-no-auth-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const request=async()=>assert.fail("must not fetch");
  assert.equal(await new ClaudeUsage(dir,request).read(),null);
  writeFileSync(join(dir,".credentials.json"),JSON.stringify({claudeAiOauth:{accessToken:"fixture",expiresAt:1}}));
  assert.equal(await new ClaudeUsage(dir,request).read(),null);
});
