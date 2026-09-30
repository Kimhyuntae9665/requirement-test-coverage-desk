# Requirement / Test Coverage Desk · P05

<img src="docs/architecture.png" alt="Sources feed optional Qwen proposals and explicit rules; validated proposals go to a reviewer and facet matrix" width="420">

[Editable SVG](docs/architecture.svg) · [Glyph and media provenance](docs/asset-provenance.md)

A QA engineer reviews requirement facets against exact test assertions, accepts semantic coverage, and sees missing, stale or conflicting evidence. The native table uses one row per facet and separate columns for definition support, reviewer acceptance and compatible run evidence. Original requirement details and test-source navigation support keyboard focus. A requirement title appearing in a test never establishes coverage. A passing old run never verifies the current application baseline.

This is an original **synthetic label-request service** fixture. There is no factory printing, vehicle-safety verification, Codebeamer/ALM integration, autonomous test execution, or certification. The native browser desk uses Node's standard library; twelve definitions need no embedding or vector database.

![Actual browser stale-review flow](artifacts/media/03-stale-review.png)

[Watch the actual browser demo (MP4)](artifacts/media/review-demo.mp4) · [WebM](artifacts/media/review-demo.webm) · [Browser checks](artifacts/browser-checks.json)

## Try the desk

```sh
npm test
npm start
# http://127.0.0.1:5055
```

Node 18+; no npm install or paid service is required. Choose **Propose explicit links**, inspect the requirement text, test precondition and full assertion spans, then accept a link. **Recorded Qwen proposals** loads actual archived model suggestions without calling a model. Review decisions are held in one in-memory demo workspace; reset restores the frozen original fixture. See the [runbook](docs/runbook.md) for optional evaluation, local browser recording and production limitations.

## Three different kinds of evidence

| Evidence | Contents | What it establishes |
| --- | --- | --- |
| Test definitions | Preconditions and assertions, immutable source IDs, revisions and SHA256 hashes | Eligible definition facets only after reviewer acceptance |
| Fictional run fixtures | Only T8 and T11 have fictional results and declared local mock measurements | Baseline/version/timing eligibility of fixture data, never actual measured service performance |
| Executed repository tests | Node engine/HTTP/evaluator regressions and Python mocked lease checks | Actual checks of this implementation's logic, not execution of T1–T12 against a manufacturing service |

The current software baseline is **APP-1**, the requirement baseline **REQ-1**. R1–R5 are approved revision 1. R6 is draft, with no measurable acceptance threshold; the result is **clarify**, not an invented SLO.

## Frozen original fixture

| Definition | Supported facets | Execution fixture |
| --- | --- | --- |
| T1 · title mentions R1, released order asserts 201/job created | None | Unavailable |
| T2 · cancelled order, 409 / ORDER_CANCELLED | R1 F1 · partial | Unavailable |
| T3 · cancelled error and unchanged job count | R1 F1 + F2 | Unavailable |
| T4 · identical retry, original receipt only | R2 F1 · partial | Unavailable |
| T5 · changed payload, conflict and original receipt/payload preserved | R3 F1 + F2 | Unavailable |
| T6 · plant-A list excludes plant-B | R4 F1 · partial | Unavailable |
| T7 · configured timeout equals 2000, no timing | None | Unavailable |
| T8 · five clients × forty successful requests, each acknowledgement ≤ 2000ms | R5 F1 | **Fictional APP-0 · stale** |
| T9 · identical retry receipt and exactly one matching total job | R2 F1 + F2 | Unavailable |
| T10 · known plant-B detail and source each 403/no restricted fields | R4 F2 + F3 · partial | Unavailable |
| T11 · correct R5 definition, declared current measurements | R5 F1 | **Fictional APP-1 · eligible fixture pass** |
| T12 · title/colour with “fast and easy” words | None; R6 needs clarification | Unavailable |

R1 requires 409/ORDER_CANCELLED **and** no new print job. R2 requires the original receipt **and** exactly one total matching job. R3 requires 409/IDEMPOTENCY_CONFLICT **and** preservation of the original receipt/payload. R4 requires list, detail and source/metadata isolation. T6 + T10 can jointly cover R4's definition, but absent runs remain unavailable. Unlisted pairs are unsupported, not automatically contradictory.

T11's numbers are **fictional**: concurrency 5, successes `[40,40,40,40,40]` (200 total), maximum acknowledgement 2000ms. Configuration values are never measurements. No performance measurement was collected by this project.

## Review and mutation behavior

Every proposed link binds the captured requirement/test source IDs and hashes, revisions, requirement baseline, facet IDs and exact complete assertion spans. For example, T3.A1 uses `[0:65]`, not a title match. The human accepts only the stated facets; a proposed or stale link contributes zero current authority.

| Change | Result |
| --- | --- |
| Revise R1's error code | Old accepted review becomes stale; old code assertion cannot cover new F1 |
| Remove T3 assertions, leave its title | Both facets disappear and prior review becomes stale |
| Change T11 maximum to 2001ms | Fails the ≤ 2000 boundary; accepted definition remains distinct |
| Change R5 to < 2000ms | 2000 fails the stricter boundary; weaker old definition/review also requires revision |
| Change test revision or run software baseline | Blocks current execution eligibility |
| Revoke T10 access | Removes its details, count hints, coverage and cached review authority |
| Invalid model JSON / bounded timeout | Explicit failure state; CPU review remains available |

The UI provides labeled injected JSON/timeout failures for recovery demonstrations. These are separate from the real model-attempt results.

## Actual bounded Qwen comparison

The original [gold](gold.json), fixture and protocol were committed **before prompting**. Gold SHA256: `b56742bb33f4be640fd2d28e4a9578bc25b96a708ac86b37068182526fdae2fa`. Runtime and model requests never read gold. **0 development/tuning calls; 12 evaluation attempts**, one per definition, all completed with parseable JSON. No failed attempt was removed or retried.

| Method · facet-link scoring against 13 original gold links | True positive | False positive | False negative |
| --- | ---: | ---: | ---: |
| Explicit-link rule baseline | 13 | 0 | 0 |
| Raw Qwen proposals | 13 | 9 | 0 |
| Qwen after source/semantic guards | 8 | 0 | 5 |

The raw model overclaimed partial tests (T2, T4, T6, T10), configuration-only T7, title-driven T1 and vague T12. Guards reject an entire mixed valid/unsupported proposal, which deliberately loses five otherwise valid partial facets. This result does **not** show Qwen outperforming the baseline. No model link was automatically or manually accepted as part of evaluation.

Model: existing local Ollama **qwen3:4b**, RTX 4060 8GB. Limits: 4096 context, 512 output tokens, temperature 0, seed 42, thinking disabled, 60s HTTP bound, concurrency 1. Observed client latency: 1.959–3.807s per call, mean 2.782s; total 33.383s. These are model-call timings, not R5 service acknowledgement measurements. No new weights or paid APIs were used.

[Evaluation report](artifacts/model-evaluation.json) · [Unmodified attempt records](artifacts/model-attempts) · [Prompt inputs](artifacts/model-input.json) · [Source snapshot](artifacts/source-snapshot.json)

The archived run snapshot was reconstructed from its pre-inference source commit and verified against **all 12 recorded request payloads** during independent-review fixes; it is labeled as reconstructed, not falsely claimed as a pre-created manifest. Future runs capture the manifest before inference. Re-scoring did not rerun or tune Qwen. Archived suggestions retain those old source versions and cannot be rebound to edited current definitions.

## Validation and review

**21 Node tests and 6 Python transport tests pass.** CPU checks cover the original mapping, partial/union semantics, exact spans, source substitution, revision staleness, unrelated run isolation, timing boundaries, access revocation, malformed archived outputs and replayed source versions. Python tests mock HTTP; they check shared busy/blocked behavior, durable timeout barriers, symlink rejection, retained flock after marker failure, and retention even when artifact writes fail. No GPU call occurs in CI.

An [independent GPT-6 Astra review](docs/review.md) found and drove fixes to source identity, unrelated run eligibility, archived source binding, malformed proposal handling and lease retention. The final review confirmed all reported blockers resolved. Actual [browser evidence](artifacts/media) covers repeated acceptance, stale review, failed timing fixture, stale APP-0 execution, access revocation, removed assertions, recorded proposals, and injected failure states. [Published README checks](artifacts/published-checks.json) verify successful live GitHub image loading at 360px, 390px and 1440px (natural 420 × 700, displayed 294px, 324px and 420px respectively). Matrix columns remain scrollable on narrow screens.

## Enterprise context

[Source chronology and limits](docs/enterprise-context.md) distinguishes PTC's December 2024 development/beta plan, Microsoft's May 2025 Volkswagen story, Codebeamer 3.1's August 2025 private preview, and Codebeamer 3.2/AI 1.0's December 2025 release announcements. The 20–40% figure in Microsoft's story concerns general Codebeamer customer workflows, with no disclosed accuracy/population; it is not a measured Volkswagen AI result. This fixture is our own original material and uses no Volkswagen/private architecture or data.
