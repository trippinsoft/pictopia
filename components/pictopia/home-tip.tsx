import { useCallback, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { homeTipStore } from "@/services/home-tips";
import { Icon, Text } from "./ui";

/** A quiet daily note. No library writes, network requests or review side effects. */
export function HomeTip({ spacing = 40 }: { spacing?: number } = {}) {
  const [message, setMessage] = useState<string>();
  const request = useRef(0), active = useRef(false), tapping = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const nextTip = async () => {
    if (tapping.current) return;
    tapping.current = true;
    setBusy(true); setError(false);
    const revision = ++request.current;
    try {
      const value = await homeTipStore.next();
      if (active.current && revision === request.current) setMessage(value);
    } catch { if (active.current && revision === request.current) setError(true); }
    finally { tapping.current = false; if (active.current) setBusy(false); }
  };
  useFocusEffect(useCallback(() => {
    active.current = true;
    setBusy(tapping.current);
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const revision = ++request.current;
      void homeTipStore.today().then(value => { if (alive && revision === request.current) setMessage(value); }).catch(() => {});
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, Math.max(1000, midnight.getTime() - now.getTime() + 100));
    };
    refresh();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { alive = false; active.current = false; request.current++; clearTimeout(timer); subscription.remove(); };
  }, []));
  return message ? <JourneyNote spacing={spacing} message={message} onNext={() => void nextTip()} busy={busy} error={error} /> : null;
}

/** Lightweight presentation shared with layout previews; all copy remains local. */
export function JourneyNote({ message, onNext, busy = false, error = false, spacing = 40 }: {
  message: string; onNext?: () => void; busy?: boolean; error?: boolean; spacing?: number;
}) {
  return <Pressable accessibilityRole={onNext ? "button" : undefined}
    accessibilityLabel={onNext ? `For the Journey... ${message}` : undefined}
    accessibilityHint={onNext ? "Shows the next message" : undefined}
    accessibilityState={{ disabled: busy || !onNext }} disabled={busy || !onNext} onPress={onNext}
    style={{ marginTop: spacing }} className="min-h-12 items-center gap-2 px-4 active:opacity-70">
    <View className="flex-row items-center justify-center gap-2" style={headingStyle}>
      <Icon name="Compass" size={19} className="text-tertiary" />
      <Text accessibilityRole="header" className="text-headline text-foreground">For the Journey...</Text>
    </View>
    <Text accessibilityLiveRegion="polite" className="max-w-xs text-center text-caption leading-5 text-muted-foreground">{message}</Text>
    {error && <Text accessibilityRole="alert" className="text-center text-caption text-muted-foreground">Couldn’t save this message. Tap to try again.</Text>}
  </Pressable>;
}
const headingStyle = { transform: [{ rotate: "-2.5deg" }] };
