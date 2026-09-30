import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {fixtures} from './fixture.mjs';
import {proposeExplicit,validateProposal} from './core.mjs';
const d=fixtures();await mkdir('artifacts',{recursive:true});
if(process.argv.includes('--prepare')){
 const modelInput={requirements:d.requirements.map(({id,status,text,facets})=>({id,status,text,facets})),tests:d.tests.filter(t=>t.accessible).map(({id,title,preconditions,assertions})=>({id,title,preconditions:preconditions.map(({id,text})=>({id,text})),assertions:assertions.map(({id,text})=>({id,text,length:text.length}))}))};
 await writeFile('artifacts/model-input.json',JSON.stringify(modelInput,null,2));
}else{
 const gold=JSON.parse(await readFile('gold.json','utf8'));const expected=new Set(Object.entries(gold.supportedPairs).flatMap(([k,fs])=>fs.map(f=>k+':'+f)));
 const keys=ps=>new Set(ps.flatMap(p=>p.facetIds.map(f=>p.requirementId+':'+p.testId+':'+f)));
 const score=set=>({truePositive:[...set].filter(k=>expected.has(k)).length,falsePositive:[...set].filter(k=>!expected.has(k)).length,falseNegative:[...expected].filter(k=>!set.has(k)).length});
 const attempts=[],rawProposals=[],validated=[];
 for(const file of (await readdir('artifacts/model-attempts')).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]))){
  const record=JSON.parse(await readFile('artifacts/model-attempts/'+file,'utf8'));let proposals=[],parseState=record.status;
  try{if(record.status!=='complete')throw Error(record.status);const obj=JSON.parse(record.raw.message.content);if(!Array.isArray(obj.proposals))throw Error('invalid-json-shape');proposals=obj.proposals;parseState='valid-json';}catch(e){parseState=e.message;}
  const results=[];
  for(const p of proposals){const r=d.requirements.find(r=>r.id===p.requirementId),t=d.tests.find(t=>t.id===p.testId);const bound={...p,requirementSourceId:r?.source.id,testSourceId:t?.source.id,requirementRevision:r?.revision,testRevision:t?.revision,requirementHash:r?.source.hash,testHash:t?.source.hash,requirementBaseline:d.requirementBaseline,origin:'qwen3:4b'};const v=p.testId===record.testId?validateProposal(d,bound):{valid:false,status:'wrong-test-id',issues:['Model escaped its test snapshot.']};results.push({proposal:bound,validation:v});if(Array.isArray(p.facetIds))rawProposals.push(p);if(v.valid&&v.status==='supported')validated.push(bound);}
  attempts.push({testId:record.testId,status:record.status,parseState,elapsedMs:record.elapsedMs,evalCount:record.raw?.eval_count,promptEvalCount:record.raw?.prompt_eval_count,doneReason:record.raw?.done_reason,results,error:record.error});
 }
 const result={fixture:'original frozen synthetic gold',actualServiceRuns:0,developmentCalls:0,evaluationAttempts:attempts.length,limits:{model:'qwen3:4b',context:4096,output:512,timeoutSeconds:60,concurrency:1,temperature:0,seed:42,think:false},expectedFacetLinks:expected.size,explicitLinkBaseline:score(keys(proposeExplicit(d))),rawModel:score(keys(rawProposals)),afterSourceRules:score(keys(validated)),humanAcceptedModelLinks:0,attempts};await writeFile('artifacts/model-evaluation.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,attempts:attempts.map(({testId,status,parseState,elapsedMs})=>({testId,status,parseState,elapsedMs}))},null,2));
}
