// On This Day must hold every eligible photo from the exact calendar date, across all years,
// regardless of earlier reviews, other adventures or a pending (not yet verified) deletion.
// These tests run the real SQLite storage adapter, the adventure store and the audit.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { makeLoader } = require("./loader.cjs");
const { DatabaseSync, media, platform, boot } = require("./native-harness.cjs");
const load = makeLoader();
const { curate } = load("lib/pictopia/curation.ts");
const { auditOnThisDay, formatAudit } = load("lib/pictopia/on-this-day-audit.ts");
const { onThisDayPool } = load("lib/pictopia/photo-eligibility.ts");
const { localDate, addDays } = load("lib/pictopia/daily.ts");
const { dateKeys } = load("lib/pictopia/logic.ts");

const photo = (id, y, m, d, h = 12, min = 0, extra = {}) => {
  const created = new Date(y, m - 1, d, h, min).getTime();
  return media(id, { created, modified: created, ...dateKeys(created), ...extra });
};
const today = localDate(Date.now());
const [TY, TM, TD] = today.split("-").map(Number);
const DAY = today.slice(5);
const ctx = (extra = {}) => ({ seed: 1, explored: new Set(), now: Date.now(), ...extra });

/** A library whose "today" date (in earlier years) exercises every rule at once. */
function library() {
  return [
    photo("plain2019", TY - 7, TM, TD),
    photo("lateNight", TY - 5, TM, TD, 23, 45),                 // 23:45 local still counts
    photo("nextDay", TY - 2, TM, TD + 1, 0, 10),                // 00:10 the next day does not
    photo("dayBefore", TY - 3, TM, TD - 1, 23, 50),             // 23:50 the day before does not
    photo("live", TY - 4, TM, TD, 9, 0, { livePhoto: true, name: "IMG_0042.HEIC" }),
    photo("cloud", TY - 6, TM, TD, 10, 0, { name: "IMG_0043.HEIC" }), // iCloud-only: lookup has no local file
    photo("seen", TY - 8, TM, TD, 8, 0, { firstSeenAt: Date.now() - 86400000, decision: "keep" }),
    photo("queued", TY - 9, TM, TD, 7, 0, { decision: "delete", firstSeenAt: Date.now() - 86400000 }),
    photo("gone", TY - 10, TM, TD, 6, 0, { decision: "delete", deletedAt: Date.now() - 3600000, firstSeenAt: Date.now() - 86400000 }),
    photo("inFlight", TY - 11, TM, TD, 5, 0),
    photo("video", TY - 1, TM, TD, 15, 0, { type: "video", duration: 12 }),
    photo("shot", TY - 1, TM, TD, 16, 0, { screenshot: true }),
    photo("thisYear", TY, TM, TD, 11, 0),                       // today itself counts too: the whole date
  ];
}
const EXPECTED = ["inFlight", "queued", "seen", "plain2019", "cloud", "lateNight", "live", "thisYear", "video", "shot"].filter((id) => id !== "inFlight");

async function fixture(rows = library()) {
  const db = new DatabaseSync(":memory:");
  const p = platform({ library: rows.filter((m) => m.id !== "gone").map((m) => m.id), records: rows });
  const app = await boot(db, p);
  await app.storage.put(rows, { deletionAttempt: { ids: ["inFlight"], started: Date.now() } });
  const service = makeLoader({ ...p.mocks, "./repository": app, "./media": { mediaService: app.mediaService } });
  const { adventureStore, adventureSessionKey } = service("services/adventures.ts");
  return { db, rows, app, p, adventureStore, adventureSessionKey, explore: service("services/explore.ts"), audit: service("services/on-this-day-audit.ts").onThisDayAuditService };
}

test("the pure rule keeps seen, other-adventure and discarded-but-not-deleted photos; includes videos; drops verified deletions and in-flight deletions", () => {
  const rows = library();
  const kept = onThisDayPool(rows.filter((m) => m.day === DAY), new Set(["inFlight"])).map((m) => m.id).sort();
  assert.deepEqual(kept, [...EXPECTED].sort());
  const a = curate({ kind: "day", source: `day:${DAY}`, pool: rows }, { ...ctx(), exclude: new Set(["inFlight"]) });
  assert.deepEqual([...a.ids].sort(), [...EXPECTED].sort(), "curate applies the same rule and matches only the exact date");
  assert.deepEqual(a.ids, [...EXPECTED].sort((x, y) => rows.find((m) => m.id === x).created - rows.find((m) => m.id === y).created), "oldest year first");
  assert.equal(a.diagnostics.pool, EXPECTED.length, "the diagnostics pool is the whole date");
});

test("exact dates only: February 29 matches only February 29, and every year on the date is included", () => {
  const rows = [
    photo("leap2016", 2016, 2, 29), photo("leap2020", 2020, 2, 29, 23, 59), photo("feb28", 2021, 2, 28), photo("mar1", 2021, 3, 1, 0, 1),
    photo("a2010", 2010, 7, 4), photo("a2015", 2015, 7, 4), photo("a2023", 2023, 7, 4), photo("july3", 2023, 7, 3, 23, 59), photo("july5", 2023, 7, 5, 0, 0),
  ];
  assert.deepEqual(curate({ kind: "day", source: "day:02-29", pool: rows }, ctx()).ids, ["leap2016", "leap2020"]);
  assert.deepEqual(curate({ kind: "day", source: "day:07-04", pool: rows }, ctx()).ids, ["a2010", "a2015", "a2023"]);
  assert.equal(curate({ kind: "day", source: "day:02-30", pool: rows }, ctx()), undefined);
});

test("capture instants become calendar days in the phone's local time zone, never UTC", () => {
  // 13:30 UTC on 12 June: still 12 June in Los Angeles, already 13 June in Auckland.
  const instant = Date.UTC(2021, 5, 12, 13, 30);
  const script = `const { makeLoader } = require(${JSON.stringify(path.join(__dirname, "loader.cjs"))}); const { dateKeys } = makeLoader()("lib/pictopia/logic.ts"); process.stdout.write(dateKeys(${instant}).day);`;
  const run = (tz) => execFileSync(process.execPath, ["-e", script], { cwd: path.join(__dirname, ".."), env: { ...process.env, TZ: tz } }).toString();
  assert.equal(run("America/Los_Angeles"), "06-12");
  assert.equal(run("Pacific/Auckland"), "06-13");
  assert.equal(run("UTC"), "06-12");
});

test("the store's On This Day holds every eligible photo on today's date, in the saved review, and the date list counts the same set", async () => {
  const f = await fixture();
  const a = await f.adventureStore.choose({ kind: "day" }, 3, false);
  assert.ok(a, "today's date is free to open");
  assert.equal(a.count, EXPECTED.length);
  const session = await f.explore.exploreStoreFor(f.adventureSessionKey(a.id)).load();
  assert.deepEqual([...session.ids].sort(), [...EXPECTED].sort());
  assert.equal(session.records.queued?.queued, true, "a discarded photo waiting for deletion stays in, marked");
  assert.equal(session.records.seen?.queued, undefined);
  const history = await f.adventureStore.history();
  assert.equal(history[0].date, today);
  assert.equal(history[0].count, EXPECTED.length, "the list count is the review count");
  assert.equal((await f.adventureStore.choices()).dayCount, EXPECTED.length);
  // Reopening returns the same whole set; no segment ever shrinks it.
  const again = await f.adventureStore.choose({ kind: "day" }, 4, false);
  assert.equal(again.id, a.id);
  // The free allowance pauses reviewing; it never changes the set.
  assert.equal(a.count, EXPECTED.length);
});

test("library changes: a photo the sync no longer sees leaves, returns when seen again, and a new photo on the date joins the count", async () => {
  const f = await fixture();
  const before = (await f.adventureStore.history())[0].count;
  const epoch = Date.now();
  const rows = f.rows.filter((m) => m.id !== "live");
  await f.app.repository.ingest(rows, epoch);
  await f.app.repository.reconcile(epoch);
  assert.equal((await f.adventureStore.history())[0].count, before - 1, "inactive rows leave");
  let audit = await f.audit.run(today, { census: false });
  assert.deepEqual(audit.steps.find((s) => s.key === "inactive").items.map((i) => i.id), ["live"]);
  assert.ok(audit.reconciles);
  await f.app.repository.ingest([...f.rows, photo("newcomer", TY - 12, TM, TD, 14, 0)], epoch + 1);
  await f.app.repository.reconcile(epoch + 1);
  assert.equal((await f.adventureStore.history())[0].count, before + 1, "a returning photo and a new one both count");
  audit = await f.audit.run(today, { census: false });
  assert.ok(audit.eligible.some((i) => i.id === "newcomer"));
  const live = await f.app.storage.get("live");
  assert.ok(live.active && live.livePhoto, "re-ingesting keeps the Live Photo flag and reactivates the row");
});

test("the audit accounts for every indexed row on the date, names each filter, and flags lookups that fail", async () => {
  const f = await fixture();
  f.p.lookupErrors.add("cloud");
  const audit = await f.audit.run(today, { census: false });
  assert.equal(audit.onDate.total, library().filter((m) => m.day === DAY).length);
  const counts = Object.fromEntries(audit.steps.map((s) => [s.key, s.items.map((i) => i.id)]));
  assert.deepEqual(counts.verifiedDeleted, ["gone"]);
  assert.equal(counts.video, undefined);
  assert.ok(audit.eligible.some(i => i.id === "video"));
  assert.equal(counts.screenshot, undefined);
  assert.ok(audit.eligible.some(i => i.id === "shot"));
  assert.deepEqual(counts.inFlightDeletion, ["inFlight"]);
  assert.deepEqual(counts.inactive, []);
  assert.deepEqual(counts.notVisible, ["cloud"], "a failed lookup is reported, with the photo named");
  assert.equal(audit.eligible.length, EXPECTED.length);
  assert.equal(audit.displayable, EXPECTED.length - 1);
  assert.ok(audit.reconciles);
  assert.equal(audit.review, undefined);
  const report = formatAudit(audit);
  assert.match(report, /Eligible: \d+/);
  assert.match(report, /cloud · .* · photo · the library lookup failed/);
  assert.doesNotMatch(report, /ph:\/\//, "no media URIs");
  // With a saved review the audit compares it to today's eligibility.
  const a = await f.adventureStore.choose({ kind: "day" }, 5, false);
  const withReview = await f.audit.run(today, { census: false, lookup: false });
  assert.equal(withReview.review.count, a.count);
  assert.equal(withReview.review.missing.length, 0, "a failed metadata lookup must not silently remove indexed cloud media from On This Day");
  assert.ok(withReview.review.count === EXPECTED.length);
});

test("a live-library census separates assets beyond the enumeration's reach from an incomplete index and time-zone drift", () => {
  const rows = library().filter((m) => m.day === DAY);
  const at = (y) => new Date(y, TM - 1, TD, 12).getTime();
  const census = {
    scope: "full", total: 1000, undated: 3,
    onDate: [
      ...rows.filter((m) => m.active && !m.deletedAt).map((m) => ({ id: m.id, created: m.created, type: m.type, hidden: false, burstFrame: false, source: "library", screenshot: !!m.screenshot, livePhoto: !!m.livePhoto })),
      { id: "hidden1", created: at(2012), type: "photo", hidden: true, burstFrame: false, source: "library", screenshot: false, livePhoto: false },
      { id: "burst2", created: at(2013), type: "photo", hidden: false, burstFrame: true, source: "library", screenshot: false, livePhoto: false },
      { id: "shared3", created: at(2014), type: "photo", hidden: false, burstFrame: false, source: "shared", screenshot: false, livePhoto: false },
      { id: "unsynced4", created: at(2011), type: "photo", hidden: false, burstFrame: false, source: "library", screenshot: false, livePhoto: false },
      { id: "drift5", created: new Date(TY - 2, TM - 1, TD + 1, 0, 5).getTime(), type: "photo", hidden: false, burstFrame: false, source: "library", screenshot: false, livePhoto: false },
    ],
  };
  const audit = auditOnThisDay({ day: DAY, date: today, rows, blocked: new Set(["inFlight"]), census, indexed: { active: 900, photos: 800, videos: 100, undated: 0 } });
  assert.deepEqual(audit.census.beyondReach.map((i) => `${i.id}:${i.note}`), ["hidden1:hidden", "burst2:burst frame", "shared3:iCloud shared album"]);
  assert.deepEqual(audit.census.notIndexed.map((i) => i.id), ["unsynced4", "drift5"]);
  assert.deepEqual(audit.census.dayMismatch.map((i) => i.id), ["drift5"]);
  assert.deepEqual(audit.census.notInLibrary.map((i) => i.id), [], "gone is verified deleted, so it is not expected live");
  assert.ok(audit.reconciles);
  assert.match(formatAudit(audit), /Beyond Pictopia's reach: 3/);
});

test("yesterday's date is a separate whole set and past dates stay behind Pictopia+", async () => {
  const f = await fixture([...library(), photo("yesterday2020", TY - 6, TM, TD - 1, 12, 0)]);
  const yesterday = addDays(today, -1);
  await assert.rejects(() => f.adventureStore.choose({ kind: "day", date: yesterday }, 1, false), /Pictopia\+/);
  const a = await f.adventureStore.choose({ kind: "day", date: yesterday }, 1, true);
  const ids = (await f.explore.exploreStoreFor(f.adventureSessionKey(a.id)).load()).ids;
  assert.ok(ids.includes("yesterday2020") && ids.includes("dayBefore"));
  assert.ok(!ids.includes("plain2019"));
  assert.equal((await f.adventureStore.history())[1].count, ids.length);
});


test("a date with 721 items is never truncated, and upgrading a capped snapshot retains its marks, undo and saved place", async () => {
  const rows = Array.from({length:721}, (_,i) => photo(`large-${i}`, TY-2, TM, TD, 12, 0, {type: i % 3 === 0 ? "video" : "photo", screenshot: i % 3 !== 0 && i % 7 === 0}));
  const f = await fixture(rows);
  const a = await f.adventureStore.choose({kind:"day"}, 2, false);
  const key = f.adventureSessionKey(a.id);
  const store = f.explore.exploreStoreFor(key);
  let session = await store.load();
  assert.equal(a.count, 721);
  assert.equal(session.ids.length, 721);
  assert.equal((await f.adventureStore.history())[0].count, 721);
  assert.equal((await f.audit.run(today, {census:false})).review.missing.length, 0);
  // Simulate an older release's capped session with a real queued item and undo evidence.
  session = {...session, ids:session.ids.slice(0,200), activeId:session.ids[17], revision:10,
    records:{[session.ids[0]]:{encountered:true,discarded:true,queued:true,changedAt:1}},
    history:[{id:session.ids[0],direction:"left"}]};
  await f.app.storage.put([{...rows.find(m=>m.id===session.ids[0]),decision:"delete"}],{[key]:session});
  const again = await f.adventureStore.choose({kind:"day"}, 3, false);
  const repaired = await store.load();
  assert.equal(again.id,a.id);
  assert.equal(repaired.ids.length,721);
  assert.equal(repaired.activeId,session.activeId);
  assert.deepEqual(repaired.history,session.history);
  assert.equal(repaired.records[session.ids[0]].encountered,true);
  assert.equal(repaired.revision,11);
  const repeat = await f.adventureStore.choose({kind:"day"}, 4, false);
  assert.equal(repeat.count,721);
  assert.equal((await store.load()).revision,11,"upgrade is idempotent");
});

test("whole-library census reconciles types, subsets, undated media and enumerable assets missing from the index", async () => {
  const rows = [...library(), media("undated",{created:0,month:"unknown",day:"unknown"})];
  const f = await fixture(rows);
  const inventory = rows.filter(m=>!m.deletedAt).map(m=>({...m,hidden:false,burstFrame:false,source:"library",screenshot:!!m.screenshot,livePhoto:!!m.livePhoto,enumerable:true}));
  inventory.push({id:"not-indexed",created:0,type:"video",hidden:false,burstFrame:false,source:"library",screenshot:false,livePhoto:false,enumerable:true});
  inventory.push({id:"hidden",created:0,type:"photo",hidden:true,burstFrame:false,source:"library",screenshot:false,livePhoto:false,enumerable:false});
  f.app.mediaService.census = async()=>({scope:"full",total:inventory.length,undated:3,onDate:inventory.filter(m=>m.day===DAY),inventory});
  await f.app.storage.setValue("libraryIndex:v1",{status:"complete",discovered:rows.length,uniqueIndexed:rows.length});
  const a = await f.audit.run(today,{lookup:false});
  assert.equal(a.library.native.total,a.library.native.photos+a.library.native.videos+a.library.native.other);
  assert.equal(a.library.indexed.total,a.library.indexed.photos+a.library.indexed.videos);
  assert.equal(a.library.indexed.screenshots,1);
  assert.equal(a.library.indexed.livePhotos,1,"Live Photo counts as one photo, not an additional video");
  assert.equal(a.library.indexed.undated,1);
  assert.deepEqual(a.library.native.notIndexed.map(m=>m.id),["not-indexed"]);
  assert.deepEqual(a.library.native.outsideEnumeration.map(m=>m.id),["hidden"]);
  assert.deepEqual(a.library.native.excluded,{hidden:1});
  assert.match(formatAudit(a),/Enumerable but missing from index: 1/);
  assert.match(formatAudit(a),/Cloud residency is unknown/);
});


test("live date matching distinguishes a stale indexed calendar key from an unindexed asset",()=>{
  const m=photo("drift",TY-3,TM,TD);
  const stored={...m,day:"01-01"};
  const live={...m,hidden:false,burstFrame:false,source:"library",enumerable:true,screenshot:false,livePhoto:false};
  const a=auditOnThisDay({day:DAY,rows:[],indexRows:[stored],blocked:new Set(),indexed:{active:1,photos:1,videos:0,undated:0},census:{scope:"full",total:1,undated:0,onDate:[live]}});
  assert.equal(a.census.notIndexed.length,0);
  assert.equal(a.census.dayMismatch.length,1);
  assert.match(a.census.dayMismatch[0].note,/stored day is 01-01/);
});

test('an older date snapshot appends newly eligible screenshots without losing its position, marks, Restore or Undo',async()=>{
  const f=await fixture();
  const a=await f.adventureStore.choose({kind:'day'},5,false);
  const key=f.adventureSessionKey(a.id),store=f.explore.exploreStoreFor(key);
  const original=await store.load();
  const older={...original,ids:original.ids.filter(id=>id!=='shot'),activeId:'plain2019'};
  await f.app.storage.setValue(key,older);
  let current=await store.load();
  await store.change({type:'discard',id:'plain2019',revision:current.revision,direction:'left'});
  const before=await store.load();
  await f.adventureStore.open(a.id,false);
  const updated=await store.load();
  assert.deepEqual(updated.ids,[...before.ids,'shot']);
  assert.equal(updated.activeId,before.activeId);
  assert.deepEqual(updated.history,before.history);
  assert.deepEqual(updated.records,before.records);
  assert.equal((await f.adventureStore.history())[0].count,updated.ids.length);
  assert.equal((await f.audit.run(today,{census:false})).review.missing.length,0);
  await f.adventureStore.open(a.id,false);
  assert.deepEqual((await store.load()).ids,updated.ids,'append is idempotent');
  await store.change({type:'undo'});
  assert.notEqual((await f.app.storage.get('plain2019')).decision,'delete');
  current=await store.load();
  await store.change({type:'page',id:current.activeId,revision:current.revision,toId:'shot',availableIds:current.ids});
  current=await store.load();
  await store.change({type:'discard',id:'shot',revision:current.revision,direction:'right'});
  assert.equal((await f.app.storage.get('shot')).decision,'delete');
  await store.change({type:'restore',id:'shot'});
  assert.notEqual((await f.app.storage.get('shot')).decision,'delete');
  assert.ok((await store.load()).ids.includes('shot'));
  assert.deepEqual(f.p.requests,[],'no OS deletion occurs from mark/Restore/Undo');
});

test('screenshots share the global 100-item allowance with photos and videos; Pro continues',async()=>{
  const f=await fixture();
  const svc=makeLoader({...f.p.mocks,'./repository':f.app})('services/daily.ts').allowanceStore;
  const at=Date.now();
  for(let i=0;i<100;i++) assert.equal((await svc.present(i===0?'shot':`reviewed-${i}`,false,at)).allowed,true);
  assert.equal((await svc.present('next-shot',false,at)).allowed,false);
  assert.equal((await svc.present('shot',false,at)).allowed,true,'revisiting an already charged screenshot is allowed');
  assert.equal((await svc.present('next-shot',true,at)).allowed,true);
  assert.equal(await svc.limit(),100);
});


test('marked screenshots remain eligible on the exact date and retain their reversible queue state',async()=>{
  const extra=photo('pendingShot',TY-2,TM,TD,17,0,{screenshot:true,decision:'delete',firstSeenAt:Date.now()-1});
  const f=await fixture([...library(),extra]);
  const a=await f.adventureStore.choose({kind:'day'},7,false);
  const s=await f.explore.exploreStoreFor(f.adventureSessionKey(a.id)).load();
  assert.equal(a.count,EXPECTED.length+1);
  assert.equal(s.ids.length,a.count);
  assert.ok(s.ids.includes('pendingShot'));
  assert.equal(s.records.pendingShot.queued,true);
  assert.ok((await f.adventureStore.history())[0].count===s.ids.length);
  assert.deepEqual(f.p.requests,[]);
});
