import { useState } from "react";
import { Platform, Share, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { Button, Page, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { purchaseService } from "@/services/purchases";
import { albumService } from "@/services/albums";
import { mediaService } from "@/services/media";
import { storage } from "@/services/storage";
import { PRO_PRODUCT_IDS } from "@/lib/pictopia/store-entitlement";

type Line = { label: string; value: string; ok?: boolean };
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Developer-only: reports what this device's store, photo library and albums actually do, so the
 * early native validations are judged on real phones, not on host tests. Reads only; never
 * purchases, marks or deletes anything. */
export default function DeviceChecks() {
  const app = usePictopia();
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [videoId, setVideoId] = useState<string>();
  async function run() {
    setRunning(true);
    const out: Line[] = [];
    const add = (label: string, value: string, ok?: boolean) => {
      out.push({ label, value, ok });
      setLines([...out]);
    };
    add("Device", `${Platform.OS} ${String(Platform.Version)} · app ${Constants.expoConfig?.version ?? "?"}`);
    try {
      const p = await mediaService.permission();
      add("Photo access", `${p.label} (granted: ${p.granted}, limited: ${!!p.limited})`, p.granted);
      const s = await storage.stats();
      add("Indexed", `${s.photos} photos · ${s.videos} videos · ${s.pending} pending deletion`);
      const [video] = await storage.query({ type: "video", order: "newest", limit: 1 });
      setVideoId(video?.id);
    } catch (e) {
      add("Photo access", errorText(e), false);
    }
    try {
      const offers = await purchaseService.offers();
      const found = offers.map((o) => `${o.id} ${o.price}`).join(", ");
      const missing = PRO_PRODUCT_IDS.filter((id) => !offers.some((o) => o.id === id));
      add("Store products", found || "none returned", !missing.length);
      if (missing.length) add("Missing products", `${missing.join(", ")} (set up in the store, then retry)`, false);
    } catch (e) {
      add("Store products", errorText(e), false);
    }
    try {
      const e = await purchaseService.refresh();
      add("Pictopia+ from store", e.active ? `active until ${e.expires ? new Date(e.expires).toLocaleString() : "?"}` : "not subscribed", true);
    } catch (e) {
      add("Pictopia+ from store", errorText(e), false);
    }
    if (!albumService.supported) add("Albums", "not available on this platform");
    else
      try {
        const albums = await albumService.list();
        add("Albums", `${albums.length} ${albums[0]?.kind === "folder" ? "folders" : "albums"} with items`, albums.length > 0);
        for (const a of albums.slice(0, 12)) {
          const ids = await albumService.members(a.id);
          const known = new Set((await Promise.all(chunks(ids, 400).map((c) => storage.query({ ids: c })))).flat().map((m) => m.id));
          add(`· ${a.title}`, `reported ${a.count} · readable ${ids.length} · indexed ${known.size}`, ids.length > 0);
        }
      } catch (e) {
        add("Albums", errorText(e), false);
      }
    setRunning(false);
  }
  const report = lines.map((l) => `${l.ok === false ? "✗" : l.ok ? "✓" : "•"} ${l.label}: ${l.value}`).join("\n");
  return (
    <Page fallback="/adventure-lab" title="Device checks" subtitle="Reads the store, photo access and albums on this phone. Nothing is bought, marked or deleted.">
      <View className="gap-3">
        <Button disabled={running || !app.ready} onPress={() => void run()}>{running ? "Checking…" : "Run checks"}</Button>
        {!!videoId && <Button secondary onPress={() => router.push({ pathname: "/preview", params: { id: videoId } })}>Play newest video</Button>}
        {!!report && <Button secondary onPress={() => void Share.share({ message: report })}>Share report</Button>}
      </View>
      <View className="mt-6 gap-3">
        {lines.map((l, i) => (
          <View key={i} className="rounded-xl bg-card p-3">
            <Text className={`text-h6 ${l.ok === false ? "text-destructive" : "text-foreground"}`}>{l.label}</Text>
            <Text className="mt-1 text-caption text-muted-foreground">{l.value}</Text>
          </View>
        ))}
      </View>
    </Page>
  );
}
function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
