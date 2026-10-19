import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composite, contrast, measure, threshold } from '../scripts/contrast-math.mjs';
test('WCAG reference ratios and sRGB transfer', () => {
 assert.equal(contrast([0,0,0,1],[255,255,255,1]),21);
 assert.equal(contrast([255,255,255,1],[255,255,255,1]),1);
 assert.ok(Math.abs(contrast([119,119,119,1],[255,255,255,1])-4.478)<.001);
});
test('source-over alpha and transparent ancestor backgrounds', () => {
 assert.deepEqual(composite([0,0,0,.5],[255,255,255,1]),[127.5,127.5,127.5,1]);
 const m=measure({color:[0,0,0,.5],layers:[{background:[255,255,255,0],opacity:1},{background:[255,255,255,1],opacity:1}]});
 assert.ok(Math.abs(m.ratio-3.97665)<.001);
});
test('group opacity applies to foreground AND background before parent compositing', () => {
 const m=measure({color:[255,255,255,1],layers:[{background:[0,0,0,1],opacity:.5},{background:[255,255,255,1],opacity:1}]});
 assert.deepEqual(m.foreground,[255,255,255,1]);
 assert.deepEqual(m.background,[127.5,127.5,127.5,1]);
});
test('large-text thresholds use points converted to CSS px; never round a fail up', () => {
 assert.equal(threshold(18,400),4.5); assert.equal(threshold(24,400),3);
 assert.equal(threshold(18.66,700),4.5); assert.equal(threshold(18.667,700),3);
 assert.ok(contrast([119,119,119,1],[255,255,255,1])<threshold(16,400));
});

import { JSDOM } from 'jsdom';
import { collectContrast } from '../scripts/contrast-dom.mjs';
test('DOM collector reads rendered styles, input values, placeholders and rejects complex paint', () => {
 const dom=new JSDOM('<body style="color:rgb(0,0,0);background:rgb(255,255,255)"><p style="color:rgba(0,0,0,0.5)">Alpha</p><input style="color:rgb(0,0,0);background:rgb(255,255,255)" value="Value"><input style="color:rgb(0,0,0);background:rgb(255,255,255)" placeholder="Hint"><div style="filter:brightness(1.1)">Unsupported</div><span aria-hidden="true">Decoration</span></body>');
 const win=dom.window;
 win.HTMLElement.prototype.checkVisibility=()=>true;
 win.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:20});
 // JSDOM supplies no layout; only collector routing is tested here. Electron is mandatory for QA.
 const original=globalThis.document, originalStyle=globalThis.getComputedStyle, originalNode=globalThis.Node;
 globalThis.document=win.document;globalThis.Node=win.Node;
 globalThis.getComputedStyle=el=>{
  const s=win.getComputedStyle(el);
  return new Proxy(s,{get(t,k){const defaults={clip:'auto',backgroundColor:'rgba(0, 0, 0, 0)',color:'rgb(0, 0, 0)',opacity:'1',backgroundImage:'none',filter:'none',backdropFilter:'none',mixBlendMode:'normal',textShadow:'none',fontSize:'16px',fontWeight:'400'};return t[k]||defaults[k]||'';}});
 };
 try {
  const rows=collectContrast();
  assert.ok(rows.some(r=>r.text==='Alpha'&&r.color[3]===.5));
  assert.ok(rows.some(r=>r.text==='Value'));
  assert.ok(rows.some(r=>r.kind==='placeholder'&&r.text==='Hint'));
  assert.ok(rows.find(r=>r.text==='Unsupported').unsupported.length>0);
  assert.ok(!rows.some(r=>r.text==='Decoration'));
 }finally{globalThis.document=original;globalThis.getComputedStyle=originalStyle;globalThis.Node=originalNode;win.close();}
});
