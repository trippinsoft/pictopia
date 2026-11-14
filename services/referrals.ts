import { randomUUID } from 'expo-crypto';
import { serialize, storage } from './repository';
import { referralCredential } from './referral-credential';
import { REFERRAL_WALLET, emptyWallet, mergeReferralWallet, type ReferralWallet } from '@/lib/pictopia/referral-wallet';
import { rewardEvents } from './reward-events';
const INSTALLATION = 'referralInstallation:v1';
let inFlight: Promise<ReferralWallet> | undefined;
export async function rewardCredential() {
  return serialize(async () => {
    await storage.init();
    let id = await storage.getValue<string>(INSTALLATION);
    if (!id) { id = randomUUID(); await storage.setValue(INSTALLATION, id); }
    let token = await referralCredential.read(id);
    if (!token) {
      const wallet = await storage.getValue<ReferralWallet>(REFERRAL_WALLET);
      if (wallet?.code) throw Error('This installation’s referral credential is unavailable. Saved credits still work offline.');
      token = (randomUUID() + randomUUID()).replace(/-/g, '');
      await referralCredential.write(id, token);
    }
    return token;
  });
}
async function request(operation: 'sync' | 'redeem', code?: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw Error('Referral rewards are not configured for this build.');
  const token = await rewardCredential();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${url}/functions/v1/referrals`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', 'x-installation-token': token },
      body: JSON.stringify({ operation, code }), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || data?.error) {
      if (operation === 'redeem' && response.status === 400) {
        await serialize(async () => {
          const wallet = (await storage.getValue<ReferralWallet>(REFERRAL_WALLET)) ?? emptyWallet();
          if (wallet.pendingCode === code) await storage.setValue(REFERRAL_WALLET, { ...wallet, pendingCode: undefined });
        });
      }
      throw Error(typeof data?.error === 'string' ? data.error : 'Couldn’t connect to rewards. Try again online.');
    }
    const wallet = await serialize(async () => {
      const next = mergeReferralWallet(await storage.getValue<ReferralWallet>(REFERRAL_WALLET), data, Date.now());
      await storage.setValue(REFERRAL_WALLET, next);
      return next;
    });
    rewardEvents.notify();
    return wallet;
  } catch (error) {
    if (error instanceof TypeError || (error as Error)?.name === 'AbortError') throw Error('Connect to the internet to sync or redeem. Saved credits are still available offline.');
    throw error;
  } finally { clearTimeout(timer); }
}
export const referralStore = {
  async load() {
    await storage.init();
    const wallet = (await storage.getValue<ReferralWallet>(REFERRAL_WALLET)) ?? emptyWallet();
    return { ...wallet, code: /^[A-F0-9]{7}$/.test(wallet.code ?? '') ? wallet.code : undefined };
  },
  sync() {
    if (!inFlight) inFlight = (async () => {
      const wallet = await this.load();
      // Recover a lost response without making users re-enter the code.
      return request(wallet.pendingCode ? 'redeem' : 'sync', wallet.pendingCode);
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  },
  async redeem(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!/^[A-F0-9]{7}$/.test(code)) throw Error('Enter a valid 7-character referral code.');
    // Let a background sync finish before recording the durable redemption intent.
    await inFlight?.catch(() => {});
    await serialize(async () => {
      const wallet = await this.load();
      if (wallet.redeemed) throw Error('This installation has already redeemed a referral code.');
      if (wallet.code === code) throw Error('You can’t redeem your own code.');
      if (wallet.pendingCode && wallet.pendingCode !== code) throw Error('Reconnect to finish your previous redemption first.');
      await storage.setValue(REFERRAL_WALLET, { ...wallet, pendingCode: code });
    });
    try { return await request('redeem', code); }
    catch (error) {
      // Retain uncertain network/server failures for idempotent recovery. Definitive invalid
      // codes can be corrected immediately; never replace an uncertain in-flight redemption.
      const message = (error as Error).message;
      if (/wasn’t found|own code|already redeemed|valid 7-character/.test(message)) {
        await serialize(async () => {
          const wallet = await this.load();
          if (wallet.pendingCode === code) await storage.setValue(REFERRAL_WALLET, { ...wallet, pendingCode: undefined });
        });
      }
      throw error;
    }
  },
};
