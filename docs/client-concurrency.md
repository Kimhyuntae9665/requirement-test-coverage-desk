# Client ordering and inspected acceptance

The original client applied API responses in delivery order. A GET snapshot
captured before T10 revocation could arrive after the revocation response and
restore T10 sources and the count of 12 accessible tests. The original acceptance
endpoint also resolved only requirement/test IDs: another reviewer could revise
R1 and re-propose T3, then an old revision-1 button would accept the revision-2
replacement without inspecting its changed facets.

The client now assigns a generation to every request intent. Only the current
generation can render a response or change the error message. POST operations run
in click order, and reads wait for pending writes before fetching. A superseded
read is skipped; successful writes still execute even when their UI response is
superseded. This preserves ordered user actions without letting old snapshots
restore revoked sources.

Each proposal response includes a SHA256 review token over the entire proposal,
including its facets, exact spans and source versions, together with the current
proposal generation. Every re-proposal or reset changes the generation. The
Accept button sends this token and the inspected source IDs, hashes, revisions
and requirement baseline. The server requires an exact match and validates the
proposal against current sources. A mismatch returns HTTP 409 `proposal_stale`
with a filtered current snapshot. The client displays refreshed sources and asks
the reviewer to inspect them and click again; it never retries acceptance.

Run `npm test` for automated ordering and two-reviewer HTTP regressions. On an
existing Linux Chrome/Playwright environment, run
`python3 client-race-check.py --expect fixed`. The browser harness starts its own
CPU-only server, holds real API responses, repeats the late GET race three times,
tests an old acceptance button against a second reviewer's replacement, and holds
a POST before its server commit while a later GET waits for queued writes. It
exposes the module's request function only inside its intercepted browser test
response. Runtime application files contain no test hook.

`artifacts/client-race-vulnerable.json` records actual Chrome behavior at baseline
commit `2db22cba88872c82d9c17b06ca5d93d74fe69cd8`.
`artifacts/client-race-fixed.json` records the corrected behavior. Browser output
contains synthetic IDs, counts and status codes only. These checks perform no
model inference, service performance measurement or external ALM operation.
