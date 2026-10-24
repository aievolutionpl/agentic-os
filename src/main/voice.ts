import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";
import {resolveOnPath} from "./connectors.js";
import {exact,text} from "./validate.js";
let active=false;
export function voiceAvailable(){return !!resolveOnPath("whisper") && !!resolveOnPath("ffmpeg");}
export async function transcribeVoice(input:unknown){
 const p=exact(input,["audio","language","model"]);const encoded=text(p.audio,12_000_000);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error("INVALID_AUDIO");
 const model=voiceModel(p.model);
 const language=p.language==="en"?"en":"pl";
 const command=resolveOnPath("whisper");if(!command||!voiceAvailable())throw Error("WHISPER_NOT_INSTALLED");if(active)throw Error("VOICE_BUSY");active=true;
 const dir=mkdtempSync(join(tmpdir(),"agenting-voice-"));
 try{const file=join(dir,"recording.webm");writeFileSync(file,Buffer.from(encoded,"base64"),{mode:0o600});
 await new Promise<void>((resolve,reject)=>{const child=spawn(command,[file,"--model",model,"--language",language,"--output_format","txt","--output_dir",dir,"--fp16","False","--verbose","False"],{windowsHide:true,stdio:"ignore",env:{...process.env,PYTHONIOENCODING:"utf-8"}});const timeout=setTimeout(()=>{child.kill();reject(Error("VOICE_TIMEOUT"));},180000);child.on("error",()=>{clearTimeout(timeout);reject(Error("VOICE_FAILED"));});child.on("close",code=>{clearTimeout(timeout);if(code===0)resolve();else reject(Error("VOICE_FAILED"));});});
 return readFileSync(join(dir,"recording.txt"),"utf8").trim().slice(0,12000);
 }finally{active=false;rmSync(dir,{recursive:true,force:true});}
}

function voiceModel(value:unknown){if(value===undefined)return "base";if(!["tiny","base","small"].includes(String(value)))throw Error("INVALID_VOICE_MODEL");return String(value);}
export async function prepareVoice(input:unknown){
 const p=exact(input,["model"]),model=voiceModel(p.model),python=resolveOnPath("python");
 if(!python||!voiceAvailable())throw Error("WHISPER_NOT_INSTALLED");
 if(active)throw Error("VOICE_BUSY");active=true;
 try{await new Promise<void>((resolve,reject)=>{const child=spawn(python,["-c","import whisper,sys; whisper.load_model(sys.argv[1], device='cpu')",model],{windowsHide:true,stdio:"ignore"});const timer=setTimeout(()=>{child.kill();reject(Error("VOICE_TIMEOUT"));},600000);child.on("error",()=>{clearTimeout(timer);reject(Error("VOICE_FAILED"));});child.on("close",code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error("VOICE_FAILED"));});});return true;}finally{active=false;}
}
