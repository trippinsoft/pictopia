const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const fresh = () => makeLoader()('lib/pictopia/review-trace.ts');

test('diagnostics stay bounded and snapshots cannot mutate the recorder', () => {
  const trace = fresh();
  for (let i = 0; i < 1500; i++) trace.reviewTrace('event', { value: i });
  const snapshot = trace.reviewTraceSnapshot();
  assert.equal(snapshot.marker, 'review-trace-1');
  assert.equal(snapshot.events.length, trace.REVIEW_TRACE_LIMIT);
  assert.equal(snapshot.events[0].sequence, 301);
  snapshot.events[0].data.value = 'changed';
  assert.equal(trace.reviewTraceSnapshot().events[0].data.value, 300);
});

test('native batches keep capture order, receipt sequence, and aliases without exporting library identifiers', () => {
  const trace = fresh();
  const asset = 'ph://private-library-identifier';
  const alias = trace.tracePhoto(asset);
  trace.reviewTrace('card.begin', { photo: alias, accepted: false }, 20);
  const sample = trace.gestureSample('start', { handlerTag: 4, state: 4, translationX: 15, velocityX: 700 }, 1200, false, true, false);
  sample.at = 10;
  trace.traceNativeGesture(asset, [sample]);
  const result = trace.reviewTraceSnapshot();
  assert.equal(result.events[0].event, 'pan.start');
  assert.equal(result.events[0].sequence, 2, 'arrival sequence remains available');
  assert.equal(result.events[0].data.photo, alias);
  assert.equal(result.events[0].data.offset, 1200);
  assert.equal(JSON.stringify(result).includes(asset), false);
  assert.equal(trace.tracePhoto(asset), alias);
  assert.equal(trace.tracePhoto(undefined), null);
});
