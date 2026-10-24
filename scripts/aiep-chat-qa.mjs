import { _electron as electron } from 'playwright';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/main/store.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const profile=mkdtempSync(join(tmpdir(),'agenting-calm-'));const root=join(profile,'project');mkdirSync(root);
const store=new Store(join(profile,'agenting.sqlite'));store.setPreferences({language:'pl',theme:'light'});
const project=store.createProject({name:'Studio produktu',root,master:'codex'});store.createMemory({projectId:project.id,content:'Kierunek projektu\nCzytelna rozmowa i spokojny interfejs.',source:'Decyzja projektowa',scope:'project'});const chatId=randomUUID();store.chats.save({id:chatId,title:'Plan interfejsu',projectId:project.id,agent:'claude',mode:'chat',source:'local',root,workspace:root,status:'idle',messages:[{id:randomUUID(),role:'user',content:'Uporządkuj widok',at:Date.now(),status:'complete'},{id:randomUUID(),role:'assistant',content:'Rozmowa jest głównym elementem.',at:Date.now(),status:'complete'}],contextIds:[],skillIds:[],activity:[],error:null,updatedAt:Date.now()});store.close();
const env={...process.env,AGENTING_DATA_DIR:profile,CLAUDE_CONFIG_DIR:join(profile,'claude')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[resolve('.'),...(process.env.AGENTING_TEST_NO_SANDBOX==='1'?['--no-sandbox','--no-zygote']:[])],env});
try {
 const page=await app.firstWindow();await page.locator('main[aria-busy="false"]').waitFor();
 await page.evaluate(async()=>{const p=await window.agenting.snapshot();await window.agenting.setPreferences({...p.preferences,theme:'codex'});});
 await page.reload();await page.locator('main[aria-busy="false"]').waitFor();
 await page.locator('.tree-chat').filter({hasText:'Plan interfejsu'}).click();
 await page.locator('.chat-workspace.has-conversation').waitFor();
 for(const width of [1640,1280,1024,768,390,320]) {
  await page.setViewportSize({width,height:900});
  const issue=await page.locator('.chat-composer .composer-toolbar').evaluate(el=>{
   const boxes=[...el.children].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.getBoundingClientRect()).filter(r=>r.width&&r.height);
   return boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2));
  });assert.equal(issue,false,`overlap at ${width}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve('.runtime/aiep-chat-'+width+'.png'),animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Nowy czat',exact:true}).click();
 await page.locator('.start-composer textarea').waitFor();
 for(const width of [1440,1024,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  const layout=await page.locator('.start-composer').evaluate(el=>({
   tools:el.querySelector('.composer-tools').getBoundingClientRect().top,
   controls:el.querySelector('.composer-toolbar').getBoundingClientRect().bottom,
   field:getComputedStyle(el.querySelector('textarea')).borderTopStyle
  }));
  assert.ok(layout.tools>=layout.controls,`tools below controls at ${width}`);
  assert.equal(layout.field,'solid');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve('.runtime/composer-start-'+width+'.png'),animations:'disabled'});
 }
 console.log('PASS: active chat controls do not overlap at 1640/1280/1024/768/390/320');
} finally {await app.close();}
