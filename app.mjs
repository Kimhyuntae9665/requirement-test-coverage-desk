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
 const c=state.summary.counts;$('stats').replaceChildren(...[['요구사항',c.requirements],['접근 가능한 테스트',c.accessibleTests],['수락한 연결',c.acceptedLinks],['오래된 검토',c.staleReviews]].map(([label,value])=>{const n=el('div',undefined,'stat');n.append(el('b',value),el('span',label));return n;}));
 $('matrix').replaceChildren(...state.summary.requirements.flatMap(row=>{
  const req=state.data.requirements.find(r=>r.id===row.requirementId);
  return (req.facets.length?req.facets:[{id:null,text:'측정 가능한 수락 기준 확인 필요'}]).map(f=>{
   const tr=el('tr');const title=el('td',row.requirementId+(f.id?' / '+f.id:'')+' · '+req.title);title.append(el('small',f.text));
   const details=el('details');details.append(el('summary','요구사항 원문'),el('p',req.text),el('code',req.source.id+' · rev '+req.revision+' · '+state.data.requirementBaseline+' · SHA256 '+req.source.hash));title.append(details);
   const support=el('td');const candidates=state.definitionSupport.filter(p=>p.requirementId===req.id&&p.facetIds.includes(f.id));
   support.append(el('span',!f.id?'clarify':candidates.length?'정의 근거 · assertion support':'근거 없음 · zero','status'));
   for(const p of candidates){const b=el('button',p.testId+' 원문','source-link');b.onclick=()=>{selected=p.testId;$('test').value=selected;renderEvidence();$('test').focus();};support.append(b);}support.append(el('small','정의 근거만 표시 · 실행 주장 없음'));
   const accepted=el('td');const links=row.links.filter(l=>l.facetIds.includes(f.id));accepted.append(el('span',!f.id?'clarify':links.length?'accepted':'미수락 · unaccepted','status'));
   if(links.length)accepted.append(el('small',links.map(l=>l.testId).join(' + ')));else if(row.staleReviewCount)accepted.append(el('small',row.staleReviewCount+' stale decision(s)'));
   const statuses=links.map(l=>l.execution.status);const status=!f.id?'unknown':statuses.includes('fixture-pass')?'fixture-pass':statuses.some(s=>['fixture-fail','conflict'].includes(s))?'conflict':statuses.includes('stale')?'stale':'unavailable';
   const run=el('td');run.append(el('span',status,'status'),el('small',status==='fixture-pass'?'가상 데이터 · 실제 측정 없음':status==='unavailable'?'수락된 호환 실행 없음':req.clarification||'원문과 실행 baseline 확인'));
   tr.append(title,support,accepted,run);return tr;
  });
 }));
 if(!state.data.tests.some(t=>t.id===selected))selected=state.data.tests[0]?.id;
 $('test').replaceChildren(...state.data.tests.map(t=>{const n=el('option',t.id+' · '+t.title);n.value=t.id;return n;}));$('test').value=selected;renderEvidence();
 renderHistory();
 $('modelstatus').textContent=state.modelState.status+(state.modelState.message?' · '+state.modelState.message:'');
}
function renderEvidence(){const t=state.data.tests.find(t=>t.id===selected);if(!t)return;$('selected').textContent=t.id+' / rev '+t.revision;const out=$('evidence');out.replaceChildren(el('h3',t.title),el('code',t.source.id+' · SHA256 '+t.source.hash));out.append(el('div',t.preconditions.map(p=>p.id+' · '+p.text).join('\n'),'pre'));for(const a of t.assertions){const n=el('div',undefined,'assertion');n.append(el('code',a.id+' [0:'+a.text.length+']'),el('div',a.text));out.append(n);}if(!t.assertions.length)out.append(el('div','Assertion 제거됨 · Assertions removed. 제목은 근거가 아닙니다.','run'));const runs=state.data.runs.filter(r=>r.testId===t.id);if(!runs.length)out.append(el('div','실행 근거 없음 · run fixture unavailable','run'));for(const r of runs){const evidence=state.testEvidence.find(x=>x.testId===t.id)?.requirements.find(x=>x.requirementId==='R5');out.append(el('div','FICTIONAL '+r.id+' · '+r.softwareBaseline+' · '+evidence.status+'\n5 clients × 40 successes · max '+r.measurements.maxAcknowledgementMs+' ms. 가상 fixture 수치이며 이 애플리케이션의 실제 측정값이 아닙니다.','run'));}
 const links=$('links');links.replaceChildren();const ps=state.proposals.filter(p=>p.testId===selected);if(!ps.length)links.append(el('p','제안된 연결 없음. 제목과 설정값은 충족 근거가 아닙니다.'));for(const p of ps){const n=el('div',undefined,'link');n.append(el('strong',p.requirementId+' → '+p.facetIds.join(' + ')+' · '+p.validation.status));const requirement=state.data.requirements.find(r=>r.id===p.requirementId);n.append(el('p',requirement.text),el('code',requirement.source.id+' · rev '+requirement.revision+' · '+state.data.requirementBaseline+' · SHA256 '+requirement.source.hash));for(const span of p.spans)n.append(el('p',span.assertionId+' ['+span.start+':'+span.end+'] “'+span.text+'”'));const reviewed=state.reviews.some(r=>r.state==='accepted'&&r.proposal.testId===p.testId&&r.proposal.requirementId===p.requirementId&&r.proposal.testHash===p.testHash&&r.proposal.requirementHash===p.requirementHash);const b=el('button',!p.validation.valid?'오래된 결정 · 원문 변경':reviewed?'demo-reviewer 수락 완료':'정의 패싯 수락');b.disabled=reviewed||!p.validation.valid||p.validation.status!=='supported';b.onclick=()=>request('accept',{testId:p.testId,requirementId:p.requirementId,inspection:inspection(p)});n.append(b);if(!p.validation.valid)n.append(el('p',p.validation.issues.join(' ')));links.append(n);}}
function renderHistory(){
 const history=$('history');history.replaceChildren();
 if(!state.reviews.length){history.append(el('p','수락 영수증 없음. 제안은 현재 검토 권한을 부여하지 않습니다.'));return;}
 for(const r of state.reviews){
  const p=r.proposal,row=state.summary.requirements.find(x=>x.requirementId===p.requirementId);
  const current=row?.links.some(l=>l.testId===p.testId);
  const n=el('article',undefined,'receipt');
  n.append(el('strong',p.requirementId+' ← '+p.testId+' · '+p.facetIds.join(' + ')+' · '+(current?'현재 수락 · accepted':'오래된 검토 · stale')),
   el('p','검토자 '+r.reviewer+' · '+r.reviewedAt),
   el('code',p.requirementSourceId+' / rev '+p.requirementRevision+' · '+p.testSourceId+' / rev '+p.testRevision+' · '+p.requirementBaseline),
   el('p','requirement SHA256 '+p.requirementHash+' · test SHA256 '+p.testHash),
   el('p','수락한 정의 패싯만 유효합니다. 실제 서비스 실행 통과를 의미하지 않습니다.'));
  history.append(n);
 }
}
$('test').onchange=()=>{selected=$('test').value;renderEvidence();};$('propose').onclick=()=>request('propose',{mode:'explicit'});$('archived').onclick=()=>request('propose',{mode:'archived_model'});$('reset').onclick=()=>request('reset',{});$('invalid').onclick=()=>request('propose',{mode:'invalid_json'});$('timeout').onclick=()=>request('propose',{mode:'timeout'});
for(const [name,label] of [['r1-error-code','R1 오류 코드 변경'],['t3-remove-assertions','T3 assertion 제거'],['t11-max-2001','T11 최대값 → 2001 ms'],['r5-strict-boundary','R5 경계 → < 2000'],['test-revision-mismatch','T11 정의 revision 변경'],['software-baseline-mismatch','T11 실행 → APP-0'],['revoke-t10','T10 접근 철회']]){const b=el('button',label);b.onclick=()=>request('mutate',{name});$('mutations').append(b);}
request('state');
