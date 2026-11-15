import { LOOKALIKE_SIDE, lookalikePrint, luminance, type LookalikePrint } from "@/lib/pictopia/lookalikes";
import type { LookalikePrints } from "./lookalike-prints.types";
import { storage } from "./storage";

/** The browser preview prints the photos the user selected, from their stored files. */
export const lookalikePrints: LookalikePrints = {
  available: true,
  async prints(ids) {
    const out: Record<string, LookalikePrint> = {};
    const canvas = globalThis.document?.createElement("canvas");
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return out;
    canvas.width = LOOKALIKE_SIDE;
    canvas.height = LOOKALIKE_SIDE;
    for (const id of ids) {
      try {
        const blob = await storage.getValue<Blob>(`file:${id}`);
        if (!blob) continue;
        let bitmap: ImageBitmap;
        try { bitmap = await globalThis.createImageBitmap(blob, { resizeWidth: 64, resizeHeight: 64, resizeQuality: "medium" }); }
        catch { bitmap = await globalThis.createImageBitmap(blob); }
        ctx.clearRect(0, 0, LOOKALIKE_SIDE, LOOKALIKE_SIDE);
        ctx.drawImage(bitmap, 0, 0, LOOKALIKE_SIDE, LOOKALIKE_SIDE);
        bitmap.close();
        out[id] = lookalikePrint(luminance(ctx.getImageData(0, 0, LOOKALIKE_SIDE, LOOKALIKE_SIDE).data));
      } catch { /* Unreadable file: left out, tried again next time. */ }
    }
    return out;
  },
};
