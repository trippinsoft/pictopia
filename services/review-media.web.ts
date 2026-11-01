import { storage } from "./storage";
import type { ReviewMedia } from "./review-media.types";
export const reviewMedia: ReviewMedia = {
  async favorite() { return { supported: false, reason: "Device-library favorites are available in the native app. Browser files have no native favorite status." }; },
  async setFavorite() { throw Error("Browser files have no native favorite status."); },
  async share(media) {
    const blob = await storage.getValue<Blob>(`file:${media.id}`);
    if (!blob) throw Error("This file is unavailable. Choose it again from Home.");
    const file = new File([blob], media.name || "photo", { type: blob.type });
    if (!globalThis.navigator.canShare?.({ files: [file] }) || !globalThis.navigator.share) throw Error("File sharing isn’t supported by this browser. Use the native app to share.");
    try { await globalThis.navigator.share({ files: [file] }); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) throw Error("Sharing couldn’t open. Try again, or share from the native app."); }
  },
  cancelShare() {},
  async thumbnail(media) {
    const blob = await storage.getValue<Blob>(`file:${media.id}`);
    if (!blob) throw Error("Thumbnail unavailable");
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = 160; canvas.height = 160;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Thumbnail unavailable");
    const source = URL.createObjectURL(blob);
    try {
      if (media.type === "video") {
        const video = globalThis.document.createElement("video");
        try {
          video.muted = true; video.preload = "auto";
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error("Thumbnail unavailable")), 8000);
            video.onloadeddata = () => { clearTimeout(timeout); resolve(); };
            video.onerror = () => { clearTimeout(timeout); reject(Error("Thumbnail unavailable")); };
            video.src = source;
          });
          draw(context, video, video.videoWidth, video.videoHeight);
        } finally { video.pause(); video.removeAttribute("src"); video.load(); }
      } else {
        const bitmap = await globalThis.createImageBitmap(blob, { resizeWidth: 160, resizeQuality: "medium" });
        try { draw(context, bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); }
      }
      const small = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error("Thumbnail unavailable")), "image/jpeg", 0.78));
      return URL.createObjectURL(small);
    } finally { URL.revokeObjectURL(source); canvas.width = 0; canvas.height = 0; }
  },
  releaseThumbnail(uri) { URL.revokeObjectURL(uri); },
};
function draw(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number) {
  const scale = Math.max(160 / width, 160 / height);
  context.drawImage(source, (160 - width * scale) / 2, (160 - height * scale) / 2, width * scale, height * scale);
}
