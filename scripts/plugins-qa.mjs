import { _electron as electron } from 'playwright';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../dist/main/store.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const profile=mkdtempSync(join(tmpdir(),'agenting-plugins-'));const root=join(profile,'project');mkdirSync(root);
const store=new Store(join(profile,'agenting.sqlite'));store.setPreferences({language:'pl',theme:'classic'});
const project=store.createProject({name:'Studio produktu',root,master:'codex'});store.createMemory({projectId:project.id,content:'Kierunek projektu\nCzytelna rozmowa i spokojny interfejs.',source:'Decyzja projektowa',scope:'project'});const chatId=randomUUID();store.chats.save({id:chatId,title:'Plan interfejsu',projectId:project.id,agent:'claude',mode:'chat',source:'local',root,workspace:root,status:'idle',messages:[{id:randomUUID(),role:'user',content:'Uporządkuj widok',at:Date.now(),status:'complete'},{id:randomUUID(),role:'assistant',content:'Rozmowa jest głównym elementem.',at:Date.now(),status:'complete'}],contextIds:[],skillIds:[],activity:[],error:null,updatedAt:Date.now()});await store.extensions.install(project.id,'builtin:copywriting');store.runs.configure('codex',process.execPath,[],'codex','isolated','fixture/model');store.capabilities.record({agent:'codex',state:'connected',detail:'UI fixture',models:[{id:'fixture/model',name:'Fixture model'}],observedAt:new Date().toISOString()});store.close();
const env={...process.env,AGENTING_DATA_DIR:profile,CLAUDE_CONFIG_DIR:join(profile,'claude')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[resolve('.'),...(process.env.AGENTING_TEST_NO_SANDBOX==='1'?['--no-sandbox','--no-zygote']:[])],env});

try {
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('main[aria-busy="false"]').waitFor();await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Ustawienia',exact:true}).first().click();
 await page.getByRole('checkbox',{name:'Większy tekst rozmowy',exact:true}).check();
 assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('largerChatText')),true);
 await page.screenshot({animations:"disabled",path:resolve('.runtime/plugins-settings.png')});
 await page.getByRole('button',{name:'Agenci i modele',exact:true}).click();
 await page.locator('.provider-card.state-connected').first().waitFor();await page.screenshot({animations:"disabled",path:resolve('.runtime/plugins-agents.png')});
 await page.getByRole('switch',{name:'Włącz agenta: Codex',exact:true}).uncheck();
 await page.waitForFunction(async()=>!(await window.agenting.providerSettings()).find(p=>p.id==='codex').configured);
 await page.locator('.primary-nav').getByRole('button',{name:'Skille',exact:true}).click();
 const skill=page.locator('.skill-library article').filter({has:page.getByRole('heading',{name:'Teksty sprzedażowe',exact:true})});
 await skill.getByRole('switch').waitFor();await skill.getByRole('switch').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.skill-toggle')].some(el=>el.getAttribute('aria-checked')==='false'));
 await skill.getByRole('switch').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.skill-toggle')].some(el=>el.getAttribute('aria-checked')==='true'));
 await page.getByRole('button',{name:'Marketing & Humanizer',exact:true}).click();
 await page.screenshot({animations:"disabled",path:resolve('.runtime/plugins-skills.png')});
 await page.locator('.primary-nav').getByRole('button',{name:'Pluginy',exact:true}).click();
 await page.getByRole('heading',{name:'Pluginy',exact:true}).waitFor();
 assert.equal(await page.locator('.integration-card').count(),7);
 await page.locator('.integration-card').filter({hasText:'Google Drive'}).click();
 await page.getByText('Konfiguracja OAuth',{exact:true}).waitFor();
 await page.screenshot({animations:"disabled",path:resolve('.runtime/plugins-desktop.png')});
 for(const width of [768,390,320]) {await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({animations:"disabled",path:resolve('.runtime/plugins-'+width+'.png')});}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,providerToggle:true,skillToggle:true,plugins:7,settings:true,widths:[1440,768,390,320]}));
}finally{await app.close();}
