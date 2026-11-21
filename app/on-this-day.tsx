import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { NavigationBack } from "@/components/pictopia/navigation-header";
import { AdventureReview, ProgressLine } from "@/components/pictopia/adventure-review";
import { ReviewTrash } from "@/components/pictopia/review-trash";
import { AdventureTheme } from "@/components/pictopia/adventure-theme";
import { DaySelector, type DayOption } from "@/components/pictopia/day-selector";
import { Button, Loading, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { adventureStore } from "@/services/adventures";
import { addDays, localDate } from "@/lib/pictopia/daily";

export default function OnThisDay() {
  const app = usePictopia();
  const [dates, setDates] = useState<DayOption[]>(() => Array.from({ length: 7 }, (_, i) => ({ date: addDays(localDate(Date.now()), -i) })));
  const [selection, setSelection] = useState<{ date: string; id?: string }>(() => ({ date: localDate(Date.now()) }));
  const [error, setError] = useState<string>(), [datesError, setDatesError] = useState(false), [busy, setBusy] = useState(true);
  const opening = useRef(false), alive = useRef(true), initialized = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const loadDates = useCallback(async () => {
    try {
      const rows = await adventureStore.history();
      if (alive.current) { setDates(rows.slice(0, 7)); setDatesError(false); }
    } catch { if (alive.current) setDatesError(true); }
  }, []);
  useFocusEffect(useCallback(() => {
    if (app.ready) void loadDates();
  }, [app.ready, loadDates]));
  const open = useCallback(async (date: string) => {
    if (opening.current || !app.ready) return;
    if (date !== localDate(Date.now()) && !app.pro) { router.push({ pathname: "/paywall", params: { entry: "Adventure" } }); return; }
    opening.current = true; setBusy(true); setError(undefined); setSelection({ date });
    try {
      const adventure = await adventureStore.choose({ kind: "day", date }, Date.now(), app.pro);
      if (adventure) await adventureStore.open(adventure.id, app.pro);
      if (alive.current) setSelection({ date, id: adventure?.id });
    } catch { if (alive.current) setError("These memories couldn’t open. Please try again."); }
    finally { opening.current = false; if (alive.current) setBusy(false); }
  }, [app.ready, app.pro]);
  // The route itself opens today's saved reviewer; there is no intermediate date list.
  useEffect(() => {
    if (!app.ready || initialized.current) return;
    initialized.current = true;
    void open(localDate(Date.now()));
  }, [app.ready, open]);
  const navigation = (disabled = false, flush?: () => void) => <>
    <DaySelector dates={dates} selected={selection.date} pro={app.pro} disabled={disabled || busy || !app.ready}
      onSelect={date => { if (date === selection.date) return; flush?.(); void open(date); }} />
    {datesError ? <Button secondary onPress={() => void loadDates()}>Retry photo counts</Button> : null}
  </>;
  if (selection.id) return <AdventureReview key={selection.id} id={selection.id}
    dateNavigation={({ disabled, flush }) => navigation(disabled, flush)} />;
  return <AdventureTheme enabled><SafeAreaView className="flex-1 bg-background">
    <StatusBar style="light" /><Stack.Screen options={{ title: "On This Day", headerShown: false }} />
    <View className="mx-auto w-full max-w-3xl flex-1">
      <View className="gap-2 px-4 pb-2 pt-1">
        <View className="flex-row items-center justify-between pb-6">
          <NavigationBack fallback="/(tabs)/explore" />
          <View className="min-w-0 flex-1 items-center px-2">
            <Text numberOfLines={1} accessibilityRole="header" className="text-center text-headline text-foreground">On This Day</Text>
            <Text className="text-caption text-muted-foreground" style={{ fontVariant: ["tabular-nums"] }}>{busy || !app.ready ? "…" : "0 of 0"}</Text>
            {!app.pro ? <View className="h-[34px]" /> : null}
          </View>
          <ReviewTrash count={0} bytes={0} unknownSizes={0} disabled onMeasure={() => {}} onPress={() => {}} />
        </View>
        <ProgressLine total={0} initial={0} />
      </View>
      {navigation()}
      <View className="flex-1 items-center justify-center gap-3 px-6">
        {busy || !app.ready ? <Loading /> : error ? <>
          <Text accessibilityRole="alert" className="text-center text-body text-foreground">{error}</Text>
          <Button onPress={() => void open(selection.date)}>Try again</Button>
        </> : <>
          <Text accessibilityRole="header" className="text-center text-h2 text-foreground">No memories on this date</Text>
          <Text className="text-center text-body text-muted-foreground">No photos or videos from earlier years on this day. Try another date above.</Text>
        </>}
        {Platform.OS === "web" ? <Text className="text-center text-caption text-muted-foreground">Browser dates use file-modified dates.</Text> : null}
      </View>
    </View>
  </SafeAreaView></AdventureTheme>;
}
