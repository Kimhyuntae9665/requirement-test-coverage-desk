let state,selected='T3',requestGeneration=0,mutationTail=Promise.resolve();
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
async function request(path,input){
 const generation=++requestGeneration;
 const execute=async()=>{try{
  const r=await fetch('/api/'+path,input!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{});
  const result=await r.json();
  // An older success or error cannot restore data after a newer user action.
  if(generation!==requestGeneration)return;
  if(!r.ok){if(result.error==='proposal_stale'&&result.state){state=result.state;render();}throw Error(result.message||result.error);}
  state=result;render();$('toast').textContent='';
 }catch(e){if(generation===requestGeneration)$('toast').textContent=e.message;}};
 if(input!==undefined){const operation=mutationTail.then(execute);mutationTail=operation;await operation;}
 else {await mutationTail;if(generation===requestGeneration)await execute();}
}
function inspection(p){return Object.fromEntries(['reviewToken','requirementSourceId','testSourceId','requirementRevision','testRevision','requirementHash','testHash','requirementBaseline'].map(key=>[key,p[key]]));}
function render(){
 const c=state.summary.counts;$('stats').replaceChildren(...[['Requirements',c.requirements],['Accessible tests',c.accessibleTests],['Accepted links',c.acceptedLinks],['Stale reviews',c.staleReviews]].map(([label,value])=>{const n=el('div',undefined,'stat');n.append(el('b',value),el('span',label));return n;}));
 $('matrix').replaceChildren(...state.summary.requirements.flatMap(row=>{
  const req=state.data.requirements.find(r=>r.id===row.requirementId);
  return (req.facets.length?req.facets:[{id:null,text:'Clarify measurable acceptance threshold'}]).map(f=>{
   const tr=el('tr');const title=el('td',row.requirementId+(f.id?' / '+f.id:'')+' · '+req.title);title.append(el('small',f.text));
   const details=el('details');details.append(el('summary','Original requirement'),el('p',req.text),el('code',req.source.id+' · rev '+req.revision+' · '+state.data.requirementBaseline+' · SHA256 '+req.source.hash));title.append(details);
   const support=el('td');const candidates=state.definitionSupport.filter(p=>p.requirementId===req.id&&p.facetIds.includes(f.id));
   support.append(el('span',!f.id?'clarify':candidates.length?'assertion support':'zero','status'));
   for(const p of candidates){const b=el('button',p.testId+' source','source-link');b.onclick=()=>{selected=p.testId;$('test').value=selected;renderEvidence();$('test').focus();};support.append(b);}support.append(el('small','Definitions only · no run claim'));
   const accepted=el('td');const links=row.links.filter(l=>l.facetIds.includes(f.id));accepted.append(el('span',!f.id?'clarify':links.length?'accepted':'unaccepted','status'));
   if(links.length)accepted.append(el('small',links.map(l=>l.testId).join(' + ')));else if(row.staleReviewCount)accepted.append(el('small',row.staleReviewCount+' stale decision(s)'));
   const statuses=links.map(l=>l.execution.status);const status=!f.id?'unknown':statuses.includes('fixture-pass')?'fixture-pass':statuses.some(s=>['fixture-fail','conflict'].includes(s))?'conflict':statuses.includes('stale')?'stale':'unavailable';
   const run=el('td');run.append(el('span',status,'status'),el('small',status==='fixture-pass'?'FICTIONAL · not measured here':status==='unavailable'?'No accepted compatible execution':req.clarification||'Review source / run baseline'));
   tr.append(title,support,accepted,run);return tr;
  });
 }));
 if(!state.data.tests.some(t=>t.id===selected))selected=state.data.tests[0]?.id;
 $('test').replaceChildren(...state.data.tests.map(t=>{const n=el('option',t.id+' · '+t.title);n.value=t.id;return n;}));$('test').value=selected;renderEvidence();
 $('modelstatus').textContent=state.modelState.status+(state.modelState.message?' · '+state.modelState.message:'');
}
function renderEvidence(){const t=state.data.tests.find(t=>t.id===selected);if(!t)return;$('selected').textContent=t.id+' / rev '+t.revision;const out=$('evidence');out.replaceChildren(el('h3',t.title),el('code',t.source.id+' · SHA256 '+t.source.hash));out.append(el('div',t.preconditions.map(p=>p.id+' · '+p.text).join('\n'),'pre'));for(const a of t.assertions){const n=el('div',undefined,'assertion');n.append(el('code',a.id+' [0:'+a.text.length+']'),el('div',a.text));out.append(n);}if(!t.assertions.length)out.append(el('div','Assertions removed. Title establishes no coverage.','run'));const runs=state.data.runs.filter(r=>r.testId===t.id);if(!runs.length)out.append(el('div','Execution evidence unavailable · no run fixture.','run'));for(const r of runs){const evidence=state.testEvidence.find(x=>x.testId===t.id)?.requirements.find(x=>x.requirementId==='R5');out.append(el('div','FICTIONAL '+r.id+' · '+r.softwareBaseline+' · '+evidence.status+'\n5 clients × 40 successes · max '+r.measurements.maxAcknowledgementMs+' ms. These numbers are fixture data, not measurements from this application.','run'));}
 const links=$('links');links.replaceChildren();const ps=state.proposals.filter(p=>p.testId===selected);if(!ps.length)links.append(el('p','No proposed assertion links. Titles and configuration values do not establish coverage.'));for(const p of ps){const n=el('div',undefined,'link');n.append(el('strong',p.requirementId+' → '+p.facetIds.join(' + ')+' · '+p.validation.status));const requirement=state.data.requirements.find(r=>r.id===p.requirementId);n.append(el('p',requirement.text),el('code',requirement.source.id+' · rev '+requirement.revision+' · '+state.data.requirementBaseline+' · SHA256 '+requirement.source.hash));for(const span of p.spans)n.append(el('p',span.assertionId+' ['+span.start+':'+span.end+'] “'+span.text+'”'));const reviewed=state.reviews.some(r=>r.state==='accepted'&&r.proposal.testId===p.testId&&r.proposal.requirementId===p.requirementId&&r.proposal.testHash===p.testHash&&r.proposal.requirementHash===p.requirementHash);const b=el('button',!p.validation.valid?'Stale decision · source changed':reviewed?'Accepted by demo reviewer':'Accept semantic coverage');b.disabled=reviewed||!p.validation.valid||p.validation.status!=='supported';b.onclick=()=>request('accept',{testId:p.testId,requirementId:p.requirementId,inspection:inspection(p)});n.append(b);if(!p.validation.valid)n.append(el('p',p.validation.issues.join(' ')));links.append(n);}}
$('test').onchange=()=>{selected=$('test').value;renderEvidence();};$('propose').onclick=()=>request('propose',{mode:'explicit'});$('archived').onclick=()=>request('propose',{mode:'archived_model'});$('reset').onclick=()=>request('reset',{});$('invalid').onclick=()=>request('propose',{mode:'invalid_json'});$('timeout').onclick=()=>request('propose',{mode:'timeout'});
for(const [name,label] of [['r1-error-code','R1 code revision'],['t3-remove-assertions','Remove T3 assertions'],['t11-max-2001','T11 max → 2001 ms'],['r5-strict-boundary','R5 boundary → < 2000'],['test-revision-mismatch','T11 test revision'],['software-baseline-mismatch','T11 run → APP-0'],['revoke-t10','Revoke T10 access']]){const b=el('button',label);b.onclick=()=>request('mutate',{name});$('mutations').append(b);}
request('state');
