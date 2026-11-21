import type { StoreEvidence } from "./store-evidence.types";
import { Entitlement, Offer } from "@/lib/pictopia/types";
export interface PurchaseService {
  supportsTrialReminders?: boolean;
  init(listener: (e: Entitlement) => void): Promise<() => void>;
  offers(): Promise<Offer[]>;
  refresh(): Promise<Entitlement>;
  evidence(refreshOwnership?: boolean): Promise<StoreEvidence | null>;
  purchase(id: string, options?: { remindBeforeTrialEnds?: boolean }): Promise<Entitlement>;
  restore(): Promise<Entitlement>;
}
