import { refreshSource } from './fixture.mjs';

const clone = value => structuredClone(value);
const reqFor = (d,id) => d.requirements.find(r=>r.id===id);
const testFor = (d,id) => d.tests.find(t=>t.id===id && t.accessible);
function sourceValid(item) { return item.source?.id === `synthetic:${item.id}` && refreshSource(clone(item)).source.hash === item.source.hash; }

function supports(r,t,a,f) {
  if (!a.anchors?.some(x=>x.requirementId===r.id && x.facetId===f) || r.status !== 'approved') return false;
  const preconditions = t.preconditions.map(p=>p.kind);
  const pre = {R1:'cancelled',R2:'retry',R3:'changed',R4:'plant',R5:'load'}[r.id];
  if (!preconditions.includes(pre)) return false;
  const kinds = {R1:{F1:'error',F2:'no-new-job'},R2:{F1:'original-receipt',F2:'one-job'},R3:{F1:'error',F2:'original-preserved'},R4:{F1:'list-isolation',F2:'detail-isolation',F3:'source-isolation'},R5:{F1:'performance'}};
  if (a.kind !== kinds[r.id]?.[f]) return false;
  if (a.kind==='error') return a.status===409 && a.code===r.errorCode;
  if (['detail-isolation','source-isolation'].includes(a.kind)) return a.status===403 && a.noRestrictedFields===true;
  if (a.kind==='performance') return ['clients','requestsPerClient','operator','maxMs','scope'].every(k=>a[k]===r.performance[k]);
  return true;
}

export function proposeExplicit(data) {
  const proposals=[];
  for (const r of data.requirements) for (const t of data.tests.filter(t=>t.accessible)) {
    const spans=[];
    for (const f of r.facets) for (const a of t.assertions) if (supports(r,t,a,f.id)) spans.push({facetId:f.id,assertionId:a.id,start:0,end:a.text.length,text:a.text});
    if (spans.length) proposals.push({requirementId:r.id,testId:t.id,requirementSourceId:r.source.id,testSourceId:t.source.id,requirementRevision:r.revision,testRevision:t.revision,requirementHash:r.source.hash,testHash:t.source.hash,requirementBaseline:data.requirementBaseline,facetIds:[...new Set(spans.map(s=>s.facetId))],spans,origin:'explicit-link-rules'});
  }
  return proposals;
}

export function validateProposal(data, proposal) {
  const issues=[];
  if (!proposal || typeof proposal!=='object' || Array.isArray(proposal)) return {valid:false,status:'invalid',issues:['Proposal must be an object.']};
  const r=reqFor(data,proposal.requirementId), t=testFor(data,proposal.testId);
  // Do not distinguish missing from inaccessible sources or disclose their IDs or details.
  if (!r || !t) return {valid:false,status:'unavailable',issues:['Source unavailable.']};
  if (!sourceValid(r) || !sourceValid(t)) issues.push('Source hash integrity mismatch.');
  for (const [key,expected] of Object.entries({requirementSourceId:r.source.id,testSourceId:t.source.id,requirementRevision:r.revision,testRevision:t.revision,requirementHash:r.source.hash,testHash:t.source.hash,requirementBaseline:data.requirementBaseline})) if (proposal[key]!==expected) issues.push(`Stale ${key}.`);
  if (!Array.isArray(proposal.facetIds) || !proposal.facetIds.length || new Set(proposal.facetIds).size!==proposal.facetIds.length) issues.push('Nonempty unique facet IDs required.');
  if (!Array.isArray(proposal.spans) || !proposal.spans.length) issues.push('Exact assertion spans required.');
  const facetIds=Array.isArray(proposal.facetIds)?proposal.facetIds:[];
  const proposedSpans=Array.isArray(proposal.spans)?proposal.spans:[];
  let unsupported=false;
  for (const f of facetIds) {
    if (!r.facets.some(x=>x.id===f)) { issues.push('Unknown requirement facet.'); continue; }
    const spans=proposedSpans.filter(s=>s && s.facetId===f);
    if (!spans.length) issues.push('Facet has no assertion span.');
    for (const s of spans) {
      const a=t.assertions.find(x=>x.id===s.assertionId);
      if (!a || typeof s.text!=='string' || !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start!==0 || s.end!==a.text.length || a.text.slice(s.start,s.end)!==s.text) { issues.push('Invalid exact assertion span: include the complete assertion context.'); continue; }
      if (!supports(r,t,a,f)) unsupported=true;
    }
  }
  for (const s of proposedSpans) if (!s || !facetIds.includes(s.facetId)) issues.push('Span facet is not in proposed facets.');
  if (issues.length) return {valid:false,status:issues.some(x=>x.startsWith('Stale'))?'stale':'invalid',issues};
  // Structurally valid source spans remain proposals. Human review is required for semantic coverage.
  return {valid:true,status:unsupported?'unsupported':'supported',issues:[],proposal:clone(proposal)};
}

export function accept(data, proposal, reviewer='QA reviewer') {
  const result=validateProposal(data,proposal);
  if (!result.valid || result.status!=='supported') return {state:'rejected',reason:result.status,issues:result.issues};
  return {state:'accepted',reviewer:String(reviewer),proposal:clone(proposal),reviewedAt:new Date().toISOString(),semanticDecision:'Human accepted stated facets only.'};
}

export function executionEvidence(data,testId,requirementId) {
  const t=testFor(data,testId),r=reqFor(data,requirementId);
  if (!t || !r) return {status:'unavailable',label:'Evidence unavailable'};
  if (!sourceValid(t) || !sourceValid(r)) return {status:'conflict',label:'Requirement or test source integrity mismatch'};
  if (!r.facets.some(f=>t.assertions.some(a=>supports(r,t,a,f.id)))) return {status:'unsupported',label:'Test assertions do not support this requirement'};
  const runs=data.runs.filter(x=>x.testId===testId);
  if (!runs.length) return {status:'unavailable',label:'No run fixture'};
  const run=runs.at(-1);
  if (!sourceValid(run)) return {status:'conflict',label:'Run source integrity mismatch'};
  if (run.testSourceId!==t.source.id || run.softwareBaseline!==data.baseline || run.testRevision!==t.revision || run.testHash!==t.source.hash) return {status:'stale',label:'Run source, baseline or test version is stale',runId:run.id,fictional:run.fictional};
  if (run.outcome!=='pass') return {status:run.outcome==='fail'?'fixture-fail':'unknown',label:run.fictional?'Fictional fixture result':'Run result',runId:run.id,fictional:run.fictional};
  if (r.performance) {
    const p=r.performance,m=run.measurements;
    if (!m || m.scope!==p.scope || m.concurrency!==p.clients || !Array.isArray(m.successfulRequestsPerClient) || m.successfulRequestsPerClient.length!==p.clients || !m.successfulRequestsPerClient.every(x=>x===p.requestsPerClient) || m.successfulRequests!==p.clients*p.requestsPerClient || !Number.isFinite(m.maxAcknowledgementMs) || m.maxAcknowledgementMs<0) return {status:'unknown',label:'Declared load measurements unavailable',runId:run.id,fictional:run.fictional};
    if (!(p.operator==='<' ? m.maxAcknowledgementMs<p.maxMs : m.maxAcknowledgementMs<=p.maxMs)) return {status:'fixture-fail',label:'Fictional fixture exceeds required timing boundary',runId:run.id,fictional:run.fictional};
  }
  // This project only includes fictional service runs, never actual performance or certification.
  return {status:run.fictional?'fixture-pass':'unknown',label:run.fictional?'Eligible fictional fixture pass':'Actual run requires separate provenance verification',runId:run.id,fictional:run.fictional,measurements:clone(run.measurements)};
}

export function summarize(data,reviews=[]) {
  const accessibleReviews=reviews.filter(x=>x.proposal && testFor(data,x.proposal.testId));
  const classified=accessibleReviews.map(review=>({review,validation:validateProposal(data,review.proposal)}));
  const rows=data.requirements.map(r=>{
    const candidates=classified.filter(x=>x.review.proposal.requirementId===r.id);
    const accepted=candidates.filter(x=>x.review.state==='accepted' && x.validation.valid && x.validation.status==='supported');
    const covered=[...new Set(accepted.flatMap(x=>x.review.proposal.facetIds))];
    const missing=r.facets.map(f=>f.id).filter(f=>!covered.includes(f));
    const links=accepted.map(x=>({testId:x.review.proposal.testId,facetIds:clone(x.review.proposal.facetIds),reviewer:x.review.reviewer,execution:executionEvidence(data,x.review.proposal.testId,r.id)}));
    const executionFacets=new Set(links.filter(x=>x.execution.status==='fixture-pass').flatMap(x=>x.facetIds));
    const definition=r.status!=='approved'?'clarify':covered.length===0?'zero':missing.length?'partial':'complete';
    const execution=r.status!=='approved'?'unknown':r.facets.length>0 && r.facets.every(f=>executionFacets.has(f.id))?'fixture-pass':links.some(x=>x.execution.status==='fixture-fail' || x.execution.status==='conflict')?'conflict':links.some(x=>x.execution.status==='stale')?'stale':executionFacets.size?'partial':'unavailable';
    return {id:r.id,requirementId:r.id,title:r.title,status:r.status,facetIds:r.facets.map(f=>f.id),coveredFacetIds:covered,missingFacetIds:missing,definition,definitionStatus:definition,execution,executionStatus:execution,links,staleReviewCount:candidates.filter(x=>x.review.state==='accepted' && !x.validation.valid).length,clarification:r.clarification};
  });
  return {baseline:data.baseline,requirementBaseline:data.requirementBaseline,requirements:rows,counts:{requirements:rows.length,accessibleTests:data.tests.filter(t=>t.accessible).length,acceptedLinks:rows.reduce((n,r)=>n+r.links.length,0),staleReviews:rows.reduce((n,r)=>n+r.staleReviewCount,0),completeDefinitions:rows.filter(r=>r.definition==='complete').length},actualServiceExecutions:0,notice:'Definition coverage, fictional run eligibility, and actual executed engine tests are separate.'};
}

export function parseModel(data,text) {
  if (text===null || text===undefined || text==='TIMEOUT') return {status:'timeout',proposals:[],issues:['Bounded model call timed out.']};
  let parsed;
  try { parsed=JSON.parse(text); } catch { return {status:'invalid-json',proposals:[],issues:['Model returned invalid JSON.']}; }
  if (!parsed || !Array.isArray(parsed.proposals) || parsed.proposals.length>72) return {status:'invalid-json',proposals:[],issues:['Expected an object containing at most 72 proposals.']};
  const results=parsed.proposals.map(p=>validateProposal(data,p));
  return {status:results.every(x=>x.valid)?'proposed':'invalid-proposal',proposals:results.filter(x=>x.valid).map(x=>x.proposal),results,issues:results.flatMap(x=>x.issues)};
}

export function mutate(data,name) {
  const d=clone(data),r1=reqFor(d,'R1'),r5=reqFor(d,'R5'),t3=d.tests.find(t=>t.id==='T3'),t11=d.tests.find(t=>t.id==='T11'),run=d.runs.find(r=>r.testId==='T11');
  switch(name) {
    case 'r1-error-code': r1.revision++; r1.errorCode='ORDER_VOIDED'; r1.text=r1.text.replace('ORDER_CANCELLED','ORDER_VOIDED'); r1.facets[0].text='409 with ORDER_VOIDED'; refreshSource(r1); break;
    case 't3-remove-assertions': t3.assertions=[]; t3.revision++; refreshSource(t3); break;
    case 't11-max-2001': run.measurements.maxAcknowledgementMs=2001; refreshSource(run); break;
    case 'r5-strict-boundary': r5.revision++; r5.performance.operator='<'; r5.text=r5.text.replace('<= 2000','< 2000'); refreshSource(r5); break;
    case 'test-revision-mismatch': t11.revision++; refreshSource(t11); break;
    case 'software-baseline-mismatch': run.softwareBaseline='APP-0'; refreshSource(run); break;
    case 'revoke-t10': d.tests=d.tests.filter(t=>t.id!=='T10'); d.runs=d.runs.filter(r=>r.testId!=='T10'); break;
    default: throw new Error('Unknown mutation.');
  }
  return d;
}
