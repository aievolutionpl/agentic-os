import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ScheduleJob, ScheduleRun } from "../shared.js";
import type { Chats } from "./chats.js";
import { READ_ONLY_AGENTS } from "../shared.js";
import { exact, text } from "./validate.js";

/** Daily jobs follow the computer's local wall clock, including DST changes. */
export function nextDaily(time: string, now: number) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error("INVALID_INPUT");
  const [h, m] = time.split(":").map(Number);
  const date = new Date(now); date.setHours(h!, m!, 0, 0);
  if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.getTime();
}
export function nextScheduled(job: {time:string; weekdays?:number[]; date?:string}, now:number):number {
  nextDaily(job.time,now);
  if (job.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(job.date)) throw Error("INVALID_INPUT");
    const at=new Date(`${job.date}T${job.time}:00`).getTime();
    const parsed=new Date(at);
    if (`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}-${String(parsed.getDate()).padStart(2,"0")}` !== job.date) throw Error("INVALID_INPUT");
    if (!Number.isFinite(at) || at <= now) throw Error("SCHEDULE_DATE_PAST");
    return at;
  }
  if (job.weekdays && (!job.weekdays.length || job.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))) throw Error("INVALID_INPUT");
  let next=nextDaily(job.time,now);
  while(job.weekdays && !job.weekdays.includes(new Date(next).getDay())) next=nextDaily(job.time,next);
  return next;
}
export class Schedules {
  constructor(private db: DatabaseSync, private clock = Date.now) {
    if (Number(db.prepare("PRAGMA user_version").get()!.user_version) !== 17) return;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS schedule_jobs(id TEXT PRIMARY KEY, state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS schedule_runs(id TEXT PRIMARY KEY, jobId TEXT NOT NULL, state TEXT NOT NULL);
        PRAGMA user_version=18;`);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  list(): ScheduleJob[] { return this.db.prepare("SELECT state FROM schedule_jobs ORDER BY rowid DESC").all().map(r => JSON.parse(String(r.state))); }
  runs(): ScheduleRun[] { return this.db.prepare("SELECT state FROM schedule_runs ORDER BY rowid DESC LIMIT 100").all().map(r => JSON.parse(String(r.state))); }
  private put(job: ScheduleJob) { this.db.prepare("INSERT OR REPLACE INTO schedule_jobs VALUES (?,?)").run(job.id, JSON.stringify(job)); return job; }
  save(input: unknown) {
    const p = exact(input, ["title", "prompt", "projectId", "agent", "time", "consent", "weekdays", "date"]);
    if (p.consent !== true) throw Error("EXPLICIT_CONSENT_REQUIRED");
    const agent = text(p.agent) as ScheduleJob["agent"];
    if (agent === "gemini" || !READ_ONLY_AGENTS.includes(agent)) throw Error("READ_ONLY_PROVIDER_REQUIRED");
    const projectId = text(p.projectId);
    const project = this.db.prepare("SELECT root FROM projects WHERE id=?").get(projectId);
    if (!project?.root) throw Error("PROJECT_NOT_FOUND");
    if (this.list().length >= 50) throw Error("INVALID_INPUT");
    const time = text(p.time, 5);
    const weekdays = p.weekdays === undefined ? undefined : p.weekdays;
    if (weekdays !== undefined && !Array.isArray(weekdays)) throw Error("INVALID_INPUT");
    const recurrence = {time, weekdays:weekdays as number[] | undefined, date:p.date === undefined ? undefined : text(p.date,10)};
    const nextRunAt=nextScheduled(recurrence,this.clock());
    return this.put({id:randomUUID(),title:text(p.title,120),prompt:text(p.prompt,12000),projectId,agent,enabled:true,...recurrence,nextRunAt,createdAt:this.clock()});
  }
  action(input: unknown) {
    const p = exact(input,["id","action"]), job = this.list().find(j => j.id === text(p.id));
    if (!job || !["pause","resume","delete","run"].includes(String(p.action))) throw Error("INVALID_INPUT");
    if (this.runs().some(r => r.jobId === job.id && r.status === "running")) throw Error("CHAT_BUSY");
    if (p.action === "delete") this.db.prepare("DELETE FROM schedule_jobs WHERE id=?").run(job.id);
    else if (p.action === "run") this.put({...job,requested:true});
    else this.put({...job, requested:false, enabled:p.action !== "pause", nextRunAt:p.action === "pause" ? job.nextRunAt : nextScheduled(job,this.clock())});
  }
  /** Claim and advance durably BEFORE executing. No duplicate or catch-up storm after restart. */
  claim(): {job:ScheduleJob;run:ScheduleRun} | null {
    const job = this.list().filter(j => j.requested || (j.enabled && j.nextRunAt <= this.clock())).sort((a,b) => a.nextRunAt-b.nextRunAt)[0];
    if (!job) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const run: ScheduleRun = {id:randomUUID(),jobId:job.id,title:job.title,status:"running",startedAt:this.clock(),chatId:null,error:null};
      this.put({...job,requested:false,enabled:job.date ? false : job.enabled,nextRunAt:!job.date && job.nextRunAt <= this.clock() ? nextScheduled(job,this.clock()) : job.nextRunAt});
      this.record(run);
      this.db.exec("COMMIT"); return {job,run};
    } catch(e) { this.db.exec("ROLLBACK"); throw e; }
  }
  record(run:ScheduleRun) { this.db.prepare("INSERT OR REPLACE INTO schedule_runs VALUES (?,?,?)").run(run.id,run.jobId,JSON.stringify(run)); }
  recover() { for (const run of this.runs()) if(run.status === "running") this.record({...run,status:"interrupted",error:"APP_RESTARTED",finishedAt:this.clock()}); }
}
export class ScheduleRunner {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private stopped = false;
  constructor(private schedules:Schedules, private execute:(job:ScheduleJob,onChat:(id:string)=>void,stopped:()=>boolean)=>Promise<void>,private clock=Date.now) {}
  start() { this.schedules.recover(); this.stopped=false; void this.tick().catch(()=>console.error("SCHEDULE_TICK_FAILED")); this.timer=setInterval(()=>void this.tick().catch(()=>console.error("SCHEDULE_TICK_FAILED")),15000); }
  tick():Promise<void> {
    if(this.stopped) return Promise.resolve();
    if(this.pending) return this.pending;
    this.pending=this.run().finally(()=>{this.pending=undefined;}); return this.pending;
  }
  private async run() {
    const claimed=this.schedules.claim(); if(!claimed) return;
    const {job,run}=claimed;
    try { await this.execute(job,id=>{run.chatId=id;this.schedules.record(run);},()=>this.stopped);run.status=this.stopped?"interrupted":"complete"; }
    catch(e) {run.status=this.stopped?"interrupted":"failed"; const message=e instanceof Error?e.message:"";run.error=/^[A-Z_]{3,80}$/.test(message)?message:"SCHEDULE_FAILED";}
    run.finishedAt=this.clock();this.schedules.record(run);
  }
  async close() {this.stopped=true;clearInterval(this.timer);await this.pending;}
}

/** Reuses chat policy, quota checks, read-only adapters, streaming and cancellation. */
export async function executeScheduledChat(chats: Chats, job: ScheduleJob, onChat: (id:string)=>void, stopped:()=>boolean) {
  if (stopped()) throw Error("RUN_CANCELLED");
  const chat = await chats.create({agent:job.agent,mode:"chat",source:"local",projectId:job.projectId});
  onChat(chat.id);
  if (stopped()) throw Error("RUN_CANCELLED");
  chats.send({id:chat.id,message:job.prompt,consent:true});
  const result = await chats.wait(chat.id);
  if (result.status === "failed") throw Error(result.error ?? "CHAT_FAILED");
}
