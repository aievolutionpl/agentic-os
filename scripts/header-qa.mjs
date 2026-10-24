import { _electron as electron } from 'playwright';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/main/store.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const profile=mkdtempSync(join(tmpdir(),'agenting-calm-'));const root=join(profile,'project');mkdirSync(root);
const store=new Store(join(profile,'agenting.sqlite'));store.setPreferences({language:'pl',theme:'white'});
const project=store.createProject({name:'Studio produktu',root,master:'codex'});store.createMemory({projectId:project.id,content:'Kierunek projektu\nCzytelna rozmowa i spokojny interfejs.',source:'Decyzja projektowa',scope:'project'});const chatId=randomUUID();store.chats.save({id:chatId,title:'Plan interfejsu',projectId:project.id,agent:'claude',mode:'chat',source:'local',root,workspace:root,status:'idle',messages:[{id:randomUUID(),role:'user',content:'Uporządkuj widok',at:Date.now(),status:'complete'},{id:randomUUID(),role:'assistant',content:'Rozmowa jest głównym elementem.',at:Date.now(),status:'complete'}],contextIds:[],skillIds:[],activity:[],error:null,updatedAt:Date.now()});store.close();
const env={...process.env,AGENTING_DATA_DIR:profile,CLAUDE_CONFIG_DIR:join(profile,'claude')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[resolve('.'),...(process.env.AGENTING_TEST_NO_SANDBOX==='1'?['--no-sandbox','--no-zygote']:[])],env});
try {
 const page=await app.firstWindow();await page.locator('main[aria-busy="false"]').waitFor();
 assert.equal(await page.locator('.palette-trigger kbd').count(),0);
 // Deterministic layout fixture: seven account cards, including stale/unknown values.
 await page.locator('.quota-strip-items').evaluate(el=>{
  el.replaceChildren();
  for(const [name,value] of [['Codex','68%'],['Claude Code','Brak odczytu'],['Antigravity','16%'],['OpenRouter','$11.88'],['Hermes','44%'],['OpenCode','81%'],['Lokalny LLM','Brak odczytu']]) {
   const button=document.createElement('button');button.className='quota-mini stale';
   button.innerHTML='<svg class="quota-ring" viewBox="0 0 32 32"><circle class="quota-ring-track" cx="16" cy="16" r="12"/></svg><span class="provider-glyph">◈</span><span></span><strong></strong>';
   button.querySelector('span:not(.provider-glyph)').textContent=name;button.querySelector('strong').textContent=value;el.append(button);
  }
 });
 for(const width of [1920,1640,1440,1280,1024,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  const issues=await page.locator('.compact-workspace-header').evaluate(el=>{
   const items=[el,...el.querySelectorAll('.quota-strip,.quota-strip-items,.top-bar,.settings')];
   const overflow=items.some(item=>item.scrollWidth>item.clientWidth+1);
   const boxes=[...el.querySelectorAll('button,.breadcrumb')].filter(item=>getComputedStyle(item).display!=='none').map(item=>item.getBoundingClientRect()).filter(r=>r.width&&r.height);
   const overlap=boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2));
   return {overflow,overlap};
  });
  assert.deepEqual(issues,{overflow:false,overlap:false},`header at ${width}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve('.runtime/header-white-'+width+'.png'),animations:'disabled'});
 }
 await page.setViewportSize({width:1024,height:900});
 await page.evaluate(()=>document.documentElement.style.setProperty('--sidebar-width','480px'));
 assert.equal(await page.locator('.compact-workspace-header').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'wide sidebar leaves a fitting header');
 await page.getByRole('button',{name:'Szukaj',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape');
 await page.keyboard.press('Control+k');
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape');
 console.log('PASS: Pure White header with 7 quota cards, no horizontal scroll or overlaps, 320–1920px');
}finally{await app.close();}
