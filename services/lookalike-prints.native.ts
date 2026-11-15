import { requireOptionalNativeModule } from "expo-modules-core";
import type { LookalikePrint } from "@/lib/pictopia/lookalikes";
import type { LookalikePrints } from "./lookalike-prints.types";
const native = requireOptionalNativeModule<{
  lookalikePrints?(ids: string[]): Promise<({ id: string } & LookalikePrint)[]>;
}>("PictopiaAnalysis");

/** iOS reads PhotoKit's local 64 px preview and Android MediaStore's thumbnail, on a
 * background queue, with no network access; the print itself matches `lookalikePrint`. */
export const lookalikePrints: LookalikePrints = {
  available: !!native?.lookalikePrints,
  async prints(ids) {
    const out: Record<string, LookalikePrint> = {};
    if (!native?.lookalikePrints || !ids.length) return out;
    for (const row of await native.lookalikePrints(ids))
      if (row?.id && typeof row.print === "string" && row.print.length === 64)
        out[row.id] = { print: row.print, sharpness: Number(row.sharpness) || 0, exposure: Number(row.exposure) || 0 };
    return out;
  },
};
