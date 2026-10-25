import { Analyzer } from "./analysis.types";
import { storage } from "./storage";
import { pixelAnalysis } from "@/lib/pictopia/logic";
export const analyzer: Analyzer = {
  available: true,
  async analyze(m) {
    const blob = await storage.getValue<Blob>(`file:${m.id}`);
    if (!blob) throw Error("Selected file unavailable");
    let hash: string | undefined;
    if (blob.size <= 64 * 1024 * 1024) {
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      hash = Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("");
    }
    if (m.type === "video") return { hash, size: blob.size };
    const bitmap = await globalThis.createImageBitmap(blob);
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw Error("Image analysis is unavailable in this browser.");
    }
    ctx.drawImage(bitmap, 0, 0, 32, 32);
    bitmap.close();
    const data = ctx.getImageData(0, 0, 32, 32).data;
    await new Promise((r) => setTimeout(r, 0));
    return { hash, size: blob.size, ...pixelAnalysis(data, 32, 32) };
  },
};
