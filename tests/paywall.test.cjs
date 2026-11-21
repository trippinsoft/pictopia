// The Pictopia+ plan picker: two real store plans, honest savings, trial wording only from the store.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { makeLoader } = require("./loader.cjs");
const P = makeLoader()("lib/pictopia/paywall.ts");

const weekly = { id: "pictopia.pro.weekly", kind: "weekly", price: "$4.99", amount: 4.99, currency: "USD", trialDays: 7 };
const monthly = { id: "pictopia.pro.monthly", kind: "monthly", price: "$9.99", amount: 9.99, currency: "USD" };
const annual = { id: "pictopia.pro.annual", kind: "annual", price: "$39.99", amount: 39.99, currency: "USD" };

test("shows two plans: yearly first, then the trial plan, selecting the trial", () => {
  const plans = P.paywallPlans([monthly, weekly, annual]);
  assert.deepEqual(plans.map(p => p.kind), ["annual", "weekly"]);
  assert.equal(P.defaultPlan(plans).id, weekly.id);
  const noTrial = P.paywallPlans([monthly, { ...weekly, trialDays: undefined }, annual]);
  assert.deepEqual(noTrial.map(p => p.kind), ["annual", "weekly"]);
  assert.equal(P.defaultPlan(noTrial).kind, "annual");
  assert.deepEqual(P.paywallPlans([monthly]).map(p => p.kind), ["monthly"]);
  assert.deepEqual(P.paywallPlans([]), []);
});

test("savings come only from real same-currency prices", () => {
  assert.equal(P.yearlySavings([annual, weekly]), 84);
  assert.equal(P.yearlySavings([annual, monthly]), 66);
  assert.equal(P.yearlySavings([annual, { ...weekly, currency: "EUR" }]), 0);
  assert.equal(P.yearlySavings([{ ...annual, amount: 400 }, weekly]), 0);
  assert.equal(P.yearlySavings([weekly]), 0);
});

test("terms state price, period, trial conversion and renewal; the button says trial only with one", () => {
  assert.equal(P.planTerms(weekly, "ios"), "Free for 7 days, then $4.99 per week. Renews automatically; cancel in your Apple ID settings at least 24 hours before renewal.");
  assert.match(P.planTerms(annual, "android"), /^\$39\.99 per year\. Renews automatically; cancel in Google Play/);
  assert.equal(P.planAction(weekly), "Start my 7-day free trial");
  assert.equal(P.planAction(annual), "Continue");
  assert.equal(P.planAction(undefined), "Continue");
});

test("the paywall has no outdated technical claims and no hardcoded prices", () => {
  const src = ["app/paywall.tsx", "components/pictopia/paywall.tsx", "components/pictopia/onboarding/trial.tsx"].map(f => fs.readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(src, /hash|blurry|best-shot/i);
  assert.doesNotMatch(src, /[$€£]\d/);
});
