import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixtures} from '../fixture.mjs';
import {mutate,summarize} from '../core.mjs';

const snapshot=data=>({data,summary:summarize(data)});
const original=snapshot(fixtures()),revoked=snapshot(mutate(fixtures(),'revoke-t10'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=(body,ok=true)=>({ok,json:async()=>body});
async function client(){
 const nodes=new Map(),calls=[],rendered=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',append(){}});return nodes.get(id);};
 const context=vm.createContext({document:{getElementById:node,createElement:()=>({append(){}})},rendered,
  fetch:(url,options)=>{const pending=deferred();calls.push({url,options,...pending});return pending.promise;}});
 vm.runInContext(readFileSync(new URL('../app.mjs',import.meta.url),'utf8'),context);
 vm.runInContext('render=()=>rendered.push(JSON.parse(JSON.stringify(state)))',context);
 await tick();
 return {calls,rendered,node,request:(path,input)=>context.request(path,input),state:()=>vm.runInContext('state',context)};
}

test('held pre-revocation GET cannot restore revoked source details, counts or accepted authority',async()=>{
 const c=await client();assert.equal(c.calls[0].url,'/api/state');
 const revoke=c.request('mutate',{name:'revoke-t10'});await tick();
 c.calls[1].resolve(response(revoked));await revoke;
 c.calls[0].resolve(response(original));await tick();
 assert.equal(c.state().summary.counts.accessibleTests,11);
 assert.ok(!JSON.stringify(c.state()).includes('T10'));
 assert.equal(c.rendered.length,1);
});

test('late old HTTP error, network rejection and JSON failure cannot replace current state or toast',async()=>{
 for(const fail of [pending=>pending.resolve(response({error:'old_error'},false)),pending=>pending.reject(Error('old_network_error')),
  pending=>pending.resolve({ok:true,json:async()=>{throw Error('old_json_error');}})]){
  const c=await client();const revoke=c.request('mutate',{name:'revoke-t10'});await tick();
  c.calls[1].resolve(response(revoked));await revoke;fail(c.calls[0]);await tick();
  assert.equal(c.state().summary.counts.accessibleTests,11);assert.equal(c.node('toast').textContent,'');assert.equal(c.rendered.length,1);
 }
});

test('older success cannot clear a newer failure or populate stale state',async()=>{
 const c=await client();const action=c.request('mutate',{name:'revoke-t10'});await tick();
 c.calls[1].resolve(response({error:'current_failure'},false));await action;
 c.calls[0].resolve(response(original));await tick();
 assert.equal(c.state(),undefined);assert.equal(c.node('toast').textContent,'current_failure');assert.equal(c.rendered.length,0);
});

test('mutations execute in click order and a later GET waits for all queued mutations',async()=>{
 const c=await client();c.calls[0].resolve(response(original));await tick();
 const first=c.request('mutate',{name:'r1-error-code'});
 const second=c.request('mutate',{name:'revoke-t10'});
 const read=c.request('state');await tick();assert.equal(c.calls.length,2);
 c.calls[1].resolve(response(snapshot(mutate(fixtures(),'r1-error-code'))));await first;await tick();
 assert.equal(JSON.parse(c.calls[2].options.body).name,'revoke-t10');assert.equal(c.calls.length,3);
 c.calls[2].resolve(response(revoked));await second;await tick();
 assert.equal(c.calls[3].url,'/api/state');c.calls[3].resolve(response(revoked));await read;
 assert.equal(c.state().summary.counts.accessibleTests,11);assert.equal(c.rendered.length,2);
});

test('out-of-order repeated GETs keep the latest snapshot and ignore superseded reads',async()=>{
 const c=await client();const second=c.request('state');await tick();
 c.calls[1].resolve(response(revoked));await second;c.calls[0].resolve(response(original));await tick();
 assert.equal(c.state().summary.counts.accessibleTests,11);
 const skipped=c.request('state'),latest=c.request('state');await tick();
 assert.equal(c.calls.length,3);c.calls[2].resolve(response(revoked));await Promise.all([skipped,latest]);
 assert.equal(c.rendered.length,2);
});

test('stale acceptance displays refreshed sources and requires a separate acceptance action',async()=>{
 const c=await client();c.calls[0].resolve(response(original));await tick();
 const accept=c.request('accept',{testId:'T3',requirementId:'R1',inspection:{reviewToken:'old'}});await tick();
 const fresh=snapshot(mutate(fixtures(),'r1-error-code'));
 c.calls[1].resolve(response({error:'proposal_stale',message:'Proposal changed. Inspect refreshed sources.',state:fresh},false));await accept;
 assert.equal(c.state().data.requirements[0].revision,2);assert.match(c.node('toast').textContent,/Inspect/);
 assert.equal(c.calls.length,2);assert.equal(c.rendered.length,2);
});
