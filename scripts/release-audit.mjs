import {execFileSync} from "node:child_process";
import {readFileSync,existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
// Never print candidate secret values. This is a bounded pattern check, not a secret certification.
const files=execFileSync("git",["ls-files","--cached","-z"],{encoding:"utf8"}).split("\0").filter(Boolean),suspicious=[];
for(const file of files){if(/(?:^|\/)(?:node_modules|\.env(?:\.|$)|auth\.json|agenting\.sqlite|release)(?:\/|$)/i.test(file))throw Error(`Unexpected release input: ${file}`);if(!/\.(?:tsx?|cts|mjs|json|md|ya?ml|txt)$/.test(file))continue;const body=readFileSync(file,"utf8");if(/(?:\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bsk-[A-Za-z0-9_-]{35,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(body)&&!file.startsWith("tests/"))suspicious.push(file);}
if(suspicious.length)throw Error(`Review possible credentials in: ${suspicious.join(", ")}`);
for(const file of ["README.md","HANDOFF_PL.md","CONTRIBUTING.md","SECURITY.md","docs/evidence/release-04/README.md"]){const body=readFileSync(file,"utf8");for(const [,target] of body.matchAll(/\]\(([^)\s]+)\)/g)){if(/^(https?:|#)/.test(target))continue;const local=target.split("#")[0];if(!existsSync(resolve(dirname(file),local)))throw Error(`Broken local documentation link: ${file} -> ${target}`);}}
const inventory=JSON.parse(readFileSync("licenses/inventory.json","utf8"));for(const name of ["react","react-dom","electron","vite","electron-builder","form-data","ws"]){const entries=inventory.filter(x=>x.name===name);if(!entries.length)throw Error(`Missing license inventory: ${name}`);}
console.log(`Release audit passed: ${files.length} tracked paths; documentation links and dependency inventory checked.`);
