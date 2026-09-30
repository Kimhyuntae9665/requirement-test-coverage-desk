import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtures, refreshSource } from '../fixture.mjs';
import { proposeExplicit, validateProposal, accept, summarize, mutate, parseModel, executionEvidence } from '../core.mjs';

const original=fixtures();
const proposals=proposeExplicit(original);
const proposal=(r,t)=>proposals.find(p=>p.requirementId===r && p.testId===t);
const reviews=()=>proposals.map(p=>accept(original,p,'Synthetic QA reviewer'));
const row=(d,reviews,id)=>summarize(d,reviews).requirements.find(r=>r.id===id);

test('frozen original gold exactly matches the explicit-link definition baseline',()=>{
  const gold=JSON.parse(readFileSync(new URL('../gold.json',import.meta.url)));
  assert.equal(gold.frozenBeforeModelPrompt,true);
  assert.deepEqual(Object.fromEntries(proposals.map(p=>[`${p.requirementId}:${p.testId}`,p.facetIds])),gold.supportedPairs);
  assert.equal(proposals.length,9);
});
test('fixtures are fresh, deeply frozen, source integrity checked and original gold is unused at runtime',()=>{
  assert.notEqual(fixtures(),original);
  assert.throws(()=>{original.tests[0].title='changed';},TypeError);
  const d=structuredClone(original); d.tests.find(t=>t.id==='T3').assertions[1].text='There is a new job.';
  assert.equal(validateProposal(d,proposal('R1','T3')).valid,false);
});
test('titles, released precondition, configuration values and vague draft establish no coverage',()=>{
  for(const id of ['T1','T7','T12']) assert.ok(!proposals.some(p=>p.testId===id));
  assert.equal(row(original,[],'R6').definition,'clarify');
  assert.equal(row(original,[],'R6').execution,'unknown');
  assert.equal(row(original,[],'R1').definition,'zero');
});
test('partial definitions and complementary accepted union never manufacture absent runs',()=>{
  assert.equal(row(original,[accept(original,proposal('R1','T2'))],'R1').definition,'partial');
  assert.equal(row(original,[accept(original,proposal('R2','T4'))],'R2').definition,'partial');
  assert.equal(row(original,[accept(original,proposal('R4','T6'))],'R4').definition,'partial');
  assert.equal(row(original,[accept(original,proposal('R4','T10'))],'R4').definition,'partial');
  const s=summarize(original,reviews());
  assert.equal(s.counts.completeDefinitions,5);
  assert.equal(s.requirements.find(r=>r.id==='R4').execution,'unavailable');
  assert.equal(s.requirements.find(r=>r.id==='R5').execution,'fixture-pass');
  assert.equal(s.actualServiceExecutions,0);
});
test('a proposed supported link carries no authority before human review',()=>{
  assert.equal(row(original,[{state:'proposed',proposal:proposal('R1','T3')}],'R1').definition,'zero');
  assert.equal(accept(original,proposal('R1','T3'),'QA').state,'accepted');
});
test('unlisted pairs are unsupported rather than contradictory',()=>{
  const p=structuredClone(proposal('R1','T2')),t=original.tests.find(t=>t.id==='T1');
  Object.assign(p,{testId:t.id,testSourceId:t.source.id,testRevision:t.revision,testHash:t.source.hash,spans:[{facetId:'F1',assertionId:t.assertions[0].id,start:0,end:t.assertions[0].text.length,text:t.assertions[0].text}]});
  assert.deepEqual(validateProposal(original,p).status,'unsupported');
  assert.equal(validateProposal(original,p).valid,true);
  assert.equal(accept(original,p).reason,'unsupported');
});
test('IDs, revision, baseline, exact span context and assertion source are validated',()=>{
  const p=structuredClone(proposal('R1','T3'));
  for(const patch of [{requirementId:'R404'},{testId:'T404'},{requirementRevision:99},{testRevision:99},{requirementBaseline:'REQ-0'},{requirementHash:'bad'},{testHash:'bad'},{facetIds:['F99']},{spans:[]},{spans:[{...p.spans[0],assertionId:'title'}]},{spans:[{...p.spans[0],text:'409',start:23,end:26}]},{facetIds:'F1'},{spans:'bad'}]) assert.equal(validateProposal(original,{...p,...patch}).valid,false);
});
test('changed R1 code invalidates previous review and does not retain old error assertion support',()=>{
  const d=mutate(original,'r1-error-code');
  assert.equal(row(d,reviews(),'R1').staleReviewCount,2);
  assert.equal(row(d,reviews(),'R1').definition,'zero');
  assert.deepEqual(proposeExplicit(d).find(p=>p.requirementId==='R1').facetIds,['F2']);
});
test('removing T3 assertions loses facets despite unchanged title and cannot preserve cached review authority',()=>{
  const d=mutate(original,'t3-remove-assertions');
  assert.equal(d.tests.find(t=>t.id==='T3').title,original.tests.find(t=>t.id==='T3').title);
  assert.ok(!proposeExplicit(d).some(p=>p.testId==='T3'));
  assert.equal(row(d,[accept(original,proposal('R1','T3'))],'R1').definition,'zero');
  assert.equal(row(d,reviews(),'R1').definition,'partial');
});
test('fictional run provenance and actual test execution remain separate; old APP-0 never verifies APP-1',()=>{
  assert.equal(executionEvidence(original,'T8','R5').status,'stale');
  const result=executionEvidence(original,'T11','R5');
  assert.equal(result.status,'fixture-pass'); assert.equal(result.fictional,true);
  assert.equal(result.measurements.successfulRequests,200);
  assert.equal(executionEvidence(original,'T3','R1').status,'unavailable');
});
test('exact <= boundary passes 2000 and rejects 2001; strict < boundary rejects 2000',()=>{
  assert.equal(executionEvidence(original,'T11','R5').status,'fixture-pass');
  assert.equal(executionEvidence(mutate(original,'t11-max-2001'),'T11','R5').status,'fixture-fail');
  assert.equal(row(mutate(original,'t11-max-2001'),reviews(),'R5').execution,'conflict');
  const strict=mutate(original,'r5-strict-boundary');
  // The old <= definition cannot support a new < requirement. A matching revised definition
  // plus a run linked to that revision is still rejected when its maximum equals 2000.
  assert.equal(executionEvidence(strict,'T11','R5').status,'unsupported');
  const t=strict.tests.find(t=>t.id==='T11'),run=strict.runs.find(r=>r.testId==='T11');
  t.revision++; t.assertions[0].operator='<'; t.assertions[0].text=t.assertions[0].text.replace('<= 2000','< 2000'); refreshSource(t);
  run.testRevision=t.revision; run.testHash=t.source.hash; refreshSource(run);
  assert.equal(executionEvidence(strict,'T11','R5').status,'fixture-fail');
});
test('test revision and software baseline mismatch each block current run eligibility',()=>{
  for(const name of ['test-revision-mismatch','software-baseline-mismatch']) assert.equal(executionEvidence(mutate(original,name),'T11','R5').status,'stale');
});
test('configuration or missing/incomplete load measurements cannot count as performance evidence',()=>{
  const d=structuredClone(original),run=d.runs.find(r=>r.testId==='T11');
  run.measurements={timeout_ms:2000};refreshSource(run);
  assert.equal(executionEvidence(d,'T11','R5').status,'unknown');
  run.measurements={scope:'local-mock',concurrency:5,successfulRequestsPerClient:[40],successfulRequests:40,maxAcknowledgementMs:2000};refreshSource(run);
  assert.equal(executionEvidence(d,'T11','R5').status,'unknown');
});
test('access revocation removes source details, count hints, facets and cached authority',()=>{
  const d=mutate(original,'revoke-t10'),s=summarize(d,reviews());
  assert.ok(!JSON.stringify(d).includes('T10'));
  assert.ok(!JSON.stringify(s).includes('T10'));
  assert.equal(s.counts.accessibleTests,11);
  assert.deepEqual(row(d,reviews(),'R4').coveredFacetIds,['F1']);
  assert.equal(validateProposal(d,proposal('R4','T10')).status,'unavailable');
  assert.deepEqual(executionEvidence(d,'T10','R4'),{status:'unavailable',label:'Evidence unavailable'});
});
test('model timeout, invalid JSON, invalid shape and structurally invalid proposals are explicit states',()=>{
  assert.equal(parseModel(original,null).status,'timeout');
  assert.equal(parseModel(original,'TIMEOUT').status,'timeout');
  for(const text of ['no json','[]','{"proposals":null}',JSON.stringify({proposals:Array(73).fill({})})]) assert.equal(parseModel(original,text).status,'invalid-json');
  assert.equal(parseModel(original,JSON.stringify({proposals:[{}]})).status,'invalid-proposal');
  assert.equal(parseModel(original,JSON.stringify({proposals})).status,'proposed');
});
test('source identity changes cannot preserve accepted review authority or source integrity',()=>{
  for (const kind of ['requirements','tests']) {
    const d=structuredClone(original),item=d[kind].find(x=>x.id===(kind==='requirements'?'R1':'T3'));
    item.source.id='synthetic:substituted-source';
    assert.equal(validateProposal(d,proposal('R1','T3')).valid,false);
    assert.equal(row(d,[accept(original,proposal('R1','T3'))],'R1').definition,'zero');
    // Rehashing does not turn a different immutable identity into the original source.
    refreshSource(item);
    assert.equal(validateProposal(d,proposal('R1','T3')).valid,false);
  }
  for (const key of ['requirementSourceId','testSourceId']) {
    const p={...proposal('R1','T3'),[key]:'synthetic:substituted-source'};
    assert.equal(validateProposal(original,p).valid,false);
  }
});
test('run source identity and test-source provenance are independently bound',()=>{
  const d=structuredClone(original),run=d.runs.find(x=>x.testId==='T11');
  run.source.id='synthetic:substituted-run';
  assert.equal(executionEvidence(d,'T11','R5').status,'conflict');
  refreshSource(run);
  assert.equal(executionEvidence(d,'T11','R5').status,'conflict');
  const other=structuredClone(original),otherRun=other.runs.find(x=>x.testId==='T11');
  otherRun.testSourceId='synthetic:T8';refreshSource(otherRun);
  assert.equal(executionEvidence(other,'T11','R5').status,'stale');
});
test('a passing unrelated run never verifies another requirement or a draft',()=>{
  for (const requirementId of ['R1','R2','R3','R4','R6']) {
    const result=executionEvidence(original,'T11',requirementId);
    assert.equal(result.status,'unsupported');
    assert.equal(result.measurements,undefined);
    assert.equal(result.runId,undefined);
  }
  assert.equal(executionEvidence(original,'T11','R5').status,'fixture-pass');
});
