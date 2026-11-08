import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Icon, Text } from "@/components/pictopia/ui";
import { usePictopia } from "@/components/pictopia/provider";
import { useLift } from "@/components/pictopia/playful";
import { AdventureCover } from "@/components/pictopia/adventure-art";
import { useTheme } from "@/theming/ThemeProvider";
import { PASTELS, savedPastel, type PastelId } from "@/theming/pastels";
import { mediaService } from "@/services/media";
import { openLegal, manageSubscription } from "@/lib/pictopia/links";

const SUPPORT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

function Row({ title, value, onPress, children, last }: { title: string; value?: string; onPress?: () => void; children?: ReactNode; last?: boolean }) {
  const body = (
    <>
      <Text className="flex-1 text-body text-foreground">{title}</Text>
      {value !== undefined && <Text className="text-body text-muted-foreground">{value}</Text>}
      {children}
      {onPress && !children && <Icon name="ChevronRight" size={17} className="text-muted-foreground" />}
    </>
  );
  const cls = `min-h-14 flex-row items-center gap-3 px-4 ${last ? "" : "border-b border-border"}`;
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} className={`${cls} active:opacity-70`}>{body}</Pressable>
  ) : (
    <View className={cls}>{body}</View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const lift = useLift();
  return (
    <>
      <Text accessibilityRole="header" className="mb-2.5 mt-6 text-h3 text-foreground">{title}</Text>
      <View style={lift} className="overflow-hidden rounded-[20px] bg-card">{children}</View>
    </>
  );
}

/** Settings, a sheet from the gear on every tab: Pro, theme, photos, help and legal. Reset and
 * analysis-cache controls live in the developer Adventure Lab. */
export default function Settings() {
  const app = usePictopia();
  const { theme } = useTheme();
  const lift = useLift();
  const [message, setMessage] = useState<string>();
  async function action(work: () => Promise<unknown>) {
    setMessage(undefined);
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"));
  const toggle = (key: "haptics" | "autoplay", title: string) => (
    <Switch
      accessibilityLabel={title}
      value={app.prefs[key]}
      trackColor={{ true: theme.colors.grass, false: theme.colors.tint }}
      ios_backgroundColor={theme.colors.tint}
      onValueChange={(v) => void action(() => app.updatePrefs({ [key]: v }))}
    />
  );
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <View className="mx-auto w-full max-w-md px-5"><ScreenHeader title="Settings" onBack={close} action={<Pressable accessibilityRole="button" accessibilityLabel="Done with Settings" onPress={close} className="h-12 min-w-12 items-center justify-center px-2"><Text className="text-h4 text-foreground">Done</Text></Pressable>} /></View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-md px-[18px] pb-10">
        {!!message && <Text accessibilityRole="alert" className="mt-3 text-body text-destructive">{message}</Text>}

        <Pressable
          accessibilityRole="button"
          onPress={() => (app.pro ? void action(() => manageSubscription(app.entitlement?.managementURL)) : router.push("/paywall"))}
          style={lift}
          className="mt-4 flex-row items-center gap-3 rounded-[20px] bg-primary px-4 py-4 active:opacity-90"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-sun">
            <Icon name="Sparkles" size={20} className="text-foreground" />
          </View>
          <View className="flex-1">
            <Text className="text-h3 text-primary-foreground">{app.pro ? "Pictopia+ · Active" : "Pictopia+"}</Text>
            <Text className="text-caption text-primary-foreground/80">
              {app.pro
                ? app.entitlement?.expires
                  ? `Renews or ends ${new Date(app.entitlement.expires).toLocaleDateString()} · Manage`
                  : "Unlimited swipes · Manage"
                : "Unlimited daily swipes"}
            </Text>
          </View>
          <Icon name="ChevronRight" size={18} className="text-primary-foreground" />
        </Pressable>
        {Platform.OS !== "web" && (
          <Pressable accessibilityRole="button" onPress={() => void action(app.restorePurchases)} className="min-h-11 items-center justify-center">
            <Text className="text-h5 text-muted-foreground">Restore purchases</Text>
          </Pressable>
        )}

        <Text accessibilityRole="header" className="mb-2.5 mt-4 text-h3 text-foreground">Theme</Text>
        <View style={lift} className="gap-4 rounded-[20px] bg-card px-3 pb-4 pt-3.5">
          <View className="relative flex-row items-center gap-2.5 rounded-[14px] bg-background p-2.5">
            <View className="flex-1 gap-1">
              <Text className="text-h4 text-foreground">Where to today?</Text>
              <Text className="text-caption text-muted-foreground">Preview · artwork never changes</Text>
            </View>
            <View className="h-14 w-11 overflow-hidden rounded-md border-[3px] border-white" style={{ transform: [{ rotate: "-4deg" }] }}><AdventureCover kind="capsule" /></View>
            <View className="h-6 w-6 items-center justify-center rounded-full bg-tomato"><Text className="text-[11px] text-white">or</Text></View>
            <View className="h-14 w-11 overflow-hidden rounded-md border-[3px] border-white" style={{ transform: [{ rotate: "4deg" }] }}><AdventureCover kind="detour" /></View>
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel="Theme colour" className="flex-row flex-wrap justify-between gap-y-3.5">
            {PASTELS.map((p) => {
              const on = savedPastel(app.prefs.theme) === p.id;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityLabel={p.name}
                  accessibilityState={{ checked: on }}
                  onPress={() => void action(() => app.updatePrefs({ theme: p.id as PastelId }))}
                  className="w-[19%] items-center gap-1.5"
                >
                  <View
                    style={{ backgroundColor: p.swatch, boxShadow: on ? `0px 0px 0px 3px #fff, 0px 0px 0px 5px ${theme.colors.foreground}` : `inset 0px 0px 0px 1px ${p.tint}` }}
                    className="h-12 w-12 items-center justify-center rounded-full"
                  >
                    {on && <Icon name="Check" size={20} className="text-foreground" />}
                  </View>
                  <Text className={`text-[12px] ${on ? "text-foreground" : "text-muted-foreground"}`}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Group title="Photos & feel">
          <Row title="Photo access" value={app.permission?.label ?? "Checking…"} onPress={() => void action(() => (Platform.OS === "web" ? app.connect() : mediaService.manageAccess()))} />
          <Row title="Play Live Photos & videos">{toggle("autoplay", "Play Live Photos and videos")}</Row>
          <Row title="Haptics" last>{toggle("haptics", "Haptics")}</Row>
        </Group>

        <Group title="Help">
          <Row title="Help & tips" onPress={() => router.push("/help")} />
          {!!SUPPORT && <Row title="Contact support" onPress={() => void action(() => Linking.openURL(`mailto:${SUPPORT}`))} />}
          <Row title="Privacy policy" onPress={() => void action(() => openLegal("privacy"))} />
          <Row title="Terms of use" last onPress={() => void action(() => openLegal("terms"))} />
        </Group>

        {/* Long-press the version line to open the developer-only Adventure Lab and Device checks. */}
        <Pressable accessibilityRole="text" onLongPress={() => router.push("/adventure-lab")} delayLongPress={800} className="mt-8">
          <Text className="text-center text-caption text-muted-foreground">
            Pictopia {Constants.expoConfig?.version ?? "1.0.0"} · Build {Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "1"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
