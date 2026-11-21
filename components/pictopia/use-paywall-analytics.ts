import { useEffect, useRef } from "react";
import { trackSubscriptionAnalytics } from "@/services/analytics";
import { offerProperties, paywallEntry } from "@/lib/pictopia/subscription-analytics";
import type { Offer } from "@/lib/pictopia/types";

export function usePaywallAnalytics(entry: unknown, premium: boolean, loaded: boolean, offers: readonly Offer[], selected?: Offer, selectionVisible = true) {
  const viewed = useRef(false);
  const previousSelection = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!loaded || viewed.current) return;
    viewed.current = true;
    const known = offers.filter(o => o.trialEligible !== undefined);
    trackSubscriptionAnalytics("paywall_viewed", {
      entry_point: paywallEntry(entry), premium_access: premium,
      trial_eligibility: offers.some(o => o.trialEligible === true) ? true : known.length === offers.length && known.length > 0 ? false : "unknown",
    });
  }, [entry, premium, loaded, offers]);
  useEffect(() => {
    if (!loaded || !selectionVisible || !selected || previousSelection.current === selected.id) return;
    trackSubscriptionAnalytics("subscription_selected", {
      ...offerProperties(selected), selection_source: "default",
    });
    previousSelection.current = selected.id;
  }, [loaded, selected, selectionVisible]);
  return (id: string) => {
    const offer = offers.find(o => o.id === id);
    if (!offer || previousSelection.current === id) return;
    trackSubscriptionAnalytics("subscription_selected", { ...offerProperties(offer), selection_source: "user" });
    previousSelection.current = id;
  };
}
