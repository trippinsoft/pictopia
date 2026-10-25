import { Entitlement, Offer } from "@/lib/pictopia/types";
export interface PurchaseService {
  init(listener: (e: Entitlement) => void): Promise<() => void>;
  offers(): Promise<Offer[]>;
  refresh(): Promise<Entitlement>;
  purchase(id: string): Promise<Entitlement>;
  restore(): Promise<Entitlement>;
}
