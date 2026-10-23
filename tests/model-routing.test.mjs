import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OpenRouterConnection} from '../dist/main/openrouter.js';
test('OpenRouter resolves default and explicit IDs and rejects disabled selections', t=>{
 const dir=mkdtempSync(join(tmpdir(),'routing-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const router=new OpenRouterConnection(dir,{available:()=>true,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()});
 assert.equal(router.resolveModel('other/model'),'other/model');
 router.save({apiKey:'sk-or-test-abcdefghijklmnop',model:'org/default',disabledModels:['org/blocked'],consent:true});
 assert.equal(router.resolveModel(null),'openrouter/org/default');
 assert.equal(router.resolveModel('org/selected'),'openrouter/org/selected');
 assert.equal(router.resolveModel('openrouter/org/selected'),'openrouter/org/selected');
 assert.equal(router.resolveModel('openrouter/free'),'openrouter/openrouter/free');
 assert.throws(()=>router.resolveModel('org/blocked'),/MODEL_DISABLED/);
 assert.throws(()=>router.resolveModel('openrouter/org/blocked'),/MODEL_DISABLED/);
 assert.throws(()=>router.resolveModel('invalid'),/INVALID_MODEL/);
});
