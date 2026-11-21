import { lifetimeTestStore } from "./lifetime-testing";
import { LIFETIME_PLUS_ENABLED } from "@/lib/pictopia/feature-flags";
import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { storage, serialize } from "./repository";
import { rewardCredential } from "./referrals";
import { lifetimeSignature } from "./lifetime-signature";
import { purchaseService } from "./purchases";
import type { LocalCompletionAudit } from "@/lib/pictopia/lifetime-completion";
import { verifyLifetimeReceipt, isLifetimeAward, type LifetimeReceipt, type VerifiedLifetime } from "@/lib/pictopia/lifetime-plus";
const KEY = "lifetimePlusReceipt:v1";
let current: VerifiedLifetime | null = null;
let pending: Promise<void> | undefined;
let lastEvidenceAt = 0;
const listeners = new Set<() => void>();
async function validate(receipt: unknown) {
  const key = process.env.EXPO_PUBLIC_LIFETIME_PLUS_PUBLIC_KEY;
  if (!key) return null;
  const installation = await digestStringAsync(CryptoDigestAlgorithm.SHA256, await rewardCredential());
  return verifyLifetimeReceipt(receipt, installation, (payload, signature) => lifetimeSignature.verify(payload, signature, key));
}
export const lifetimePlusStore = {
  snapshot: () => current,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async load() {
    await storage.init();
    const value = await validate(await storage.getValue<LifetimeReceipt>(KEY));
    if (value) { current = value; listeners.forEach(fn => fn()); }
    return current;
  },
  sync(options?: { restore?: boolean; payment?: boolean; completion?: LocalCompletionAudit }): Promise<void> {
    if (!LIFETIME_PLUS_ENABLED) return Promise.resolve();
    if (lifetimeTestStore.snapshot()) return Promise.resolve();
    // Signing and store credentials must be configured before release.
    if (!process.env.EXPO_PUBLIC_LIFETIME_PLUS_PUBLIC_KEY) return Promise.resolve();
    if (pending) return options?.restore || options?.payment || options?.completion
      ? pending.catch(() => {}).then(() => lifetimePlusStore.sync(options))
      : pending;
    pending = (async () => {
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw Error("Lifetime verification is unavailable in this build.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        // StoreKit's ownership refresh can prompt; reserve it for an explicit Restore.
        const verifyPayment = options?.restore || options?.payment || options?.completion || Date.now() - lastEvidenceAt >= 15 * 60000;
        const evidence = verifyPayment ? await purchaseService.evidence(options?.restore === true) : null;
        if (lifetimeTestStore.snapshot()) return;
        const response = await fetch(`${url}/functions/v1/lifetime-plus`, {
          method: "POST", headers: { apikey: key, "Content-Type": "application/json", "x-installation-token": await rewardCredential() },
          body: JSON.stringify({ evidence, ...(options?.completion ? { completion: options.completion } : {}) }), signal: controller.signal,
        });
        if (!response.ok) throw Error("Couldn’t verify lifetime status. Your saved award is unchanged.");
        if (verifyPayment) lastEvidenceAt = Date.now();
        const receipt: unknown = await response.json();
        if (lifetimeTestStore.snapshot()) return;
        if (receipt === null) {
          await serialize(async () => {
            if (isLifetimeAward(current)) return;
            await storage.setValue(KEY, null);
            current = null;
          });
          listeners.forEach(fn => fn());
          return;
        }
        const value = await validate(receipt);
        if (!value) throw Error("Lifetime verification could not be confirmed.");
        await serialize(async () => {
          if (lifetimeTestStore.snapshot()) return;
          if (isLifetimeAward(current) && !isLifetimeAward(value)) return;
          await storage.setValue(KEY, receipt);
          current = value;
        });
        listeners.forEach(fn => fn());
      } finally { clearTimeout(timer); }
    })().finally(() => { pending = undefined; });
    return pending;
  },
};
