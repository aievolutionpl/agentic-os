import { _electron as electron } from 'playwright';
import {mkdtempSync,mkdirSync} from 'node:fs';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../dist/main/store.js';
const out=process.argv[2]||'/tmp/claude-0/sp';const themes=(process.argv[3]||'dark').split(',');const views=(process.argv[4]||'chat').split(',');
const profile=mkdtempSync(join(tmpdir(),'agenting-shot-'));const root=join(profile,'project');mkdirSync(root);
const store=new Store(join(profile,'agenting.sqlite'));store.setPreferences({language:'pl',theme:themes[0]});
store.createProject({name:'Studio produktu',root,master:'codex'});
const env={...process.env,AGENTING_DATA_DIR:profile,CLAUDE_CONFIG_DIR:join(profile,'claude')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[resolve('.')],env});
const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.locator('main[aria-busy="false"]').waitFor();await page.setViewportSize({width:1440,height:900});
for(const theme of themes){
  await page.evaluate(async t=>{const p=await window.agenting.snapshot();await window.agenting.setPreferences({...p.preferences,theme:t});},theme);
  await page.reload();await page.locator('main[aria-busy="false"]').waitFor();
  for(const v of views){
    if(v!=='chat'){await page.keyboard.press('Control+k');await page.waitForTimeout(200);await page.keyboard.type(v);await page.waitForTimeout(200);await page.keyboard.press('Enter');}
    else {await page.getByRole('button',{name:'Rozmowy',exact:true}).click();}
    await page.waitForTimeout(600);
    await page.screenshot({path:`${out}/${theme}-${v.replace(/\W/g,'_')}.png`,animations:'disabled'});
  }
}
console.log(JSON.stringify({errors,title:await page.title()}));
await app.close();
