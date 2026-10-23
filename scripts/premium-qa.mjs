// Contrast assertions cover solid paint only; gradients/glass require qa:calm and visual review.
import {navigateWorkspace} from "./workspace-navigation.mjs";
// Native UI regression for Classic, per-chat models, complete skills and live memory.
// All agent calls use a deterministic local protocol fixture, never a subscription.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../dist/main/store.js";
import { collectContrast } from "./contrast-dom.mjs";
import { measure, threshold } from "./contrast-math.mjs";
const profile = mkdtempSync(join(tmpdir(), "agenting-premium-qa-"));
const projectRoot = join(profile, "sample-project"); mkdirSync(projectRoot);
const store = new Store(join(profile, "agenting.sqlite"));
store.setPreferences({ language: "pl", theme: "classic" });
store.runs.configure("codex", process.execPath, [resolve("tests/fixtures/codex-server.mjs")], "codex", "existing");
for (const [id, protocol] of [["hermes","acp"],["antigravity","antigravity-cli"],["claude","claude-cli"],["opencode","acp"]]) store.runs.configure(id,process.execPath,[],protocol,"existing");
const project = store.createProject({ name: "Przykład · Agenting OS", root: projectRoot, master: "codex" });
store.createTask({ projectId: project.id, title: "Przykład · dopracuj interfejs", implementer: "codex", reviewer: "claude" });
store.createMemory({ projectId: project.id, content: "Kierunek interfejsu\nCiepłe tło i terakotowy akcent.", source: "Przykładowa decyzja", scope: "project" });
store.createMemory({ projectId: project.id, content: "Plan wydania\nZweryfikuj [[Kierunek interfejsu]].", source: "Przykładowa notatka", scope: "project" });
store.close();
const env = { ...process.env, AGENTING_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const output = resolve(process.env.AGENTING_QA_OUTPUT || ".runtime/premium-qa/new"); mkdirSync(output,{recursive:true});
const report = { status:"running", checks:[], screens:[], errors:[], scope:"Native Electron + local protocol fixture; sample data, no live inference." };
let app, page;
try {
  app=await electron.launch({args:[resolve("."),...(process.env.AGENTING_TEST_NO_SANDBOX === "1" ? ["--no-sandbox","--no-zygote"] : [])],env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(30000);page.on("pageerror",e=>report.errors.push(e.message));
  await page.locator('main[aria-busy="false"]').waitFor();
  await page.waitForFunction(()=>document.documentElement.dataset.theme === "classic");
  const nav = name => navigateWorkspace(page, name);
  async function capture(name) {
    await page.evaluate(()=>document.fonts.ready); await page.mouse.move(0,0);
    await page.screenshot({path:join(output,name+".png"),fullPage:true,animations:"disabled"});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth);
    const failures=(await page.evaluate(collectContrast)).map(r=>({...r,...measure(r)})).filter(r=>!r.disabled&&(!r.unsupported.length&&r.ratio<threshold(r.size,r.weight))).map(r=>({text:r.text,ratio:r.ratio,unsupported:r.unsupported}));
    report.screens.push({name,width:page.viewportSize().width,overflow,failures});
    assert.equal(overflow,false,name);assert.equal(failures.length,0,`${name}: ${JSON.stringify(failures.slice(0,6))}`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator(".agent-menu > summary").click();
  assert.equal(await page.getByRole("button",{name:/Gemini CLI/}).count(),0);
  assert.equal(await page.locator(".agent-strip button").count(),6);
  await page.locator(".agent-menu > summary").click();
  for(const width of [1440,768,390,320]) { await page.setViewportSize({width,height:1000});await capture(`classic-chat-${width}`); }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel("Model rozmowy",{exact:true}).selectOption("__custom__");
  await page.getByRole("textbox",{name:"Model rozmowy",exact:true}).fill("fixture-model");
  await page.getByRole("textbox",{name:"Pierwsza wiadomość",exact:true}).fill("Sprawdź kierunek interfejsu.");
  await page.getByRole("button",{name:"Otwórz rozmowę",exact:true}).click();
  await page.locator(".message-actions").first().waitFor();
  const chat=(await page.evaluate(()=>window.agenting.chatList()))[0];assert.equal(chat.model,"fixture-model");
  await page.getByLabel("Model rozmowy",{exact:true}).selectOption("__custom__");
  await page.getByRole("textbox",{name:"Model rozmowy",exact:true}).fill("fixture-next");
  await page.getByRole("textbox",{name:"Wiadomość do agenta",exact:true}).fill("Doprecyzuj plan.");
  await page.getByRole("button",{name:"Wyślij",exact:true}).click();
  await page.waitForFunction(async()=>{const c=(await window.agenting.chatList())[0];return c.model === "fixture-next"&&c.status === "idle"&&c.messages.length===4;});
  report.checks.push("per-conversation-model-changed-over-real-ipc-and-protocol");
  await page.waitForFunction(async()=> (await window.agenting.memoryGraph()).nodes.some(n=>n.source.startsWith("auto:chat:")));
  await nav("Biblioteka skilli");await page.getByLabel("Projekt dla skilli").selectOption(project.id);
  await page.getByRole("textbox",{name:"Szukaj skilli"}).fill("webapp testing");
  await page.getByRole("button",{name:"Dodaj do workspace",exact:true}).click();await page.getByRole("button",{name:"Dodano do projektu",exact:true}).waitFor();
  assert.ok(existsSync(join(projectRoot,".agents/skills/webapp-testing/scripts/with_server.py")));
  const memories=await page.evaluate(()=>window.agenting.memoryList());assert.ok(memories.some(m=>m.projectId === project.id&&m.source === "skill:builtin:webapp-testing"));
  report.checks.push("one-click-full-skill-package-and-project-memory");
  await page.getByRole("textbox",{name:"Szukaj skilli"}).fill("");await capture("classic-skills-1440");
  await nav("Wspólna pamięć");await page.locator(".graph-node").first().waitFor();await capture("classic-memory-1440");
  await nav("Praca i pytania");await page.locator(".kanban-card").first().waitFor();await capture("classic-kanban-1440");
  await page.locator(".kanban-card").first().click();await page.getByRole("dialog").waitFor();assert.match(await page.getByRole("dialog").innerText(),/dopracuj interfejs/);await page.keyboard.press("Escape");
  report.checks.push("kanban-card-opens-exact-task");
  await nav("Limity i tokeny");
  for(const id of ["codex","hermes","antigravity","claude","opencode"]) await page.locator(`[data-quota="${id}"] .budget-gauge`).waitFor();
  assert.equal(await page.locator('[data-quota="gemini"]').count(),0);await capture("classic-quota-1440");
  report.checks.push("every-configured-subscription-has-a-full-card-with-honest-unknowns");
  await nav("Czaty");await page.getByRole("button",{name:"Nowy czat",exact:true}).click();
  await page.getByRole("button",{name:"Kolorystyka",exact:true}).click();await page.getByRole("option",{name:"Midnight",exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme === "dark");await capture("graphite-chat-1440");
  await page.getByRole("button",{name:"Kolorystyka",exact:true}).click();await page.getByRole("option",{name:"Claude Light",exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme === "classic");
  assert.equal((await page.evaluate(()=>window.agenting.snapshot())).preferences.theme,"classic");
  report.checks.push("Classic-palette-selects-and-persists-over-ipc");assert.deepEqual(report.errors,[]);report.status="passed";
} catch(error) { report.status="failed";report.error=String(error);process.exitCode=1;console.error(error);await page?.screenshot({path:join(output,"failure.png"),fullPage:true}).catch(()=>{}); }
finally {writeFileSync(join(output,"result.json"),JSON.stringify(report,null,2));await app?.close();}
