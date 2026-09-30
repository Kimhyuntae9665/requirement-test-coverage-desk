"""CPU-only Chrome regression using held real API responses and two reviewers."""
import argparse
import asyncio
import json
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent


async def run(expect):
    server = subprocess.Popen(
        ['node', '--input-type=module', '-e',
         "import {createDesk} from './server.mjs'; const s=createDesk(); "
         "s.listen(0,'127.0.0.1',()=>console.log(s.address().port));"],
        cwd=ROOT, stdout=subprocess.PIPE, text=True)
    try:
        port = int(server.stdout.readline().strip())
        url = f'http://127.0.0.1:{port}'
        evidence = {'browser': 'Google Chrome via Playwright', 'expectation': expect,
                    'modelCalls': 0, 'servicePerformanceMeasured': False, 'races': []}
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
            context = await browser.new_context(viewport={'width': 1440, 'height': 1100})
            # Expose the real module's request function solely in this browser harness.
            async def instrument_client(route):
                response = await route.fetch()
                await route.fulfill(response=response, body=(await response.text()) + '\n globalThis.__regressionRequest=request;\n')
            await context.route('**/app.mjs', instrument_client)
            for attempt in range(3):
                await context.request.post(url + '/api/reset', data={})
                page = await context.new_page()
                captured, release, delivered = asyncio.Event(), asyncio.Event(), asyncio.Event()
                older = {}

                async def hold_state(route):
                    response = await route.fetch()
                    older.update(await response.json())
                    captured.set()
                    await release.wait()
                    await route.fulfill(response=response)
                    delivered.set()

                await page.route('**/api/state', hold_state)
                await page.goto(url, wait_until='domcontentloaded')
                await asyncio.wait_for(captured.wait(), 10)
                assert older['summary']['counts']['accessibleTests'] == 12
                assert any(t['id'] == 'T10' for t in older['data']['tests'])
                await page.get_by_role('button', name='Revoke T10 access', exact=True).click()
                await page.wait_for_function("() => document.querySelector('#stats .stat:nth-child(2) b')?.textContent === '11'")
                assert 'T10' not in await page.locator('#test').inner_text()
                release.set()
                await asyncio.wait_for(delivered.wait(), 10)
                await page.wait_for_timeout(150)
                count = int(await page.locator('#stats .stat').nth(1).locator('b').inner_text())
                restored = 'T10' in await page.locator('#test').inner_text()
                assert restored == (expect == 'vulnerable')
                assert count == (12 if expect == 'vulnerable' else 11)
                evidence['races'].append({'attempt': attempt + 1, 'capturedBeforeRevocation': True,
                                          'deliveredAfterRevocation': True, 'restoredT10': restored,
                                          'accessibleTestsAfterLateResponse': count})
                await page.close()

            await context.request.post(url + '/api/reset', data={})
            page = await context.new_page()
            await page.goto(url)
            await page.wait_for_selector('#matrix tr')
            await page.locator('#propose').click()
            await page.wait_for_selector('#links button')
            old_sources = await page.locator('#links').inner_text()
            assert 'rev 1' in old_sources
            # A second reviewer replaces the source/proposal while the first keeps the old button.
            await context.request.post(url + '/api/mutate', data={'name': 'r1-error-code'})
            replacement = await context.request.post(url + '/api/propose', data={'mode': 'explicit'})
            replacement_state = await replacement.json()
            proposal = next(p for p in replacement_state['proposals'] if p['testId'] == 'T3' and p['requirementId'] == 'R1')
            assert proposal['requirementRevision'] == 2 and proposal['facetIds'] == ['F2']
            async with page.expect_response('**/api/accept') as pending:
                await page.locator('#links button').click()
            response = await pending.value
            result = await response.json()
            expected_status = 200 if expect == 'vulnerable' else 409
            assert response.status == expected_status
            current = await (await context.request.get(url + '/api/state')).json()
            assert current['summary']['counts']['acceptedLinks'] == (1 if expect == 'vulnerable' else 0)
            evidence['twoReviewerAcceptance'] = {'oldRequirementRevision': 1, 'replacementRequirementRevision': 2,
                                                 'replacementFacets': ['F2'], 'oldClickStatus': response.status,
                                                 'replacementAcceptedByOldClick': current['summary']['counts']['acceptedLinks'] == 1}
            if expect == 'fixed':
                assert result['error'] == 'proposal_stale'
                await page.wait_for_function("() => document.querySelector('#toast').textContent.includes('Inspect')")
                assert 'rev 2' in await page.locator('#links').inner_text()
                assert 'ORDER_VOIDED' in await page.locator('#links').inner_text()
                # Refreshed sources require a separate, deliberate acceptance click.
                async with page.expect_response('**/api/accept') as pending:
                    await page.locator('#links button').click()
                assert (await pending.value).status == 200
                evidence['twoReviewerAcceptance']['freshDeliberateClickStatus'] = 200
                # Delay one POST response: later mutation clicks must wait for it.
                await page.locator('#reset').click()
                await page.wait_for_function("() => document.querySelector('#stats .stat:nth-child(2) b').textContent === '12'")
                first_captured, first_release = asyncio.Event(), asyncio.Event()
                order = []

                async def hold_post(route):
                    body = route.request.post_data_json
                    order.append(body.get('name'))
                    if len(order) == 1:
                        first_captured.set()
                        await first_release.wait()
                    response = await route.fetch()
                    await route.fulfill(response=response)

                await page.route('**/api/mutate', hold_post)
                await page.get_by_role('button', name='R1 code revision', exact=True).click()
                await asyncio.wait_for(first_captured.wait(), 10)
                await page.get_by_role('button', name='Revoke T10 access', exact=True).click()
                reads = []
                async def observe_read(route):
                    reads.append('state')
                    await route.continue_()
                await page.route('**/api/state', observe_read)
                later_read = asyncio.create_task(page.evaluate("() => globalThis.__regressionRequest('state')"))
                await page.wait_for_timeout(100)
                assert order == ['r1-error-code'] and reads == []
                before_commit = await (await context.request.get(url + '/api/state')).json()
                assert before_commit['data']['requirements'][0]['revision'] == 1
                assert before_commit['summary']['counts']['accessibleTests'] == 12
                first_release.set()
                await later_read
                await page.wait_for_function("() => document.querySelector('#stats .stat:nth-child(2) b').textContent === '11'")
                assert order == ['r1-error-code', 'revoke-t10'] and reads == ['state']
                assert 'T10' not in await page.locator('#test').inner_text()
                evidence['serializedMutationOrder'] = order
                evidence['laterReadWaitedForBothMutationCommits'] = True
            await context.close()
            await browser.close()
        output = ROOT / 'artifacts' / f'client-race-{expect}.json'
        output.write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps(evidence, indent=2))
    finally:
        server.terminate()
        server.wait(timeout=10)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--expect', choices=['vulnerable', 'fixed'], default='fixed')
    asyncio.run(run(parser.parse_args().expect))
