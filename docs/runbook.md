# Local run and evidence

Node 18+ is sufficient for the review desk and CPU tests. There are no npm dependencies.

```sh
npm test
npm start
# open http://127.0.0.1:5055
```

The desk binds localhost. Each server process has one in-memory synthetic workspace and a fixed demo reviewer identity. Reset discards its reviews and mutations. It is not a production authorization server, identity provider, tenant system, durable audit ledger, or ALM connector. The access scenario removes T10 at the server projection and invalidates cached authority. Deployment beyond localhost requires real authentication, scoped persistence, audit retention and access enforcement.

Explicit assertion anchors generate CPU proposals. Recorded Qwen proposals load the checked-in original evaluation artifact and are revalidated against current sources; loading them never starts inference. Clicking Accept records a human action only after source and semantic rule checks. All changes are tied to the requirement baseline, requirement/test revisions, immutable source IDs and SHA256 hashes, plus exact full assertion spans. Definitions and test run fixtures are separate records.

## Optional model evaluation

The committed traces already document the single original evaluation. Do not overwrite them. To conduct a new evaluation, use a separate owned output directory and label its phase; retain prior artifacts. The current runner deliberately refuses to overwrite an existing attempt.

```sh
node evaluate.mjs --prepare
python3 model_client.py
node evaluate.mjs
```

Use only an already installed local Ollama `qwen3:4b`. No model download or paid API is invoked. The Python client takes a nonblocking exclusive POSIX lease at `~/.cache/ax-lab/runtime/inference.lock`; every cooperating project must use the same path, or the same absolute `AX_LAB_INFERENCE_LOCK` override. Its parent and file must be regular/private/user-owned, with symlinks rejected. The runner checks the persistent `.blocked` marker while holding the lease. It fails closed on busy or blocked state.

A 60-second HTTP timeout does not prove server cancellation. The client writes and fsyncs the shared `.blocked` marker before releasing its lease; if marker persistence fails, it remains alive retaining the lease. Verify completion of the exact owned request before manual recovery. Do not retry, remove another project's barrier, stop unrelated work, or infer completion from a loaded model. No automatic recovery is implemented.

The model has no tools and cannot run tests, execute jobs, contact factory systems, or accept semantic coverage. Model requests omit the gold and structured anchors. Rules bind each proposal to the captured source snapshot and reject wrong IDs, versions, access or spans. The evaluator reads gold after inference to score facet links; runtime desk and model client never import evaluator gold.

## Reproduce browser evidence

`capture.py` uses an existing Google Chrome through Python Playwright and records actual UI actions. It includes zero coverage, repeated acceptance, revised source staleness, fictional current execution, 2001ms failure, APP-0 staleness, access revocation, and explicitly injected model errors. The injected errors test UI recovery and are not claimed as actual Qwen failures. No autonomous service test execution occurs.
