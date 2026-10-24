import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { Store } from '../dist/main/store.js';
import { navigateWorkspace } from './workspace-navigation.mjs';
const profile=mkdtempSync(join(tmpdir(),'agenting-onboarding-'));
const store=new Store(join(profile,'agenting.sqlite'));store.setPreferences({language:'pl',theme:'white'});store.close();
const output=resolve(process.env.AGENTING_QA_OUTPUT||'.runtime/onboarding');mkdirSync(output,{recursive:true});
const env={...process.env,AGENTING_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[resolve('.'),...(process.env.AGENTING_TEST_NO_SANDBOX==='1'?['--no-sandbox','--no-zygote']:[])],env});
try {
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('main[aria-busy="false"]').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.agenting.terminalList()),[],'startup never installs or opens terminal');
 await navigateWorkspace(page,'Połączenia i modele');
 await page.locator('.provider-onboarding > summary').click();
 await page.getByRole('button',{name:'Zainstaluj w terminalu',exact:true}).waitFor();
 assert.match(await page.locator('.provider-install pre').innerText(),/@openai\/codex/);
 assert.equal(await page.getByRole('button',{name:'Pierwsze zadanie · poznaj projekt',exact:true}).isDisabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.agenting.terminalList()),[],'opening the guide never installs');
 for(const width of [1440,768,390]) {
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
   await page.locator('.provider-onboarding').scrollIntoViewIfNeeded();
   await page.screenshot({path:join(output,`connections-${width}.png`),animations:'disabled'});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: onboarding guide, explicit install, first task gated, responsive 390–1440; no installer executed');
}finally{await app.close();}
