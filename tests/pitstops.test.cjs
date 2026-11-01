const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const { media } = require("./native-harness.cjs");
const games = makeLoader()("lib/pictopia/pitstops.ts");
const photo = (id, year, month = 1, day = 10, extra = {}) => media(id, { created: new Date(year, month - 1, day, 12).getTime(), month: `${year}-${String(month).padStart(2, "0")}`, ...extra });

test("date games use real timestamps and always offer four distinct years including old photos", () => {
  const rows = [photo("old", 1972), photo("new", 2025), photo("invalid", 2020, 1, 10, { created: NaN }), photo("future", 2099)];
  const rounds = games.guessRounds(rows, 21, new Date(2026, 9, 30).getTime());
  assert.equal(rounds.length, 2);
  for (const round of rounds) {
    assert.equal(round.options.length, 4);
    assert.equal(new Set(round.options).size, 4);
    assert.ok(round.options.includes(round.answer));
    assert.ok(round.options.every(y => y <= 2026));
    assert.equal(round.answer, new Date(rows.find(m => m.id === round.id).created).getFullYear());
  }
});

test("date games reject invalid, deleted, queued, and unavailable photos", () => {
  const rows = [photo("a", 2019), photo("b", 2020), photo("gone", 2021, 1, 10, { active: false }), photo("queued", 2022, 1, 10, { decision: "delete" }), photo("deleted", 2023, 1, 10, { deletedAt: 1 }), photo("video", 2024, 1, 10, { type: "video" })];
  assert.deepEqual(games.playable(rows, new Set(["b"])).map(m => m.id), ["a"]);
  assert.ok(games.guessRounds(rows, 9).every(r => ["a", "b"].includes(r.id)));
  assert.equal(games.orderRounds(rows, 9).length, 1);
});

test("ordering works within a year and never claims an ordering for near-simultaneous photos", () => {
  assert.equal(games.unavailable("whichFirst", { photos: 20, years: 1, captureDates: true }), undefined);
  const rows = Array.from({ length: 24 }, (_, i) => photo(String(i), 2020, i % 12 + 1, i < 12 ? 3 : 20));
  const rounds = games.orderRounds(rows, 1);
  assert.equal(rounds.length, 10);
  assert.equal(new Set(rounds.flatMap(r => r.ids)).size, 20);
  for (const r of rounds) {
    const [a, b] = r.ids.map(id => rows.find(m => m.id === id));
    assert.ok(Math.abs(a.created - b.created) >= games.WHICH_FIRST_MIN_GAP);
    assert.equal(r.answer, a.created < b.created ? a.id : b.id);
  }
  assert.equal(games.orderRounds([photo("near1", 2020), photo("near2", 2020, 1, 11)], 1).length, 0);
});

test("missing locations and browser modified dates are never presented as reliable answers", () => {
  const native = { photos: 50, years: 3, captureDates: true };
  assert.match(games.unavailable("whereWasThis", native), /locations/);
  assert.match(games.unavailable("guessYear", { ...native, captureDates: false }), /capture dates/);
  assert.match(games.unavailable("whichFirst", { ...native, captureDates: false }), /capture dates/);
  assert.equal(games.unavailable("memoryMatch", { ...native, captureDates: false }), undefined);
  assert.match(games.unavailable("memoryMatch", { ...native, photos: 3 }), /4 photos/);
});

test("Memory Match has six real pairs and rapid/repeated taps cannot inflate moves or matches", () => {
  const rows = Array.from({ length: 8 }, (_, i) => photo(`photo#${i}`, 2020));
  const deck = games.memoryDeck(rows, 21, 6);
  assert.equal(deck.length, 12);
  assert.equal(new Set(deck).size, 12);
  const ids = [...new Set(deck.map(games.cardPhoto))];
  assert.equal(ids.length, 6);
  let state = games.initialMatch();
  const a = `${ids[0]}#a`, b = `${ids[0]}#b`, wrong = `${ids[1]}#a`;
  state = games.flipCard(state, a, deck);
  assert.equal(games.flipCard(state, a, deck), state);
  assert.equal(games.flipCard(state, "unknown", deck), state);
  state = games.flipCard(state, wrong, deck);
  assert.equal(state.moves, 1);
  assert.equal(games.flipCard(state, b, deck), state, "third tap waits for dismissal");
  state = { ...state, open: [] };
  for (const id of ids) {
    state = games.flipCard(state, `${id}#a`, deck);
    state = games.flipCard(state, `${id}#b`, deck);
  }
  assert.equal(state.matched.length, 12);
  assert.equal(state.moves, 7);
  assert.equal(games.flipCard(state, a, deck), state, "matched cards never count twice");
});


test("Memory Match can use six real photos from just one month", async () => {
  const rows = Array.from({ length: 6 }, (_, i) => photo(String(i), 2020));
  const load = makeLoader({
    "react-native": { Platform: { OS: "web" } },
    "./repository": { storage: { months: async () => [{ key: "2020-01", count: 6, photos: 6 }], query: async () => rows } },
    "./explore": { deletionBlocked: async () => new Set(), visibleIds: async ids => ids },
  });
  const { pitStopStore } = load("services/pitstops.ts");
  const sample = await pitStopStore.sample("memoryMatch", 21, 6);
  assert.equal(sample.length, 6);
  assert.equal(new Set(sample.map(m => m.id)).size, 6);
  assert.deepEqual(rows, sample.slice().sort((a,b) => a.id.localeCompare(b.id)));
});
