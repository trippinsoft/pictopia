import { storage, serialize } from "./repository";
import { HOME_TIPS, nextHomeTip, type HomeTipState } from "@/lib/pictopia/home-tips";
const KEY = "homeTip:v1";
export const homeTipStore = {
  next(now = Date.now()): Promise<string> {
    return serialize(async () => {
      const current = nextHomeTip(await storage.getValue<HomeTipState>(KEY), now);
      const next = { ...current, index: (current.index + 1) % HOME_TIPS.length };
      await storage.setValue(KEY, next);
      return HOME_TIPS[next.index];
    });
  },
  today(now = Date.now()): Promise<string> {
    return serialize(async () => {
      const saved = await storage.getValue<HomeTipState>(KEY);
      const next = nextHomeTip(saved, now);
      if (next !== saved) await storage.setValue(KEY, next);
      return HOME_TIPS[next.index];
    });
  },
};
