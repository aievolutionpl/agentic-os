import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
await build({entryPoints:['src/renderer/RoutePreview.tsx'],bundle:true,loader:{'.svg':'text'},platform:'node',format:'esm',external:['react','react-dom','lucide-react'],outfile:'.runtime/jev-ui-test.mjs'});
const dom = new JSDOM('<div id="root"></div>', { url:'http://localhost' });
Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
const calls=[];
window.agenting={
 providerSettings:async()=>[{id:'codex',configured:true,model:'known-model',command:'codex'}],
 routingHistory:async()=>[],
 routePreview:async input=>{calls.push(input);return {mode:input.mode,choice:input.role==='implementer'?'codex':'claude',ranked:[{agent:input.role==='implementer'?'codex':'claude',score:3,reasons:[]}],rejected:[],reason:input.jev?'JEV_VALIDATED_CHOICE':'HIGHEST_SCORE'};},
};
const { RoutePreview }=await import('../.runtime/jev-ui-test.mjs');
const root=createRoot(document.getElementById('root'));
const render=task=>root.render(React.createElement(RoutePreview,{language:'pl',task,onApply:()=>{}}));
await act(async()=>render('Review this code'));
assert.equal(calls.length,0,'mount never spends quota');
await act(async()=>document.querySelector('input[type=checkbox]').click());
assert.equal(calls.length,0,'enabling Jev never starts a call');
await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Pokaż propozycję')).click());
assert.equal(calls.filter(c=>c.jev).length,1,'one explicit decision call; reviewer uses rules');
assert.equal(calls[0].jev.model,'known-model');
assert.equal(calls[0].strict,true);
assert.match(document.body.textContent,/Jev: wybór sprawdzony/);
await act(async()=>render('A different task'));
assert.equal(document.querySelector('.route-result'),null,'changing task invalidates old proposal');
assert.equal(calls.length,2,'editing task does not spend quota');
await act(async()=>root.unmount());
console.log('PASS: Jev requires explicit proposal click, uses selected model, bounded calls, stale proposal cleared');
