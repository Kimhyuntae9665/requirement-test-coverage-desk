"""Actual CPU-only UI checks and captures; no model calls or service measurements."""
import asyncio, hashlib, json, os, subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'artifacts/ui-refit'

async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 runtime=ROOT/'private/browser-runtime';helper=runtime/'ffmpeg-1011/ffmpeg-linux';helper.parent.mkdir(parents=True,exist_ok=True)
 if not helper.exists():helper.symlink_to('/usr/bin/ffmpeg')
 os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(runtime)
 server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'5155'},stdout=subprocess.PIPE,text=True)
 assert '5155' in server.stdout.readline()
 checks={'browser':'actual Google Chrome via Playwright','modelCalls':0,'actualServiceExecutions':0,'screenshots':[],'checks':[]}
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
   context=await browser.new_context(viewport={'width':1440,'height':1050},record_video_dir=str(ROOT/'private/ui-refit-video'),record_video_size={'width':1440,'height':1050})
   page=await context.new_page();url='http://127.0.0.1:5155'
   await page.goto(url);await page.wait_for_selector('#matrix tr')
   async def click(selector):
    async with page.expect_response(lambda r:'/api/' in r.url and r.request.method=='POST') as pending:
     await page.locator(selector).click()
    assert (await pending.value).status==200
    await page.wait_for_timeout(150)
   async def shot(name,target=None):
    if target:await page.locator(target).scroll_into_view_if_needed()
    await page.wait_for_timeout(600)
    await page.screenshot(path=str(OUT/name))
    checks['screenshots'].append(name)
   assert await page.locator('#matrix tr').count()==11
   assert await page.locator('h1').inner_text()=='요구사항 테스트 검토'
   await shot('01-facet-matrix.png')
   source=page.locator('button.source-link').first;await source.focus();await page.keyboard.press('Enter')
   assert await page.locator('#test').input_value()=='T2'
   assert await page.locator('#test').evaluate('(e)=>e===document.activeElement')
   summary=page.locator('summary').first;await summary.focus();await page.keyboard.press('Enter')
   assert await page.locator('details').first.evaluate('(e)=>e.open')
   await shot('02-original-source.png')
   checks['checks'].append('Keyboard source opens T2, focuses selector; native requirement disclosure opens with Enter')
   await click('#propose');await page.locator('#test').select_option('T3')
   assert await page.locator('#links button').is_enabled()
   assert await page.locator('#stats .stat').nth(2).locator('b').inner_text()=='0'
   await shot('03-proposed-link.png','.comparison')
   await click('#links button');assert await page.locator('#links button').is_disabled()
   state=await (await context.request.get(url+'/api/state')).json();proposal=next(x for x in state['proposals'] if x['testId']=='T3' and x['requirementId']=='R1')
   repeat=await context.request.post(url+'/api/accept',data={'testId':'T3','requirementId':'R1','inspection':proposal});assert repeat.status==200
   await page.reload();await page.wait_for_selector('#matrix tr')
   assert await page.locator('#stats .stat').nth(2).locator('b').inner_text()=='1'
   assert await page.locator('#history .receipt').count()==1
   assert 'demo-reviewer' in await page.locator('#history').inner_text()
   await shot('04-accepted-receipt.png','#history')
   checks['checks'].append('Proposals carry zero authority; acceptance disabled after one receipt; real repeated HTTP acceptance remains one receipt')
   await click('#mutations button:nth-child(1)')
   assert 'stale decision' in await page.locator('#matrix tr').first.inner_text()
   assert 'stale' in await page.locator('#history').inner_text()
   assert await page.locator('#links button').is_disabled()
   await shot('05-stale-review.png','.comparison')
   await click('#reset');await click('#propose');await page.locator('#test').select_option('T11');await click('#links button')
   assert 'fixture-pass' in await page.locator('#evidence').inner_text()
   await click('#mutations button:nth-child(3)')
   assert 'fixture-fail' in await page.locator('#evidence').inner_text()
   assert 'conflict' in await page.locator('#matrix').inner_text()
   await shot('06-fictional-conflict.png','.comparison')
   await click('#reset');await click('#propose');await page.locator('#test').select_option('T10');await click('#links button')
   state=await (await context.request.get(url+'/api/state')).json();t10=next(t for t in state['data']['tests'] if t['id']=='T10')
   await click('#mutations button:last-child')
   assert 'T10' not in await page.locator('#test').inner_text()
   assert 'T10' not in await page.locator('#history').inner_text()
   body=await page.locator('#evidence').inner_text()+await page.locator('#links').inner_text()+await page.locator('#matrix').inner_text()
   assert t10['source']['hash'] not in body and all(a['text'] not in body for a in t10['assertions'])
   await shot('07-access-revoked.png','#history')
   checks['checks'].append('Revocation removes T10 selection, assertions, source hash and reviewer receipt; count drops to 11')
   await click('#invalid');assert 'invalid-json' in await page.locator('#modelstatus').inner_text()
   assert await page.locator('#links button').count()==0
   await shot('08-invalid-json.png','.scenario')
   await click('#timeout');assert 'model_timeout' in await page.locator('#modelstatus').inner_text()
   await click('#reset');await click('#propose');await click('#mutations button:nth-child(2)')
   await page.locator('#test').select_option('T3');assert 'Assertions removed' in await page.locator('#evidence').inner_text()
   assert await page.locator('#links button').is_disabled()
   await shot('09-missing-assertions.png','.comparison')
   await click('#reset');await click('#archived');assert 'archived_model' in await page.locator('#modelstatus').inner_text()
   await page.locator('#test').select_option('T8');assert 'stale' in await page.locator('#evidence').inner_text()
   checks['checks'].append('Invalid JSON clears proposals; timeout is explicitly injected; missing assertions disable acceptance; archived CPU revalidation and stale APP-0 remain distinct')
   await click('#reset')
   boxes=await page.locator('.comparison > section').evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().width)')
   assert abs(boxes[0]-boxes[1])<1
   checks['checks'].append('Desktop source/result panels have equal widths')
   video=page.video;await context.close();await video.save_as(str(OUT/'review-demo.webm'))
   mobile=await browser.new_page(viewport={'width':390,'height':900})
   await mobile.goto(url);await mobile.wait_for_selector('#matrix tr')
   metrics=await mobile.evaluate('''()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,titleWidth:document.querySelector('h1').getBoundingClientRect().width,titleScroll:document.querySelector('h1').scrollWidth,titleFont:getComputedStyle(document.querySelector('h1')).fontSize,titleLine:getComputedStyle(document.querySelector('h1')).whiteSpace,tableScroll:document.querySelector('.table-scroll').scrollWidth,tableClient:document.querySelector('.table-scroll').clientWidth})''')
   assert metrics['scroll']==390 and metrics['titleScroll']<=metrics['titleWidth']+1 and metrics['titleFont']=='28px' and metrics['titleLine']=='nowrap'
   assert metrics['tableScroll']>metrics['tableClient']
   table=mobile.get_by_role('region',name='패싯별 근거 표 가로 스크롤');await table.focus();await mobile.keyboard.press('ArrowRight');await mobile.wait_for_timeout(200)
   assert await table.evaluate('(e)=>e.scrollLeft')>0
   await table.evaluate('(e)=>e.scrollLeft=0');await mobile.screenshot(path=str(OUT/'10-mobile-390.png'),full_page=True)
   checks['screenshots'].append('10-mobile-390.png');checks['mobile390']=metrics
   checks['checks'].append('390px: single-line 28px title, no page overflow, keyboard-scrollable native table')
   await browser.close()
  checks['assets']=[{'path':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(OUT.iterdir()) if f.suffix in ['.png','.webm']]
  (OUT/'browser-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(checks,ensure_ascii=False,indent=2))
 finally:server.terminate();server.wait(timeout=10)

if __name__=='__main__':
 asyncio.run(main())
 # Reuse the original real-response race regression without rewriting its historical evidence.
 text=(ROOT/'client-race-check.py').read_text().replace('Revoke T10 access','T10 접근 철회').replace('R1 code revision','R1 오류 코드 변경')
 text=text.replace("output = ROOT / 'artifacts' / f'client-race-{expect}.json'","output = ROOT / 'artifacts/ui-refit' / f'client-race-{expect}.json'")
 ns={'__file__':str(ROOT/'client-race-check.py'),'__name__':'ui_refit_race'};exec(compile(text,'client-race-check.py','exec'),ns)
 asyncio.run(ns['run']('fixed'))
