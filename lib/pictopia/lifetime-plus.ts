/** Server-issued evidence only. Local library counters are never proof of eligibility. */
export interface LifetimeClaims {
  version: 1;
  entitlement: "lifetime_plus";
  installation: string;
  /** Legacy receipt field retained so earned awards remain valid. Not eligibility history. */
  firstPaidAt: number;
  paidUntil?: number | null;
  awardedAt: number | null;
  issuedAt: number;
}
export interface LifetimeReceipt { payload: string; signature: string }
export interface CompletionEvidence {
  eventId: string;
  completedAt: number;
  distinctEligiblePhotos: number;
  remainingPhotos: number;
  fullAccess: boolean;
  scanComplete: boolean;
  scanSkipped: number;
  libraryReliable: boolean;
  /** Server has checked the current subscription and validated the local audit summary. */
  verified: boolean;
}
export function qualifiesForLifetime(paid: { paidAt: number; expiresAt: number } | null, completion: CompletionEvidence, now = Date.now()): boolean {
  return !!paid && Number.isSafeInteger(paid.paidAt) && paid.paidAt > 0 && paid.paidAt <= completion.completedAt &&
    Number.isSafeInteger(paid.expiresAt) && paid.expiresAt > now && paid.expiresAt > completion.completedAt &&
    !!completion.eventId && Number.isSafeInteger(completion.completedAt) && completion.completedAt > 0 && completion.completedAt <= now &&
    now - completion.completedAt <= 300000 &&
    Number.isSafeInteger(completion.distinctEligiblePhotos) && completion.distinctEligiblePhotos >= 10000 &&
    completion.remainingPhotos === 0 && completion.fullAccess && completion.scanComplete &&
    completion.scanSkipped === 0 && completion.libraryReliable && completion.verified;
}
// WeakSet identity prevents a JSON value or saved local flag being mistaken for verified evidence.
const verified = new WeakSet<object>();
export type VerifiedLifetime = Readonly<LifetimeClaims>;
export function isLifetimeAward(value: VerifiedLifetime | null | undefined): boolean {
  return !!value && verified.has(value) && value.awardedAt !== null;
}
export async function verifyLifetimeReceipt(receipt: unknown, installation: string, verify: (payload: string, signature: string) => Promise<boolean>, now = Date.now()): Promise<VerifiedLifetime | null> {
  try {
    const r = receipt as LifetimeReceipt;
    if (!r || typeof r.payload !== "string" || r.payload.length > 2048 || typeof r.signature !== "string" || r.signature.length > 128) return null;
    if (!await verify(r.payload, r.signature)) return null;
    const c = JSON.parse(r.payload) as LifetimeClaims;
    if (c.version !== 1 || c.entitlement !== "lifetime_plus" || c.installation !== installation ||
      !Number.isSafeInteger(c.firstPaidAt) || c.firstPaidAt <= 0 || !Number.isSafeInteger(c.issuedAt) ||
      c.issuedAt < c.firstPaidAt || c.issuedAt > now + 300000 ||
      (c.awardedAt !== null && (!Number.isSafeInteger(c.awardedAt) || c.awardedAt <= c.firstPaidAt || c.awardedAt > c.issuedAt))) return null;
    const result = Object.freeze(c);
    verified.add(result);
    return result;
  } catch { return null; }
}

/** Only signed, recent current-period membership may expose the unearned achievement. */
export function isLifetimeEligible(value: VerifiedLifetime | null | undefined, now = Date.now()): boolean {
  return !!value && verified.has(value) && value.awardedAt === null &&
    Number.isSafeInteger(value.paidUntil) && value.paidUntil! > now &&
    value.issuedAt <= now + 300000 && now - value.issuedAt < 15 * 60000;
}
export function showLifetimeAchievement(value: VerifiedLifetime | null | undefined, now = Date.now()): boolean {
  return isLifetimeAward(value) || isLifetimeEligible(value, now);
}
