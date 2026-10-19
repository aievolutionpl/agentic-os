// Local protocol fixture, never selected by production environment variables or IPC.
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const send=value=>process.stdout.write(JSON.stringify(value)+"\n");
let cwd=process.cwd();
createInterface({input:process.stdin}).on("line",line=>{
  const m=JSON.parse(line),p=m.params??{};
  const reply=result=>send({id:m.id,result});
  if(m.method==="initialize")reply({userAgent:"Agenting OS protocol fixture"});
  else if(m.method==="thread/start"||m.method==="thread/resume"){cwd=p.cwd;reply({thread:{id:"fixture-thread"}});}
  else if(m.method==="account/read")reply({account:null,requiresOpenaiAuth:true});
  else if(m.method==="turn/start"){
    reply({turn:{id:"fixture-turn",status:"inProgress"}});
    if(process.env.QA_BEHAVIOR==="disconnect"){process.exit(1);return;}
    send({method:"turn/started",params:{threadId:"fixture-thread",turn:{id:"fixture-turn"}}});
    if(process.env.QA_BEHAVIOR==="hang"){writeFileSync(join(cwd,"fixture.pid"),String(process.pid));setInterval(()=>{},1000);return;}
    if(p.sandboxPolicy.type!=="readOnly")writeFileSync(join(cwd,"result.txt"),"isolated result\n");
    send({id:100,method:"item/commandExecution/requestApproval",params:{threadId:"fixture-thread",command:"blocked escape"}});
    const message=p.sandboxPolicy.type==="readOnly"?"Fixture independent review completed.":"Fixture implementation completed. sk-"+"q".repeat(40);
    send({method:"item/agentMessage/delta",params:{threadId:"fixture-thread",delta:message}});
    send({method:"turn/completed",params:{threadId:"fixture-thread",turn:{id:"fixture-turn",status:"completed"}}});
  }else if(m.method==="turn/interrupt"||m.method==="turn/steer")reply({});
});
