import { createHash } from 'node:crypto';

export function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function refreshSource(item) {
  const { source, accessible, ...content } = item;
  const sourceId = source?.id ?? `synthetic:${item.id}`;
  item.source = { id: sourceId, hash: hash({ sourceId, ...content }) };
  return item;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const facet = (id, text) => ({ id, text });
const requirement = (id, title, text, facets, extra = {}) => refreshSource({ id, revision: 1, status: 'approved', title, text, facets, ...extra });
const assertion = (id, text, kind, anchors = [], extra = {}) => ({ id, text, kind, anchors: anchors.map(([requirementId, facetId]) => ({ requirementId, facetId })), ...extra });
const test = (id, title, precondition, assertions, extra = {}) => refreshSource({ id, revision: 1, accessible: true, title, preconditions: [{ id: `${id}.P1`, kind: precondition, text: ({ cancelled: 'Order is cancelled before requesting a label.', released: 'Order is released before requesting a label.', retry: 'Submit the identical payload and idempotency key twice.', changed: 'Submit a different payload with the original idempotency key.', plant: 'Authenticate as a plant-A operator; plant-B resources exist.', load: 'Local mock service; five concurrent clients, forty successful requests per client.', visual: 'Open the label-request screen.' })[precondition] }], assertions, ...extra });

export function fixtures() {
  const requirements = [
    requirement('R1', 'Cancelled orders', 'A cancelled order returns 409 / ORDER_CANCELLED and creates no new print job.', [facet('F1', '409 with ORDER_CANCELLED'), facet('F2', 'No new print job')], { errorCode: 'ORDER_CANCELLED' }),
    requirement('R2', 'Identical retry', 'The same payload and key return the original receipt and exactly one total matching job.', [facet('F1', 'Original receipt returned'), facet('F2', 'Exactly one total matching job')]),
    requirement('R3', 'Changed payload', 'A changed payload with the same key returns 409 / IDEMPOTENCY_CONFLICT and preserves the original receipt and payload.', [facet('F1', '409 with IDEMPOTENCY_CONFLICT'), facet('F2', 'Original receipt and payload unchanged')], { errorCode: 'IDEMPOTENCY_CONFLICT' }),
    requirement('R4', 'Plant isolation', 'A plant-A operator cannot obtain plant-B data through list, detail, or source/metadata.', [facet('F1', 'List excludes plant-B'), facet('F2', 'Detail denied without restricted fields'), facet('F3', 'Source/metadata denied without restricted fields')]),
    requirement('R5', 'Local mock acknowledgements', 'Under declared local mock load: five clients, forty successful requests each, every acknowledgement duration <= 2000 ms.', [facet('F1', 'Declared load and measured acknowledgement duration')], { performance: { clients: 5, requestsPerClient: 40, operator: '<=', maxMs: 2000, scope: 'local-mock' } }),
    requirement('R6', 'Fast and easy screen', 'The screen should be fast and easy.', [], { status: 'draft', clarification: 'Define a measurable acceptance threshold before verification.' }),
  ];
  const tests = [
    test('T1', 'R1 cancelled order handling', 'released', [assertion('T1.A1', 'Response status equals 201 and a job is created.', 'created', [], { status: 201 })]),
    test('T2', 'Cancelled response', 'cancelled', [assertion('T2.A1', 'Response status equals 409 and error code equals ORDER_CANCELLED.', 'error', [['R1','F1']], { status: 409, code: 'ORDER_CANCELLED' })]),
    test('T3', 'Cancelled response and job count', 'cancelled', [assertion('T3.A1', 'Response status equals 409 and error code equals ORDER_CANCELLED.', 'error', [['R1','F1']], { status: 409, code: 'ORDER_CANCELLED' }), assertion('T3.A2', 'After-job-count equals before-job-count.', 'no-new-job', [['R1','F2']])]),
    test('T4', 'Retry receipt', 'retry', [assertion('T4.A1', 'Second response receipt equals the original receipt.', 'original-receipt', [['R2','F1']])]),
    test('T5', 'Conflict preserves original', 'changed', [assertion('T5.A1', 'Response status equals 409 and error code equals IDEMPOTENCY_CONFLICT.', 'error', [['R3','F1']], { status: 409, code: 'IDEMPOTENCY_CONFLICT' }), assertion('T5.A2', 'Stored original receipt and original payload remain unchanged.', 'original-preserved', [['R3','F2']])]),
    test('T6', 'List plant isolation', 'plant', [assertion('T6.A1', 'Plant-A list contains no plant-B records.', 'list-isolation', [['R4','F1']])]),
    test('T7', 'Configured timeout', 'load', [assertion('T7.A1', 'Configured timeout_ms equals 2000.', 'configuration', [], { timeoutMs: 2000 })]),
    test('T8', 'Measured local mock acknowledgements', 'load', [assertion('T8.A1', 'With five clients and forty successes each, all measured local mock acknowledgement durations are <= 2000 ms.', 'performance', [['R5','F1']], { clients: 5, requestsPerClient: 40, operator: '<=', maxMs: 2000, scope: 'local-mock' })]),
    test('T9', 'Retry receipt and single job', 'retry', [assertion('T9.A1', 'Second response receipt equals the original receipt.', 'original-receipt', [['R2','F1']]), assertion('T9.A2', 'Exactly one total job matches this idempotency key.', 'one-job', [['R2','F2']])]),
    test('T10', 'Known cross-plant detail and source', 'plant', [assertion('T10.A1', 'Known plant-B detail returns 403 with no restricted fields.', 'detail-isolation', [['R4','F2']], { status: 403, noRestrictedFields: true }), assertion('T10.A2', 'Known plant-B source/metadata returns 403 with no restricted fields.', 'source-isolation', [['R4','F3']], { status: 403, noRestrictedFields: true })]),
    test('T11', 'Current local mock acknowledgement fixture', 'load', [assertion('T11.A1', 'With five clients and forty successes each, all measured local mock acknowledgement durations are <= 2000 ms.', 'performance', [['R5','F1']], { clients: 5, requestsPerClient: 40, operator: '<=', maxMs: 2000, scope: 'local-mock' })]),
    test('T12', 'Fast screen colour check', 'visual', [assertion('T12.A1', 'The fast and easy screen uses the expected title and colour.', 'visual')]),
  ];
  const runs = ['T8', 'T11'].map(testId => refreshSource({ id: `RUN-${testId}-1`, testId, testSourceId: tests.find(t => t.id === testId).source.id, testRevision: 1, testHash: tests.find(t => t.id === testId).source.hash, softwareBaseline: testId === 'T8' ? 'APP-0' : 'APP-1', fictional: true, outcome: 'pass', measurements: { scope: 'local-mock', concurrency: 5, successfulRequestsPerClient: [40,40,40,40,40], successfulRequests: 200, maxAcknowledgementMs: 2000 } }));
  return freeze({ baseline: 'APP-1', requirementBaseline: 'REQ-1', requirements, tests, runs });
}
