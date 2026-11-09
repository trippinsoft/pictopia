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
    accessibilityLabel={onNext ? `Did you know? ${message}` : undefined}
    accessibilityHint={onNext ? "Shows the next tip" : undefined}
    accessibilityState={{ disabled: busy || !onNext }} disabled={busy || !onNext} onPress={onNext}
    style={{ marginTop: spacing }} className="min-h-12 flex-row items-start gap-2.5 px-1 py-2 active:opacity-70">
    <Icon name="Lightbulb" size={19} className="mt-0.5 text-sun" />
    <View className="flex-1">
      <Text accessibilityLiveRegion="polite" className="text-body leading-[22px] text-muted-foreground">
        <Text className="text-body text-foreground" style={bodyBoldStyle}>Did you know? </Text>
        {message}
      </Text>
      {error && <Text accessibilityRole="alert" className="mt-1 text-caption text-muted-foreground">Couldn’t save this tip. Tap to try again.</Text>}
    </View>
  </Pressable>;
}
const bodyBoldStyle = { fontFamily: "Inter_600SemiBold" };
