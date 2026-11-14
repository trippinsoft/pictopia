import { requireOptionalNativeModule } from "expo-modules-core";
import type { LifetimeSignature } from "./lifetime-signature.types";
const native = requireOptionalNativeModule<{ verifyLifetimeSignature?(payload: string, signature: string, publicKey: string): Promise<boolean> }>("PictopiaAnalysis");
export const lifetimeSignature: LifetimeSignature = {
  async verify(payload, signature, publicKey) {
    try { return await native?.verifyLifetimeSignature?.(payload, signature, publicKey) === true; }
    catch { return false; }
  },
};
