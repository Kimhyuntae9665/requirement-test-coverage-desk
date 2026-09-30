"""Capture actual review/failure/stale flows; no model or service test calls."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent

async def main():
    out=ROOT/'artifacts/media';out.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox'])
        ctx=await browser.new_context(viewport={'width':1440,'height':1100},record_video_dir=str(ROOT/'private/video'),record_video_size={'width':1440,'height':1100})
        page=await ctx.new_page();url='http://127.0.0.1:5055'
        await page.goto(url);await page.wait_for_selector('#matrix tr');await page.screenshot(path=str(out/'01-original.png'),full_page=True)
        await page.locator('#propose').click();await page.wait_for_timeout(400)
        await page.locator('#links button').click();await page.wait_for_timeout(300)
        assert 'complete' in await page.locator('#matrix tr').first.inner_text()
        await page.evaluate("fetch('/api/accept',{method:'POST',body:JSON.stringify({requirementId:'R1',testId:'T3'})})")
        await page.reload();await page.wait_for_selector('#matrix tr');assert '1' in await page.locator('#stats .stat').nth(2).inner_text()
        await page.screenshot(path=str(out/'02-accepted.png'),full_page=True)
        await page.get_by_role('button',name='R1 code revision',exact=True).click();await page.wait_for_timeout(350)
        assert 'stale decision' in await page.locator('#matrix tr').first.inner_text()
        await page.screenshot(path=str(out/'03-stale-review.png'),full_page=True)
        await page.locator('#reset').click();await page.locator('#propose').click();await page.locator('#test').select_option('T11');await page.locator('#links button').click();await page.wait_for_timeout(250)
        await page.screenshot(path=str(out/'04-fictional-current.png'),full_page=True)
        await page.get_by_role('button',name='T11 max → 2001 ms',exact=True).click();await page.wait_for_timeout(300)
        assert 'fixture-fail' in await page.locator('#evidence').inner_text()
        await page.screenshot(path=str(out/'05-boundary-failure.png'),full_page=True)
        await page.locator('#reset').click();await page.locator('#propose').click();await page.locator('#test').select_option('T8');await page.wait_for_timeout(250)
        assert 'stale' in await page.locator('#evidence').inner_text();await page.screenshot(path=str(out/'06-old-baseline.png'),full_page=True)
        await page.locator('#test').select_option('T10');await page.locator('#links button').click();await page.get_by_role('button',name='Revoke T10 access',exact=True).click();await page.wait_for_timeout(300)
        assert 'T10' not in await page.locator('#test').inner_text()
        await page.screenshot(path=str(out/'07-access-revoked.png'),full_page=True)
        await page.locator('#invalid').click();await page.wait_for_timeout(250);assert 'invalid-json' in await page.locator('#modelstatus').inner_text()
        await page.screenshot(path=str(out/'08-invalid-json.png'),full_page=True)
        await page.locator('#timeout').click();await page.wait_for_timeout(300);assert 'Injected demo failure' in await page.locator('#modelstatus').inner_text()
        await page.screenshot(path=str(out/'09-timeout-injected.png'),full_page=True)
        await page.locator('#reset').click();await page.wait_for_timeout(600)
        video=page.video;await ctx.close();await video.save_as(str(out/'review-demo.webm'))
        for width in [360,390]:
            mobile=await browser.new_page(viewport={'width':width,'height':950},device_scale_factor=1)
            await mobile.goto(url);await mobile.wait_for_selector('#matrix tr');await mobile.screenshot(path=str(out/f'desk-{width}.png'),full_page=True)
            await mobile.set_content('<body style="margin:0;background:#171f2c"><img style="width:100%;display:block" src="data:image/svg+xml;base64,'+__import__('base64').b64encode((ROOT/'docs/architecture.svg').read_bytes()).decode()+'"></body>')
            await mobile.screenshot(path=str(out/f'diagram-{width}.png'),full_page=True)
            await mobile.close()
        diagram=await browser.new_page(viewport={'width':420,'height':700})
        await diagram.goto((ROOT/'docs/architecture.svg').as_uri());await diagram.screenshot(path=str(ROOT/'docs/architecture.png'))
        await browser.close()
    (ROOT/'artifacts/browser-checks.json').write_text(json.dumps({'actualBrowser':'Playwright Chromium','flows':['zero original','proposal acceptance','repeated acceptance idempotent','requirement revision stale','fictional current run','2001 boundary failure','APP-0 stale','access revoked','injected invalid JSON','injected timeout'],'widths':[360,390],'modelCalledDuringBrowserCapture':False,'actualServicePerformanceMeasured':False},indent=2))

if __name__=='__main__':asyncio.run(main())
