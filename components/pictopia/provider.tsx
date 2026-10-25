import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { AppState, Appearance, Platform, View, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { repository, storage } from "@/services/repository";
import { deleteMarked, recoverDeletions } from "@/services/deletion";
import { mediaService } from "@/services/media";
import { purchaseService } from "@/services/purchases";
import { analyzer } from "@/services/analysis";
import { Permission } from "@/services/media.types";
import {
  Stats,
  Month,
  Session,
  SessionMinutes,
  Preferences,
  defaultPreferences,
  Collection,
  Entitlement,
  ScanState,
  Media,
  DeletionResult,
} from "@/lib/pictopia/types";
import { SCAN_VERSION, entitlementActive } from "@/lib/pictopia/logic";
import { recoveryMessage } from "@/lib/pictopia/deletion";
const emptyStats: Stats = {
  total: 0,
  photos: 0,
  videos: 0,
  reviewed: 0,
  pending: 0,
  knownBytes: 0,
  knownSizes: 0,
  pendingBytes: 0,
};
interface Context {
  ready: boolean;
  stats: Stats;
  months: Month[];
  session: Session | null;
  prefs: Preferences;
  permission: Permission | null;
  busy: boolean;
  syncProgress: string;
  error: string | null;
  pro: boolean;
  entitlement: Entitlement | null;
  scan: ScanState;
  revision: number;
  setError: (e: string | null) => void;
  refresh: () => Promise<void>;
  connect: () => Promise<boolean>;
  start: (c: Collection, minutes?: SessionMinutes) => Promise<void>;
  addSessionTime: (id: string, milliseconds: number) => Promise<void>;
  finishSession: () => Promise<void>;
  decide: (d: "keep" | "delete", expectedId?: string) => Promise<void>;
  undo: () => Promise<void>;
  skip: (expectedId?: string) => Promise<void>;
  updatePrefs: (p: Partial<Preferences>) => Promise<void>;
  scanLibrary: () => Promise<void>;
  pauseScan: () => void;
  cancelScan: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  setEntitlement: (e: Entitlement) => Promise<void>;
  deleteQueue: (items: Media[]) => Promise<DeletionResult>;
}
const Ctx = createContext<Context | null>(null);
export function PictopiaProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false),
    [stats, setStats] = useState(emptyStats),
    [months, setMonths] = useState<Month[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [prefs, setPrefs] = useState(defaultPreferences),
    [permission, setPermission] = useState<Permission | null>(null),
    [busy, setBusy] = useState(false),
    [syncProgress, setSyncProgress] = useState(""),
    [error, setError] = useState<string | null>(null),
    [entitlement, setEnt] = useState<Entitlement | null>(null),
    [scan, setScan] = useState<ScanState>({ status: "idle", processed: 0, total: 0, skipped: 0 }),
    [revision, setRevision] = useState(0),
    [clock, setClock] = useState(Date.now());
  const syncRef = useRef<AbortController | null>(null),
    scanRef = useRef<AbortController | null>(null),
    decisionLock = useRef(false),
    alive = useRef(true),
    deletingRef = useRef(false);
  const refresh = useCallback(async () => {
    const [s, m, se] = await Promise.all([
      storage.stats(),
      storage.months(),
      storage.getValue<Session>("session"),
    ]);
    if (alive.current) {
      setStats(s);
      setMonths(m);
      setSession(se ?? null);
      setRevision((r) => r + 1);
    }
  }, []);
  const saveEnt = useCallback(async (e: Entitlement) => {
    await storage.setValue("entitlement", e);
    setEnt(e);
  }, []);
  async function recover() {
    if (Platform.OS === "web" || deletingRef.current || syncRef.current) return;
    deletingRef.current = true;
    try {
      const result = await recoverDeletions(mediaService);
      if (!result) return;
      const message = recoveryMessage(result);
      if (message && alive.current) setError(message);
      await refresh();
    } catch {
      /* The journal is kept and re-checked on the next launch or return to the app. */
    } finally {
      deletingRef.current = false;
    }
  }
  async function sync(request: boolean) {
    if (syncRef.current || deletingRef.current) return false;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    syncRef.current = controller;
    try {
      const p = await mediaService.permission(request);
      setPermission(p);
      if (!p.granted)
        throw Error("Photo access is off. Allow access in Settings to start cleaning.");
      const epoch = Date.now();
      await mediaService.sync(
        (page) => repository.ingest(page, epoch),
        (n, total) => setSyncProgress(`${n.toLocaleString()} of ${total.toLocaleString()} items`),
        controller.signal,
      );
      if (Platform.OS !== "web" && !controller.signal.aborted) await repository.reconcile(epoch);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your library could not be loaded. Try again.");
      return false;
    } finally {
      syncRef.current = null;
      setBusy(false);
      setSyncProgress("");
    }
  }
  useEffect(() => {
    alive.current = true;
    let stopPurchases = () => {},
      stopMedia = () => {};
    storage
      .init()
      .then(async () => {
        const p = await repository.preferences();
        setPrefs(p);
        Appearance.setColorScheme(p.appearance === "system" ? "unspecified" : p.appearance);
        setEnt((await storage.getValue<Entitlement>("entitlement")) ?? null);
        const saved = await storage.getValue<ScanState>("scan");
        if (saved) setScan(saved.status === "running" ? { ...saved, status: "paused" } : saved);
        setPermission(await mediaService.permission());
        await refresh();
        setReady(true);
        stopPurchases = await purchaseService.init((e) => {
          void saveEnt(e);
        });
        if (Platform.OS !== "web") {
          // Finish checking any deletion interrupted by a crash or termination before syncing.
          await recover();
          const permission = await mediaService.permission();
          if (permission.granted) void sync(false);
          stopMedia = mediaService.listen(() => {
            scanRef.current?.abort();
            analyzer.cancel?.();
            void sync(false);
          });
        }
      })
      .catch(() =>
        setError("Local storage could not open. Your photos are safe. Try reopening the app."),
      );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        scanRef.current?.abort();
        syncRef.current?.abort();
      } else if (alive.current) {
        setClock(Date.now());
        void purchaseService
          .refresh()
          .then(saveEnt)
          .catch(() => {});
        if (Platform.OS !== "web") void recover().then(() => sync(false));
      }
    });
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => {
      alive.current = false;
      syncRef.current?.abort();
      scanRef.current?.abort();
      subscription.remove();
      stopPurchases();
      stopMedia();
      clearInterval(timer);
    };
  }, []);
  async function start(c: Collection, minutes: SessionMinutes = 5) {
    if (!ready) return;
    if (session && !session.complete) return;
    if (
      (c === "large" || c === "blurry" || c.startsWith("group:")) &&
      !entitlementActive(entitlement)
    )
      throw Error("This collection is part of Pictopia Pro.");
    setSession(await repository.start(c, prefs, entitlementActive(entitlement), minutes));
    await refresh();
  }
  async function decision(d: "keep" | "delete", expectedId?: string) {
    if (decisionLock.current) return;
    decisionLock.current = true;
    try {
      setSession(await repository.decide(d, expectedId));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your decision could not be saved. Try again.");
      throw e;
    } finally {
      decisionLock.current = false;
    }
  }
  async function updatePrefs(p: Partial<Preferences>) {
    const next = { ...prefs, ...p };
    await storage.setValue("preferences", next);
    setPrefs(next);
    Appearance.setColorScheme(next.appearance === "system" ? "unspecified" : next.appearance);
  }
  async function scanLibrary() {
    if (!entitlementActive(entitlement)) throw Error("Smart analysis is part of Pictopia Pro.");
    if (!analyzer.available) throw Error("Smart analysis requires a native build.");
    if (deletingRef.current)
      throw Error("Wait for the current deletion to finish before scanning.");
    if (scanRef.current) return;
    const controller = new AbortController();
    scanRef.current = controller;
    let state: ScanState = {
      status: "running",
      processed: scan.status === "complete" ? 0 : scan.processed,
      total: stats.total,
      skipped: scan.status === "complete" ? 0 : scan.skipped,
    };
    setScan(state);
    try {
      while (!controller.signal.aborted) {
        if (analyzer.canScan && !(await analyzer.canScan()))
          throw Error(
            "The scan paused to protect your battery or memory. Resume when your device is ready.",
          );
        const page = await storage.query({ scanMissing: true, limit: 20 });
        if (!page.length) break;
        for (const m of page) {
          if (controller.signal.aborted) break;
          if (!entitlementActive((await storage.getValue<Entitlement>("entitlement")) ?? null))
            throw Error("Your Pro access has expired. Your scan results are kept.");
          try {
            const result = await analyzer.analyze(m);
            await repository.update(m.id, (latest) =>
              latest.active && latest.modified === m.modified
                ? {
                    ...latest,
                    size: result.size ?? latest.size,
                    scan: { ...result, version: `${SCAN_VERSION}:${m.modified}` },
                    scanError: undefined,
                  }
                : latest,
            );
          } catch {
            if (controller.signal.aborted) break;
            await repository.update(m.id, (latest) => ({
              ...latest,
              scanError: "Local media could not be analyzed. Retry after downloading it in Photos.",
            }));
            state.skipped++;
          }
          state = { ...state, processed: state.processed + 1 };
          setScan(state);
          await storage.setValue("scan", state);
          await new Promise((r) => setTimeout(r, 25));
        }
      }
      if (!controller.signal.aborted) await repository.groups(controller.signal);
      state = { ...state, status: controller.signal.aborted ? "paused" : "complete" };
      setScan(state);
      await storage.setValue("scan", state);
      await refresh();
    } catch (e) {
      state = { ...state, status: "paused" };
      setScan(state);
      await storage.setValue("scan", state);
      setError(e instanceof Error ? e.message : "The scan paused. You can resume it.");
    } finally {
      scanRef.current = null;
    }
  }
  async function deleteQueue(items: Media[]) {
    if (Platform.OS === "web")
      throw Error(
        "Device deletion is available in the native app. Browser files remain untouched.",
      );
    if (scanRef.current || syncRef.current || deletingRef.current)
      throw Error("Wait for the current library operation to finish before deleting.");
    deletingRef.current = true;
    setBusy(true);
    try {
      return await deleteMarked(items, mediaService);
    } finally {
      deletingRef.current = false;
      setBusy(false);
      await refresh().catch(() => {});
    }
  }
  const value: Context = {
    ready,
    stats,
    months,
    session,
    prefs,
    permission,
    busy,
    syncProgress,
    error,
    pro: entitlementActive(entitlement, clock),
    entitlement,
    scan,
    revision,
    setError,
    refresh,
    connect: () => sync(true),
    start,
    addSessionTime: async (id, milliseconds) => {
      const next = await repository.addTime(id, milliseconds);
      if (alive.current && next) setSession(next);
    },
    finishSession: async () => {
      if (!session) return;
      const next = await repository.finish(session.id);
      setSession(next ?? null);
      await refresh();
    },
    decide: decision,
    undo: async () => {
      setSession((await repository.undo()) ?? null);
      await refresh();
    },
    skip: async (expectedId) => {
      setSession((await repository.skip(expectedId)) ?? null);
      await refresh();
    },
    updatePrefs,
    scanLibrary,
    pauseScan: () => {
      scanRef.current?.abort();
      analyzer.cancel?.();
    },
    cancelScan: async () => {
      scanRef.current?.abort();
      analyzer.cancel?.();
    },
    restorePurchases: async () => {
      const e = await purchaseService.restore();
      await saveEnt(e);
      if (!e.active) throw Error("No active Pro purchase was found for this store account.");
    },
    setEntitlement: saveEnt,
    deleteQueue,
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {!!error && (
        <View className="absolute bottom-20 left-4 right-4 mx-auto max-w-xl flex-row items-center rounded-2xl border border-destructive bg-card p-4">
          <Text accessibilityRole="alert" className="flex-1 text-body leading-5 text-foreground">
            {error}
          </Text>
          <Pressable
            accessibilityLabel="Dismiss message"
            onPress={() => setError(null)}
            className="ml-3 p-3"
          >
            <Text className="text-h5 text-primary">Close</Text>
          </Pressable>
        </View>
      )}
    </Ctx.Provider>
  );
}
export function usePictopia() {
  const value = useContext(Ctx);
  if (!value) throw Error("Pictopia provider is missing.");
  return value;
}
