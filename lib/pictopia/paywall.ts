/** The Pictopia+ plan picker's words and rules, pure so they're testable and easy to revise.
 * Every price, period and trial comes from the store's `Offer`s; nothing here invents one. */
import { leadOffer, periodLabel } from "./onboarding";
import type { Offer } from "./types";

/** The one marketing message. "5×" is a proposed claim, not a measured benchmark yet:
 * change it here and every upgrade screen follows. */
export const PAYWALL_COPY = {
  headline: "Choose your plan",
  speedup: "5×",
  /** Rendered as one sentence with consistent size and color. */
  value: { before: "Clean up your photo library up to ", emphasis: "5×\u00a0faster", after: " with Pictopia+." },
} as const;
/** The short form for entry points such as the Settings Pictopia+ card. */
export const PAYWALL_TEASER = `Clean up to ${PAYWALL_COPY.speedup} faster`;
export const PAYWALL_VALUE = `${PAYWALL_COPY.value.before}${PAYWALL_COPY.value.emphasis}${PAYWALL_COPY.value.after}`;

const NAMES: Record<Offer["kind"], string> = { weekly: "Weekly", monthly: "Monthly", annual: "Yearly", lifetime: "Lifetime" };
export const planName = (kind: Offer["kind"]) => NAMES[kind];

/** At most two plans, like the leaders: the yearly plan first, then the plan with a free trial
 * (else weekly, else monthly). Whatever the store returns, nothing is made up. */
export function paywallPlans(offers: readonly Offer[]): Offer[] {
  const annual = offers.find(o => o.kind === "annual");
  const rest = offers.filter(o => o !== annual && o.kind !== "lifetime");
  const order: Offer["kind"][] = ["weekly", "monthly"];
  const other = rest.find(o => o.trialDays) ?? [...rest].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
  const plans = [annual, other].filter((o): o is Offer => !!o);
  return plans.length ? plans : offers.slice(0, 2);
}
/** The plan selected when the picker opens: the free trial if there is one, else yearly. */
export function defaultPlan(plans: readonly Offer[]) {
  return leadOffer(plans);
}

const PER_YEAR: Partial<Record<Offer["kind"], number>> = { weekly: 52, monthly: 12 };
/** Whole-percent saving of the yearly plan over paying the other plan for a year, from real
 * store amounts in the same currency; 0 when it can't be worked out honestly. */
export function yearlySavings(plans: readonly Offer[]) {
  const annual = plans.find(o => o.kind === "annual");
  const other = plans.find(o => o.kind !== "annual" && PER_YEAR[o.kind]);
  if (!annual || !other || annual.currency !== other.currency || !(other.amount > 0) || !(annual.amount > 0)) return 0;
  const saving = Math.floor((1 - annual.amount / (other.amount * PER_YEAR[other.kind]!)) * 100);
  return saving > 0 && saving < 100 ? saving : 0;
}

export type StorePlatform = "ios" | "android" | "web";
const MANAGE: Record<StorePlatform, string> = { ios: "your Apple ID settings", android: "Google Play", web: "your store account" };
/** The required renewal terms for the selected plan: price, period, trial conversion and how
 * to cancel, in one short line. */
export function planTerms(offer: Offer, platform: StorePlatform) {
  const period = periodLabel(offer.kind);
  if (!period) return `${offer.price}, paid once.`;
  const price = `${offer.price} per ${period}`;
  const start = offer.trialDays ? `Free for ${offer.trialDays} days, then ${price}.` : `${price}.`;
  return `${start} Renews automatically; cancel in ${MANAGE[platform]} at least 24 hours before renewal.`;
}
/** The main button: trial wording only when the selected plan really has one. */
export function planAction(offer: Offer | undefined) {
  return offer?.trialDays ? `Start my ${offer.trialDays}-day free trial` : "Continue";
}
