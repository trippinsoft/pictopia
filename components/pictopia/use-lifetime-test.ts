import { useSyncExternalStore } from "react";
import { lifetimeTestStore } from "@/services/lifetime-testing";
const serverSnapshot = () => null;
export function useLifetimeTest() {
  return useSyncExternalStore(lifetimeTestStore.subscribe, lifetimeTestStore.snapshot, serverSnapshot);
}
