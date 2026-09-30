import http from 'node:http';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {fixtures} from './fixture.mjs';
import {proposeExplicit,validateProposal,accept,summarize,mutate,parseModel,executionEvidence} from './core.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
export function createDesk(){
 let data=fixtures(), reviews=[], proposals=[], proposalGeneration=0, modelState={status:'not_requested',message:'Optional Qwen evaluation is offline; no model called by this desk.'};
 const reviewToken=p=>createHash('sha256').update(JSON.stringify({generation:proposalGeneration,proposal:p})).digest('hex');
 const visible=()=>({...data,tests:data.tests.filter(t=>t.accessible),runs:data.runs.filter(r=>data.tests.some(t=>t.id===r.testId&&t.accessible))});
 const state=()=>({data:visible(),definitionSupport:proposeExplicit(data),reviews:reviews.filter(r=>data.tests.some(t=>t.id===r.proposal?.testId&&t.accessible)),proposals:proposals.filter(p=>data.tests.some(t=>t.id===p.testId&&t.accessible)).map(p=>({...p,reviewToken:reviewToken(p),validation:validateProposal(data,p)})),summary:summarize(data,reviews),testEvidence:data.tests.filter(t=>t.accessible).map(t=>({testId:t.id,requirements:data.requirements.map(r=>({requirementId:r.id,...executionEvidence(data,t.id,r.id)}))})),modelState});
 return http.createServer(async(req,res)=>{
  const json=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  try {
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/state'&&req.method==='GET')return json(200,state());
   if(req.method==='POST'&&url.pathname.startsWith('/api/')){
    if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return json(403,{error:'origin_rejected'});
    let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)return json(413,{error:'body_limit'});}
    const input=JSON.parse(body||'{}');
    if(url.pathname==='/api/propose'){
     if(input.mode==='invalid_json'){modelState=parseModel(data,'{broken');proposals=[];}
     else if(input.mode==='timeout'){modelState={status:'model_timeout',message:'Injected demo failure. No inference occurred.'};proposals=[];}
     else if(input.mode==='archived_model'){
      try {const evaluation=JSON.parse(await readFile(root+'artifacts/model-evaluation.json','utf8'));proposals=evaluation.attempts.flatMap(a=>a.results.filter(x=>x.validation.valid&&x.validation.status==='supported').map(x=>x.proposal));modelState={status:'archived_model',message:evaluation.evaluationAttempts+' recorded Qwen evaluation attempts; revalidated source snapshots; no live inference.'};}catch{proposals=[];modelState={status:'model_unavailable',message:'Recorded evaluation artifact unavailable. Explicit links remain usable.'};}
     }else {proposals=proposeExplicit(data);modelState={status:'explicit_links',message:'CPU assertion anchors proposed. Human semantic acceptance still required.'};}
     proposalGeneration++;
    }else if(url.pathname==='/api/accept'){
     const p=proposals.find(p=>p.requirementId===input.requirementId&&p.testId===input.testId);
     const stale=()=>json(409,{error:'proposal_stale',message:'Proposal changed. Inspect the refreshed sources and click Accept again.',state:state()});
     const inspected=input.inspection;
     if(!p||!inspected||inspected.reviewToken!==reviewToken(p)||!['requirementSourceId','testSourceId','requirementRevision','testRevision','requirementHash','testHash','requirementBaseline'].every(key=>inspected[key]===p[key]))return stale();
     const v=validateProposal(data,p);if(!v.valid)return stale();
     const r=accept(data,p,'demo-reviewer');if(r.state!=='accepted')return json(409,{error:'semantic_coverage_unsupported'});reviews=reviews.filter(x=>!(x.proposal?.requirementId===p.requirementId&&x.proposal?.testId===p.testId));reviews.push(r);
    }else if(url.pathname==='/api/mutate')data=mutate(data,input.name);
    else if(url.pathname==='/api/reset'){proposalGeneration++;data=fixtures();reviews=[];proposals=[];modelState={status:'not_requested'};}
    else return json(404,{error:'unknown_action'});
    return json(200,state());
   }
   const files={'/':'index.html','/app.mjs':'app.mjs','/style.css':'style.css'};
   const file=files[url.pathname];if(!file)return json(404,{error:'not_found'});
   const type=file.endsWith('html')?'text/html':file.endsWith('css')?'text/css':'text/javascript';
   res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(await readFile(root+file));
  }catch(error){json(400,{error:'request_rejected',message:error.message});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||5055);createDesk().listen(port,'127.0.0.1',()=>console.log(`P05 desk listening on localhost:${port}`));}
