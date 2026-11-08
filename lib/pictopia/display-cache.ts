import type { Media } from "./types";
// Small references to representations already painted, never full-resolution image data.
const displays = new Map<string, { version: number; uri: string }>();
export function rememberDisplay(media: Media, uri: string) {
  displays.delete(media.id); displays.set(media.id, { version: media.modified, uri });
  if (displays.size > 64) displays.delete(displays.keys().next().value!);
}
export function rememberedDisplay(media: Media) {
  const saved = displays.get(media.id);
  return saved?.version === media.modified ? saved.uri : undefined;
}
