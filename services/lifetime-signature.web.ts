import type { LifetimeSignature } from "./lifetime-signature.types";
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const lifetimeSignature: LifetimeSignature = {
  async verify(payload, signature, publicKey) {
    try {
      const key = await crypto.subtle.importKey("spki", decode(publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decode(signature), new TextEncoder().encode(payload));
    } catch { return false; }
  },
};
