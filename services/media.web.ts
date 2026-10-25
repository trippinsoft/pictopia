import * as DocumentPicker from "expo-document-picker";
import { MediaService } from "./media.types";
import { Media } from "@/lib/pictopia/types";
import { dateKeys } from "@/lib/pictopia/logic";
import { storage } from "./storage";
const urls = new Map<string, string>();
export const mediaService: MediaService = {
  async permission() {
    return { granted: true, limited: true, canAskAgain: true, label: "Selected browser files" };
  },
  async sync(onPage, onProgress, signal) {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      multiple: true,
      copyToCacheDirectory: false,
    });
    if (result.canceled) return;
    let n = 0;
    for (const a of result.assets) {
      if (signal.aborted) break;
      const file = a.file;
      if (!file) continue;
      const key = `import:${file.name}:${file.size}:${file.lastModified}`;
      const existing = await storage.getValue<string>(key);
      const id = existing ?? `web-${globalThis.crypto.randomUUID()}`;
      await storage.setValue(`file:${id}`, file);
      await storage.setValue(key, id);
      const uri = URL.createObjectURL(file);
      const type = file.type.startsWith("video/") ? "video" : "photo";
      const meta = await new Promise<{ width: number; height: number; duration: number }>(
        (resolve) => {
          if (type === "photo") {
            const image = new globalThis.Image();
            image.onload = () =>
              resolve({ width: image.naturalWidth, height: image.naturalHeight, duration: 0 });
            image.onerror = () => resolve({ width: 0, height: 0, duration: 0 });
            image.src = uri;
          } else {
            const v = globalThis.document.createElement("video");
            v.preload = "metadata";
            v.onloadedmetadata = () =>
              resolve({
                width: v.videoWidth,
                height: v.videoHeight,
                duration: Number.isFinite(v.duration) ? v.duration : 0,
              });
            v.onerror = () => resolve({ width: 0, height: 0, duration: 0 });
            v.src = uri;
          }
        },
      );
      const created = file.lastModified;
      const m: Media = {
        id,
        uri: `web:${id}`,
        name: file.name,
        type,
        created,
        modified: file.lastModified,
        ...meta,
        ...dateKeys(created),
        size: file.size,
        favorite: false,
        screenshot: false,
        active: true,
      };
      URL.revokeObjectURL(uri);
      await onPage([m]);
      onProgress(++n, result.assets.length);
    }
  },
  async resolve(m) {
    let uri = urls.get(m.id);
    if (!uri) {
      const file = await storage.getValue<Blob>(`file:${m.id}`);
      if (!file) throw Error("This selected file is unavailable. Choose it again from Home.");
      uri = URL.createObjectURL(file);
      urls.set(m.id, uri);
      if (urls.size > 64) {
        const first = urls.keys().next().value;
        if (first && first !== m.id) {
          URL.revokeObjectURL(urls.get(first)!);
          urls.delete(first);
        }
      }
    }
    return { uri, size: m.size };
  },
  async inspect(ids) {
    // Browser selections are not a device library, so they can never prove deletion.
    return { scope: "limited", presence: Object.fromEntries(ids.map((id) => [id, "unknown"])) };
  },
  async remove() {
    throw Error(
      "Browsers cannot delete files from your device. Review your queue in the native app to request safe deletion.",
    );
  },
  listen() {
    return () => {};
  },
  async manageAccess() {
    /* Browser selection is managed by the system file picker. */
  },
};
