import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fixtures} from './fixture.mjs';
import {validateProposal} from './core.mjs';
export const digest=text=>createHash('sha256').update(text).digest('hex');
export function requestMatches(snapshot,record){try{const actual=JSON.parse(record.request.messages[1].content);const expected={requirements:snapshot.modelInput.requirements,test:snapshot.modelInput.tests.find(t=>t.id===record.testId)};return JSON.stringify(actual)===JSON.stringify(expected);}catch{return false;}}
export function validateArchived(data,snapshot,record,p){
 if(!p||typeof p!=='object'||Array.isArray(p))return {proposal:p,validation:{valid:false,status:'invalid-proposal',issues:['Proposal must be an object.']}};
 const r=snapshot.fixture.requirements.find(r=>r.id===p.requirementId),t=snapshot.fixture.tests.find(t=>t.id===p.testId);
 const proposal={...p,requirementSourceId:r?.source.id,testSourceId:t?.source.id,requirementRevision:r?.revision,testRevision:t?.revision,requirementHash:r?.source.hash,testHash:t?.source.hash,requirementBaseline:snapshot.fixture.requirementBaseline,origin:'qwen3:4b'};
 const validation=!requestMatches(snapshot,record)?{valid:false,status:'snapshot-mismatch',issues:['Archived request differs from source snapshot.']}:p.testId!==record.testId?{valid:false,status:'wrong-test-id',issues:['Model escaped its test snapshot.']}:validateProposal(data,proposal);
 return {proposal,validation};
}
export async function saveSnapshot(commit){
 const raw=await readFile('artifacts/model-input.json','utf8');let data=fixtures(), provenance='captured-before-new-inference';
 if(commit){commit=execFileSync('git',['rev-parse',commit],{encoding:'utf8'}).trim();const source=execFileSync('git',['show',commit+':fixture.mjs'],{encoding:'utf8'});data=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).fixtures();provenance='reconstructed-from-pre-inference-commit-and-verified-against-recorded-requests';}
 else{try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{commit='uncommitted-development';}}
 const result={provenance,sourceCommit:commit,modelInputDigest:digest(raw),modelInput:JSON.parse(raw),fixture:data};await writeFile('artifacts/source-snapshot.json',JSON.stringify(result,null,2));return result;
}
if(process.argv.includes('--recover')){console.log((await saveSnapshot(process.argv.at(-1))).sourceCommit);}
