import { type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { ImageContentPosition } from "expo-image";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, Text } from "./ui";
import { ART_THEMES, AdventureCover } from "./adventure-art";
import { Illustration } from "./illustration";
import { MediaImage } from "./media-image";
import { useTheme } from "@/theming/ThemeProvider";
import type { AdventureKind } from "@/lib/pictopia/adventures";
import type { CatalogEntry } from "@/lib/pictopia/catalog";
import type { Media } from "@/lib/pictopia/types";

/** Playful Adventure building blocks: white stickers and cards on the chosen pastel, lifted by a
 * soft, solid shadow in the pastel's tint. Colors come only from theme tokens. */
export function useTint() {
  const { theme } = useTheme();
  return theme.colors.tint ?? theme.colors.border ?? "hsl(210 54% 86%)";
}
export function useLift(depth = 3) {
  const tint = useTint();
  return { boxShadow: `0px ${depth}px 0px ${tint}` } as ViewStyle;
}

export function Wordmark() {
  return (
    <Text accessibilityRole="header" accessibilityLabel="Pictopia" className="text-h1 text-foreground">
      pictopia<Text className="text-h1 text-tomato">.</Text>
    </Text>
  );
}

export function GearButton() {
  const lift = useLift();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => router.push("/settings")}
      style={lift}
      className="h-12 w-12 items-center justify-center rounded-full bg-card active:opacity-70"
    >
      <Icon name="Settings" size={22} className="text-foreground" />
    </Pressable>
  );
}

/** Wordmark (Home) or a tab title, with the one Settings entry point on the right. */
export function TabHeader({ title }: { title?: string }) {
  return (
    <View>
      <View className="flex-row items-center justify-between">
        {title ? <Text accessibilityRole="header" className="text-h1 text-foreground">{title}</Text> : <Wordmark />}
        <GearButton />
      </View>

    </View>
  );
}

export function Sticker({ children, rotate = 0, onPress, label, style, className = "" }: {
  children: ReactNode;
  rotate?: number;
  onPress?: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const lift = useLift();
  const body = [lift, { transform: [{ rotate: `${rotate}deg` }] }, style];
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={body} className={`rounded-[20px] bg-card px-3.5 py-3 active:opacity-80 ${className}`}>
      {children}
    </Pressable>
  ) : (
    <View accessibilityLabel={label} style={body} className={`rounded-[20px] bg-card px-3.5 py-3 ${className}`}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="mb-3 mt-7 flex-row items-baseline justify-between">
      <Text accessibilityRole="header" className="text-h2 text-foreground">{children}</Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} className="min-h-11 justify-center">
          <Text className="text-h4 text-tertiary">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Artwork for a catalog entry without a saved adventure (Explore cards, Duplicate Hunt). */
export function ArtImage({ art }: { art: CatalogEntry["art"]; focus?: ImageContentPosition }) {
  return <Illustration name={ART_THEMES[art]} />;
}

export function Stamp({ children, tone = "sun" }: { children: string; tone?: "sun" | "tomato" | "grass" }) {
  const bg = tone === "tomato" ? "bg-tomato/15" : tone === "grass" ? "bg-grass/15" : "bg-sun-soft";
  return (
    <View className={`self-start rounded-lg px-2 py-1 ${bg}`}>
      <Text className="text-[11px] uppercase tracking-wider text-foreground" style={styles.stampText}>{children}</Text>
    </View>
  );
}

/** A Home choice: a white-bordered postcard with the adventure's own artwork, slightly tilted.
 * The `pick` variant is larger and carries the "Pictopia's pick" ribbon; `alt` is smaller and
 * sits lower so the two sit together like two postcards tossed on a table. */
export function Postcard({ kind, ids, title, hint, rotate, onPress, variant = "alt", pickLabel }: {
  kind: AdventureKind;
  ids?: string[];
  title: string;
  hint: string;
  rotate: number;
  onPress: () => void;
  variant?: "pick" | "alt";
  pickLabel?: string;
}) {
  const isPick = variant === "pick";
  const label = pickLabel ?? "Pictopia’s pick";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPick ? `${label}: ${title}. ${hint}` : `Or try ${title}. ${hint}`}
      onPress={onPress}
      style={[styles.postcard, isPick ? styles.postcardPick : styles.postcardAlt, { transform: [{ rotate: `${rotate}deg` }] }]}
      className="gap-1.5 rounded-[22px] bg-card p-2 pb-3 active:opacity-90"
    >
      <View style={isPick ? styles.artPick : styles.artAlt} className="overflow-hidden rounded-[15px] bg-muted">
        <AdventureCover kind={kind} ids={ids} />
      </View>
      {isPick && (
        <View className="-mt-0.5 ml-1 self-start rounded-md bg-sun px-2 py-0.5">
          <Text className="text-[11px] text-foreground" style={styles.stampText}>{label.toUpperCase()}</Text>
        </View>
      )}
      <Text numberOfLines={2} className={`${isPick ? "text-h3" : "text-h4"} px-1 leading-[22px] text-foreground`}>{title}</Text>
      <Text numberOfLines={2} className="px-1 text-caption leading-[17px] text-muted-foreground">{hint}</Text>
    </Pressable>
  );
}

/** The tomato "or" badge floats between the two postcards, overlapping both. The left offset
 * matches where the pick card's right edge sits (its flex is 1.3 / 2.2 ≈ 59%). The badge's
 * z-index sits above the pick card, which sits above the alt. */
export function OrBadge() {
  const { theme } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.or, { boxShadow: `0px 0px 0px 4px ${theme.colors.background}` } as ViewStyle]}
      className="absolute top-[94px] z-20 h-11 w-11 items-center justify-center rounded-full bg-tomato"
    >
      <Text className="text-h4 text-white">or</Text>
    </View>
  );
}

/** "Continue your trip": a ticket with its artwork stub and a play button. */
export function Ticket({ kind, media, eyebrow, title, onPress }: {
  kind?: AdventureKind;
  media?: Media;
  eyebrow: string;
  title: string;
  onPress: () => void;
}) {
  const lift = useLift();
  const tint = useTint();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${eyebrow}. ${title}`} onPress={onPress} style={lift} className="h-16 flex-row items-center overflow-hidden rounded-[18px] bg-card active:opacity-80">
      <View className="h-16 w-16 bg-muted">
        {media ? <MediaImage media={media} fit="cover" style={StyleSheet.absoluteFill} failureContent={<View className="flex-1 items-center justify-center bg-secondary"><Icon name={media.type === "video" ? "Video" : "Image"} size={22} className="text-muted-foreground" /></View>} /> : <AdventureCover kind={kind} />}
      </View>
      <View style={[styles.perforation, { borderColor: tint }]} className="h-full flex-1 justify-center px-3">
        <Text className="text-caption text-muted-foreground">{eyebrow}</Text>
        <Text numberOfLines={1} className="text-h4 text-foreground">{title}</Text>
      </View>
      <View className="mr-2.5 h-11 w-11 items-center justify-center rounded-full bg-primary">
        <Icon name="Play" size={16} className="text-primary-foreground" fill="currentColor" />
      </View>
    </Pressable>
  );
}

/** Pending deletions, visible but calm: a small white pill, never a red tile. Shows the
 * running total size when any marked items had a known file size, like Picnic. */
export function WaitingPill({ count, size, onPress }: { count: number; size?: string; onPress: () => void }) {
  const lift = useLift();
  const label = size ? `Discarded · ${count} to delete · ${size}` : `Discarded · ${count} to delete`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Review`}
      onPress={onPress}
      style={lift}
      className="h-11 flex-row items-center gap-2 self-center rounded-full bg-card pl-2.5 pr-4 active:opacity-80"
    >
      <View className="h-7 w-7 items-center justify-center rounded-full bg-tomato/15">
        <Icon name="Trash2" size={15} className="text-tertiary" />
      </View>
      <Text className="text-h5 text-foreground">{label}</Text>
      <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
    </Pressable>
  );
}

/** A straight Explore card: artwork on top, the permanent name, a short line, and an ⓘ. */
export function AdventureCard({ entry, kind, blurb, badge, landscape, onPress, onInfo, focus }: {
  entry: CatalogEntry;
  kind?: AdventureKind;
  blurb?: string;
  badge?: string;
  landscape?: boolean;
  onPress: () => void;
  onInfo: () => void;
  focus?: ImageContentPosition;
}) {
  const lift = useLift();
  const art = kind ? <AdventureCover kind={kind} /> : <ArtImage art={entry.art} focus={focus} />;
  const info = (
    <Pressable accessibilityRole="button" accessibilityLabel={`About ${entry.name}`} onPress={onInfo} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full active:opacity-60">
      <Icon name="Info" size={18} className="text-muted-foreground" />
    </Pressable>
  );
  const text = (
    <View className="flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className="shrink text-h4 text-foreground">{entry.name}</Text>
        {entry.pro && <View className="rounded-md bg-primary px-1.5 py-0.5"><Text className="text-[11px] text-sun" style={styles.stampText}>PLUS</Text></View>}
      </View>
      <Text numberOfLines={2} className="text-caption leading-[17px] text-muted-foreground">{blurb ?? entry.blurb}</Text>
    </View>
  );
  const flag = badge ? (
    <View className="absolute left-2 top-2 rounded-lg bg-primary px-2 py-1"><Text className="text-caption text-primary-foreground">{badge}</Text></View>
  ) : null;
  if (landscape)
    // The ⓘ sits beside the card's button, not inside it: nested buttons are invalid on web.
    return (
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}. ${blurb ?? entry.blurb}${badge ? `. ${badge}` : ""}`} onPress={onPress} style={lift} className="h-[104px] flex-row overflow-hidden rounded-[18px] bg-card active:opacity-90">
          <View className="w-[124px] bg-muted">{art}</View>
          <View className="flex-1 flex-row items-center gap-1 py-3 pl-3.5 pr-1.5">
            <View className="flex-1 gap-1">
              {badge && <Stamp tone="tomato">{badge}</Stamp>}
              {text}
            </View>
            <View className="w-9" />
          </View>
        </Pressable>
        <View className="absolute right-1.5 top-[34px]">{info}</View>
      </View>
    );
  return (
    <View className="flex-1">
      <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}. ${blurb ?? entry.blurb}${badge ? `. ${badge}` : ""}`} onPress={onPress} style={lift} className="flex-1 overflow-hidden rounded-[18px] bg-card active:opacity-90">
        <View className="h-[112px] bg-muted">{art}{flag}</View>
        <View className="flex-row items-start gap-1 py-2.5 pl-3 pr-1">
          {text}
          <View className="w-9" />
        </View>
      </Pressable>
      <View className="absolute right-1 top-[122px]">{info}</View>
    </View>
  );
}

/** A lightweight bottom sheet that explains exactly what an adventure selects. */
export function InfoSheet({ entry, note, onClose }: { entry?: CatalogEntry; note?: string; onClose: () => void }) {
  return (
    <Modal visible={!!entry} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 bg-black/30" />
      {entry && (
        <SafeAreaView edges={["bottom"]} className="rounded-t-[28px] bg-background">
          <ScrollView contentContainerClassName="px-6 pb-6 pt-3">
            <View className="mb-4 h-1.5 w-10 self-center rounded-full bg-foreground/20" />
            <View className="mb-4 h-36 overflow-hidden rounded-[18px] bg-muted"><ArtImage art={entry.art} /></View>
            <Text accessibilityRole="header" className="text-h2 text-foreground">{entry.name}</Text>
            <Text className="mt-1 text-caption uppercase tracking-wider text-muted-foreground">What it picks</Text>
            <Text className="mt-2 text-body leading-6 text-foreground">{entry.details}</Text>
            {!!note && <Text className="mt-3 text-body leading-6 text-muted-foreground">{note}</Text>}
            <Pressable accessibilityRole="button" onPress={onClose} className="mt-6 min-h-12 items-center justify-center rounded-2xl bg-primary active:opacity-80">
              <Text className="text-button text-primary-foreground">Got it</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  postcard: { boxShadow: "0px 10px 24px rgba(27,35,80,0.16)" } as ViewStyle,
  // Pick sits on top of alt with a tiny overlap so the two read as a stack of postcards
  // tossed on a table, not two separate tiles. The overlap only shaves the alt's rounded
  // corner — it never covers the alt's text, so the title and hint stay fully readable.
  postcardPick: { flex: 1.3, marginTop: 0, zIndex: 2 },
  postcardAlt: { flex: 0.9, marginTop: 28, marginLeft: -8, zIndex: 1 },
  artPick: { height: 186 },
  artAlt: { height: 128 },
  // Over the seam between the two cards: pick is ≈ 1.3 / 2.2 of the row, so its right edge
  // lands near 59 %. The marginLeft centres the 44 px badge on that seam.
  or: { left: "59%", marginLeft: -22 },
  perforation: { borderLeftWidth: 2, borderStyle: "dashed" },
  stampText: { fontFamily: "Inter_700Bold" },
});
