import { storage, serialize } from "./repository";
import { HOME_TIPS, nextHomeTip, drawHomeTip, type HomeTipState } from "@/lib/pictopia/home-tips";
const KEY = "homeTip:v1";
export const homeTipStore = {
  next(now = Date.now()): Promise<string> {
    return serialize(async () => {
      const saved = await storage.getValue<HomeTipState>(KEY);
      const current = nextHomeTip(saved, now);
      const next = current === saved ? drawHomeTip(current, current.day) : current;
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
