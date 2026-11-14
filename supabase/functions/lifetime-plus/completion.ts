/** Local consistency summaries are accepted by product policy, not attestation. */
export function validCompletion(value: unknown, now = Date.now()): value is {
  checkedAt: number; distinctEligiblePhotos: number; remainingPhotos: number;
} {
  const c = value as Record<string, unknown> | null;
  return !!c && c.version === 1 && c.verified === false && c.ready === true && c.reason === 'candidate' &&
    Number.isSafeInteger(c.checkedAt) && Number(c.checkedAt) > 0 && Number(c.checkedAt) <= now && now - Number(c.checkedAt) <= 300000 &&
    Number.isSafeInteger(c.distinctEligiblePhotos) && Number(c.distinctEligiblePhotos) >= 10000 && c.remainingPhotos === 0;
}
