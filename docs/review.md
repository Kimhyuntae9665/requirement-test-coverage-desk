# Independent review

An independent GPT-6 Astra reviewer inspected the finished domain and HTTP/UI implementation. Two material findings were reproduced and fixed:

1. A changed source ID could retain accepted authority. Proposals now bind requirement/test source IDs; source hashes include canonical identity, and runs bind test source identity.
2. A passing test run could be returned as eligible for an unrelated requirement. Requirement-scoped execution now requires a supported definition before reporting run eligibility.

The second review also reproduced archived model output being rebound to current sources, malformed proposal entries crashing evaluation, and artifact-write failure bypassing a retained inference lease after timeout-barrier failure. The evaluator now binds to the original snapshot and verifies its recorded request. Non-object proposals receive a rejection record. An outermost finally holds the lease even when artifact/diagnostic writes fail.

Regression tests reproduce source substitution, test-source/run provenance changes, unrelated run eligibility, replayed source versions, malformed archived entries, shared lock/barrier behavior, and the artifact-write failure path. The original frozen gold was not changed. The reviewer did not edit implementation files or call the model. This is a code review, not safety verification or certification.
