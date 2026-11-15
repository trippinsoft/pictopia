import type { LookalikePrint } from "@/lib/pictopia/lookalikes";
/** Prints for Duplicate Hunt from each photo's small on-device preview. Never reads or
 * downloads originals. Photos whose preview can't be read are simply missing from the result. */
export interface LookalikePrints {
  /** False on installed builds made before Duplicate Hunt's preview reader existed. */
  available: boolean;
  prints(ids: string[]): Promise<Record<string, LookalikePrint>>;
}
