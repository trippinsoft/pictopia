import type { StoreEvidence } from "./store-evidence.types";
import { Entitlement, Offer } from "@/lib/pictopia/types";
export interface PurchaseService {
  init(listener: (e: Entitlement) => void): Promise<() => void>;
  offers(): Promise<Offer[]>;
  refresh(): Promise<Entitlement>;
  evidence(refreshOwnership?: boolean): Promise<StoreEvidence | null>;
  purchase(id: string): Promise<Entitlement>;
  restore(): Promise<Entitlement>;
}
