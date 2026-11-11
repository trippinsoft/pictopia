// Onboarding facts: real per-year totals for the reveal, and trial terms only from the store.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeLoader } = require("./loader.cjs");
const O = makeLoader()("lib/pictopia/onboarding.ts");
const S = makeLoader()("lib/pictopia/store-entitlement.ts");

test("the reveal counts photos per year, oldest first, leaving out undated items and videos", () => {
  const months = [
    { key: "2024-03", count: 12, photos: 10, reviewed: 0 },
    { key: "2019-07", count: 5, photos: 5, reviewed: 0 },
    { key: "2024-11", count: 3, photos: 2, reviewed: 0 },
    { key: "unknown", count: 40, photos: 40, reviewed: 0 },
    { key: "2021-01", count: 4, photos: 0, reviewed: 0 },
  ];
  assert.deepEqual(O.yearTotals(months), [{ year: 2019, photos: 5 }, { year: 2024, photos: 12 }]);
  assert.equal(O.revealInterval(1), 900);
  assert.equal(O.revealInterval(30), 380);
});

test("free trials come only from the store's offer terms", () => {
  assert.equal(S.freeTrialDays([{ paymentMode: "free-trial", period: { unit: "week", value: 1 }, periodCount: 1 }]), 7);
  assert.equal(S.freeTrialDays([{ paymentMode: "free-trial", period: { unit: "day", value: 3 } }]), 3);
  assert.equal(S.freeTrialDays([{ paymentMode: "pay-as-you-go", period: { unit: "month", value: 1 } }]), undefined);
  assert.equal(S.freeTrialDays(undefined), undefined);
  assert.equal(S.offerKind("pictopia.pro.weekly"), "weekly");
});

test("onboarding leads with a trial offer, else yearly; the reminder lands two days before the charge", () => {
  const weekly = { id: "w", kind: "weekly", price: "$4.99", amount: 4.99, currency: "USD", trialDays: 7 };
  const annual = { id: "a", kind: "annual", price: "$29.99", amount: 29.99, currency: "USD" };
  assert.equal(O.leadOffer([annual, weekly]).id, "w");
  assert.equal(O.leadOffer([annual, { ...weekly, trialDays: undefined }]).id, "a");
  const now = new Date(2026, 10, 10, 9).getTime();
  const t = O.trialTimeline(7, now);
  assert.equal(t.reminderDay, 5);
  assert.equal(Math.round((t.chargeAt - t.reminderAt) / 86400000), 2);
});
