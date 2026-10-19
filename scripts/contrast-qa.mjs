import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { collectContrast } from './contrast-dom.mjs';
import { measure, threshold } from './contrast-math.mjs';
const out=resolve('docs/evidence/workspace-refresh/contrast');mkdirSync(out,{recursive:true});
const profile=mkdtempSync(join(tmpdir(),'agenting-contrast-'));
const env={...process.env,AGENTING_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
const result={status:'running',at:new Date().toISOString(),platform:process.platform,profile,scope:'WCAG 1.4.3 text and placeholders; disabled controls exempt. Solid backgrounds, alpha and group opacity. Complex paint fails unresolved. Native popup menus, non-text contrast, all interaction states and Windows not certified.',screens:[]};
const save=()=>writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2));
save();
process.on('uncaughtException',e=>{result.status='blocked';result.error=String(e);save();console.error(e);process.exit(1);});
process.on('exit',code=>{if(code && result.status==='running'){result.status='blocked';result.error='Process exited before rendering; see launch log';save();}});
let app;
try {
 app=await electron.launch({args:[resolve('.')],env,timeout:30000});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByLabel('Język',{exact:true}).selectOption('en');
 await page.waitForFunction(()=>document.documentElement.lang==='en');
 async function capture(name){
  await page.mouse.move(0,0);await page.locator('main[aria-busy="false"]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const rows=(await page.evaluate(collectContrast)).map(row=>({...row,...measure(row),threshold:threshold(row.size,row.weight)}));
  const failures=rows.filter(r=>!r.disabled&&(r.unsupported.length||r.ratio<r.threshold));
  if(!rows.length)throw Error('Vacuous audit');
  const screenshot=`${name}.png`;await page.screenshot({path:join(out,screenshot),fullPage:true});
  result.screens.push({name,screenshot,viewport:page.viewportSize(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),rows,failures});
  console.log(`${name}: ${rows.length} measurements, ${failures.length} failures`);
 }
 for(const theme of ['dark','light']){
  if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme){await page.getByRole('button',{name:'Theme',exact:true}).click();await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);}
  for(const width of [320,390,768,1280,1440]){
   await page.setViewportSize({width,height:900});
   if(theme==='dark'&&width===320){await capture('dark-320-empty');await page.locator('.empty').getByRole('button',{name:'New project',exact:true}).click();await page.locator('dialog[open] input[name="name"]').fill('Contrast QA');await page.getByRole('button',{name:'Create project',exact:true}).click();await page.getByRole('heading',{name:'Contrast QA',exact:true}).waitFor();
    await page.locator('#task-title').fill('Contrast regression task');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('heading',{name:'Contrast regression task',exact:true}).waitFor();
   }
   await page.locator('.tabs button').nth(0).click();await capture(`${theme}-${width}-tasks`);
   await page.locator('.tabs button').nth(1).click();await capture(`${theme}-${width}-memory`);
   await page.locator('.tabs button').nth(2).click();await capture(`${theme}-${width}-integrations`);
   if(await page.locator('.projects-toggle').isVisible() && !await page.locator('.project-sidebar').isVisible())await page.locator('.projects-toggle').click();
   await page.getByRole('button',{name:'New project',exact:true}).first().click();await page.locator('dialog[open]').waitFor();await capture(`${theme}-${width}-dialog`);await page.keyboard.press('Escape');
   if(await page.locator('.projects-toggle').isVisible())await page.locator('.projects-toggle').click();
  }
 }
 result.errors=errors;
 result.measurements=result.screens.reduce((n,s)=>n+s.rows.length,0);
 result.failures=result.screens.reduce((n,s)=>n+s.failures.length,0);
 result.status=result.failures||errors.length||result.screens.some(s=>s.overflow)?'failed':'passed';
 if(result.status!=='passed')process.exitCode=1;
}catch(e){result.status='failed';result.error=String(e);process.exitCode=1;console.error(e);}
finally{writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2));await app?.close();}
console.log(`Contrast QA: ${result.status}`);
