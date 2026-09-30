import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesk} from '../server.mjs';

const keys=['reviewToken','requirementSourceId','testSourceId','requirementRevision','testRevision','requirementHash','testHash','requirementBaseline'];
const inspected=p=>({testId:p.testId,requirementId:p.requirementId,inspection:Object.fromEntries(keys.map(k=>[k,p[k]]))});
async function desk(run){
 const server=createDesk();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(path,input)=>{const r=await fetch(base+'/api/'+path,{method:'POST',body:JSON.stringify(input)});return {status:r.status,state:await r.json()};};
 try {await run(post,async()=>(await fetch(base+'/api/state')).json());}finally{await new Promise(r=>server.close(r));}
}
const find=state=>state.proposals.find(p=>p.testId==='T3'&&p.requirementId==='R1');

test('two reviewers: rev1 acceptance cannot accept a same-ID rev2 replacement; fresh inspection can',()=>desk(async(post,get)=>{
 const old=find((await post('propose',{mode:'explicit'})).state),oldClick=inspected(old);
 await post('mutate',{name:'r1-error-code'});
 const fresh=find((await post('propose',{mode:'explicit'})).state);
 assert.equal(fresh.requirementRevision,2);assert.deepEqual(fresh.facetIds,['F2']);assert.notEqual(fresh.reviewToken,old.reviewToken);
 const rejected=await post('accept',oldClick);
 assert.equal(rejected.status,409);assert.equal(rejected.state.error,'proposal_stale');assert.match(rejected.state.message,/Inspect/);
 assert.equal(rejected.state.state.summary.counts.acceptedLinks,0);assert.equal((await get()).summary.counts.acceptedLinks,0);
 assert.equal((await post('accept',inspected(fresh))).status,200);
 assert.equal((await get()).summary.counts.acceptedLinks,1);
}));

test('acceptance requires every displayed source field and exact proposal generation',()=>desk(async(post,get)=>{
 const p=find((await post('propose',{})).state),click=inspected(p);
 assert.equal((await post('accept',{testId:p.testId,requirementId:p.requirementId})).status,409);
 for(const key of keys){const changed=structuredClone(click);changed.inspection[key]=typeof changed.inspection[key]==='number'?99:'substituted';
  assert.equal((await post('accept',changed)).status,409,key);}
 assert.equal((await get()).summary.counts.acceptedLinks,0);
 assert.equal((await post('accept',click)).status,200);assert.equal((await post('accept',click)).status,200);
 assert.equal((await get()).summary.counts.acceptedLinks,1);
 const replaced=find((await post('propose',{})).state);
 assert.notEqual(replaced.reviewToken,p.reviewToken);
 assert.equal((await post('accept',click)).status,409);
}));

test('source changes without re-proposal and revoked source clicks fail closed',()=>desk(async(post,get)=>{
 const state=(await post('propose',{})).state;
 await post('mutate',{name:'r1-error-code'});
 assert.equal((await post('accept',inspected(find(state)))).status,409);
 await post('mutate',{name:'revoke-t10'});
 const oldT10=state.proposals.find(p=>p.testId==='T10');const rejected=await post('accept',inspected(oldT10));
 assert.equal(rejected.status,409);assert.ok(!JSON.stringify(rejected.state).includes('T10'));
 assert.equal((await get()).summary.counts.acceptedLinks,0);
}));
