import { LIFETIME_TEST_TOOLS } from "./entitlement";
import { createLifetimeTestStore } from "@/lib/pictopia/lifetime-testing";
export const lifetimeTestStore = createLifetimeTestStore(LIFETIME_TEST_TOOLS);
