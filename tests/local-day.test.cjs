const test = require('node:test');
const assert = require('node:assert/strict');
const { hooks } = require('./hook-harness.cjs');

test('Explore local date refreshes at midnight, on foreground and browser visibility, then cleans up', () => {
  const RealDate = global.Date, realSet = global.setTimeout, realClear = global.clearTimeout;
  let now = new RealDate(2026,10,18,23,59).getTime(), timer, appListener, pageListener;
  let removedApp = false, removedPage = false, cleared = false;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  global.setTimeout = (fn, delay) => { timer = {fn,delay}; return timer; };
  global.clearTimeout = () => { cleared = true; };
  const previousDocument = global.document;
  global.document = {visibilityState:'visible',addEventListener:(_,fn)=>{pageListener=fn},removeEventListener:()=>{removedPage=true}};
  const h = hooks('components/pictopia/use-local-day.ts','useLocalDay',{
    'react-native':{Platform:{OS:'web'},AppState:{addEventListener:(_,fn)=>{appListener=fn;return {remove(){removedApp=true}}}}},
  });
  try {
    assert.equal(h.render(),'2026-11-18');
    assert.equal(timer.delay,60100);
    now = new RealDate(2026,10,19,0,0,1).getTime();timer.fn();
    assert.equal(h.render(),'2026-11-19');
    now = new RealDate(2026,10,20,9).getTime();appListener('active');
    assert.equal(h.render(),'2026-11-20');
    now = new RealDate(2026,10,21,9).getTime();pageListener();
    assert.equal(h.render(),'2026-11-21');
    h.unmount();assert.ok(removedApp && removedPage && cleared);
  } finally {
    global.Date=RealDate;global.setTimeout=realSet;global.clearTimeout=realClear;
    if(previousDocument === undefined) delete global.document; else global.document=previousDocument;
  }
});
