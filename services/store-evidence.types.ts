/** Sensitive native store evidence; send only to our verifier, never log or store in plain JSON. */
export type StoreEvidence =
  | { platform: "ios"; appJws?: string; transactions: string[] }
  | { platform: "android"; tokens: string[] };
