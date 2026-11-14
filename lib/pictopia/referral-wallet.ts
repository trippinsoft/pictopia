import { currentAllowance, type Allowance } from './daily';
export const REFERRAL_WALLET = 'referralWallet:v1';
export interface ReferralWallet {
  version: 1;
  code?: string;
  earned: number;
  spent: number;
  redeemed: boolean;
  /** Durable intent: a lost redemption response can be recovered safely on the next sync. */
  pendingCode?: string;
  syncedAt?: number;
}
export const emptyWallet = (): ReferralWallet => ({ version: 1, earned: 0, spent: 0, redeemed: false });
export const walletCredits = (wallet: ReferralWallet) => Math.max(0, wallet.earned - wallet.spent);
/** Credits are local to this installation. No media IDs or consumption data go to Supabase. */
export function walletAllowance(saved: Allowance | undefined, savedWallet: ReferralWallet | undefined, limit: number, now: number) {
  let state = currentAllowance(saved, now);
  let wallet = savedWallet ?? emptyWallet();
  const banked = (state.referralCounted ?? []).filter(id => state.counted.includes(id));
  // Refund banked reviews if Undo or streak restoration has opened daily slots.
  const needed = Math.min(banked.length, Math.max(0, state.counted.length - limit));
  if (needed < banked.length) wallet = { ...wallet, spent: Math.max(0, wallet.spent - (banked.length - needed)) };
  state = { ...state, referralCounted: banked.slice(0, needed) };
  const dailyLeft = Math.max(0, limit - (state.counted.length - needed));
  const credits = walletCredits(wallet);
  return { state, wallet, dailyLeft, credits, left: dailyLeft + credits, limit, counted: state.counted };
}
export function chargeReview(saved: Allowance | undefined, savedWallet: ReferralWallet | undefined, id: string, limit: number, pro: boolean, now: number) {
  let result = walletAllowance(saved, savedWallet, limit, now);
  if (pro || result.counted.includes(id)) return { ...result, allowed: true };
  if (result.left <= 0) return { ...result, allowed: false };
  const referral = result.dailyLeft <= 0;
  const state = { ...result.state, counted: [...result.counted, id], referralCounted: referral ? [...(result.state.referralCounted ?? []), id] : result.state.referralCounted };
  const wallet = referral ? { ...result.wallet, spent: result.wallet.spent + 1 } : result.wallet;
  result = walletAllowance(state, wallet, limit, now);
  return { ...result, allowed: true };
}
export function refundReview(saved: Allowance | undefined, savedWallet: ReferralWallet | undefined, id: string, limit: number, now: number) {
  const result = walletAllowance(saved, savedWallet, limit, now);
  if (!result.counted.includes(id)) return { ...result, refunded: false };
  const banked = result.state.referralCounted ?? [];
  const wallet = banked.includes(id) ? { ...result.wallet, spent: Math.max(0, result.wallet.spent - 1) } : result.wallet;
  return { ...walletAllowance({ ...result.state, counted: result.counted.filter(x => x !== id), referralCounted: banked.filter(x => x !== id) }, wallet, limit, now), refunded: true };
}
export function mergeReferralWallet(wallet: ReferralWallet | undefined, result: { code: string; earned: number; redeemed: boolean }, now: number): ReferralWallet {
  if (!/^[A-F0-9]{7}$/.test(result.code) || !Number.isSafeInteger(result.earned) || result.earned < 0 || typeof result.redeemed !== 'boolean') throw Error('Invalid rewards response. Try again.');
  const current = wallet ?? emptyWallet();
  // Invalid cached codes are not identities; recover from the authenticated server.
  if (/^[A-F0-9]{7}$/.test(current.code ?? '') && current.code !== result.code) throw Error('This rewards response belongs to another installation.');
  return { ...current, code: result.code, earned: Math.max(current.earned, result.earned), redeemed: current.redeemed || result.redeemed, pendingCode: result.redeemed ? undefined : current.pendingCode, syncedAt: now };
}
