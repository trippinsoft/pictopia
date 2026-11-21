import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { Icon, Text } from "@/components/pictopia/ui";
import { Illustration, type ArtName } from "@/components/pictopia/illustration";
import { PLUS_SCENES, PLUS_SCENE_MS, type PlusScene } from "@/lib/pictopia/onboarding";
import { At, Magnifier, Print, Screenshot, Sparkle, TrashCan, VideoClip, useArt } from "./art";
import { Phone } from "./demos";
import { ConfettiBurst, Sunrays } from "./celebrate";

/** "This is what unlocking Pictopia+ feels like": a celebratory burst, then a phone playing four
 * short scenes (screenshots swept into one stack, duplicates gathered, the biggest videos
 * surfaced, a review counter sailing past the daily limit). Chips follow along and jump to a
 * scene when tapped. With reduced motion it's a still grid of the same four artworks. */
const PW = 224, PH = 318;
const IW = PW - 12, IH = PH - 12;
const TRASH = { x: IW - 28, y: 30 };
const TITLES: Record<PlusScene, string> = { screenshots: "Screenshot Sweep", duplicates: "Duplicate Hunt", videos: "Largest videos", unlimited: "Unlimited reviews" };
const ART: Record<PlusScene, ArtName> = { screenshots: "screenshots", duplicates: "duplicates", videos: "largeVideos", unlimited: "allPhotos" };

const clamp = (v: number) => { "worklet"; return Math.min(1, Math.max(0, v)); };
const seg = (t: number, a: number, b: number) => { "worklet"; return clamp((t - a) / (b - a)); };
const out = (x: number) => { "worklet"; return 1 - Math.pow(1 - x, 3); };
const inOut = (x: number) => { "worklet"; return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** Quadratic arc from (x, y) into the trash, `p` 0→1. */
const toTrash = (x: number, y: number, p: number) => {
  "worklet";
  const cx = (x + TRASH.x) / 2, cy = Math.min(y, TRASH.y) - 50, u = 1 - p;
  return { x: u * u * x + 2 * u * p * cx + p * p * TRASH.x, y: u * u * y + 2 * u * p * cy + p * p * TRASH.y };
};

/** Runs 0→1 over one scene from mount. */
function useScene() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: PLUS_SCENE_MS, easing: Easing.linear });
    return () => cancelAnimation(p);
  }, [p]);
  return p;
}

function Trash({ p, hits }: { p: SharedValue<number>; hits: number[] }) {
  const style = useAnimatedStyle(() => {
    const bump = hits.reduce((m, at) => Math.max(m, 1 - Math.abs(p.value - at) / 0.04), 0);
    return { transform: [{ scale: 1 + Math.max(0, bump) * 0.3 }] };
  });
  return <At x={TRASH.x} y={TRASH.y} w={38} h={38}><Animated.View style={style}><TrashCan size={38} /></Animated.View></At>;
}

function Chip({ p, at, x, y, children, tone = "ink" }: { p: SharedValue<number>; at: [number, number]; x: number; y: number; children: string; tone?: "ink" | "tomato" | "grass" }) {
  const style = useAnimatedStyle(() => {
    const show = out(seg(p.value, at[0], at[0] + 0.06)), hide = seg(p.value, at[1], at[1] + 0.05);
    return { opacity: show * (1 - hide), transform: [{ scale: 0.6 + show * 0.4 }, { translateY: (1 - show) * 8 }] };
  });
  const bg = tone === "tomato" ? "bg-tomato" : tone === "grass" ? "bg-grass" : "bg-foreground";
  return (
    <At x={x} y={y} w={160} h={30}>
      <Animated.View style={[{ alignItems: "center" }, style]}>
        <View className={`rounded-full px-3 py-1 ${bg}`}><Text className={`text-h5 ${tone === "ink" ? "text-background" : "text-white"}`}>{children}</Text></View>
      </Animated.View>
    </At>
  );
}

// —— Screenshot Sweep: scattered screenshots snap into one stack and go in one swoosh.
const SHOTS = [
  { x: 0.26, y: 0.28, r: -14 }, { x: 0.72, y: 0.3, r: 10 }, { x: 0.48, y: 0.48, r: 4 },
  { x: 0.24, y: 0.66, r: -8 }, { x: 0.74, y: 0.64, r: 13 }, { x: 0.5, y: 0.78, r: -5 },
];
function Shot({ i, p }: { i: number; p: SharedValue<number> }) {
  const s = SHOTS[i], w = 52, h = 90;
  const style = useAnimatedStyle(() => {
    const pop = out(seg(p.value, 0.02 + i * 0.035, 0.1 + i * 0.035));
    const g = inOut(seg(p.value, 0.28, 0.42));
    let x = s.x * IW + (IW * 0.5 + (i - 2.5) * 1.5 - s.x * IW) * g;
    let y = s.y * IH + (IH * 0.52 - i * 1.5 - s.y * IH) * g;
    const r = s.r + ((i - 2.5) * 3 - s.r) * g;
    const f = inOut(seg(p.value, 0.6, 0.76));
    const t = toTrash(x, y, f); x = t.x; y = t.y;
    return { opacity: pop * (f >= 1 ? 0 : 1), transform: [{ translateX: x - w / 2 }, { translateY: y - h / 2 }, { rotate: `${r + f * 30}deg` }, { scale: (0.6 + pop * 0.4) * (1 - f * 0.8) }] };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, style]}><Screenshot width={w} height={h} index={i + 1} tint={i} /></Animated.View>;
}
function ScreenshotsScene() {
  const p = useScene();
  return <>
    {SHOTS.map((_, i) => <Shot key={i} i={i} p={p} />)}
    <Chip p={p} at={[0.42, 0.58]} x={IW / 2} y={IH * 0.52 - 70}>{"6 screenshots"}</Chip>
    <Chip p={p} at={[0.78, 2]} x={IW / 2} y={IH * 0.5} tone="grass">{"Swept in one go"}</Chip>
    <Trash p={p} hits={[0.76]} />
  </>;
}

// —— Duplicate Hunt: three copies slide together, the glass finds them, two go, one stays.
const TWINS = [{ x: 0.24, y: 0.34, r: -10, to: -14 }, { x: 0.76, y: 0.4, r: 8, to: 0 }, { x: 0.5, y: 0.76, r: -4, to: 14 }];
function Twin({ i, p }: { i: number; p: SharedValue<number> }) {
  const s = TWINS[i], w = 70, h = 86, keeper = i === 1;
  const style = useAnimatedStyle(() => {
    const pop = out(seg(p.value, 0.02 + i * 0.05, 0.1 + i * 0.05));
    const g = inOut(seg(p.value, 0.18, 0.36));
    let x = s.x * IW + (IW / 2 + s.to * 1.4 - s.x * IW) * g;
    let y = s.y * IH + (IH * 0.52 - s.y * IH) * g;
    const r = s.r + (s.to * 0.5 - s.r) * g;
    const order = i === 0 ? 0 : 1;
    const f = keeper ? 0 : inOut(seg(p.value, 0.58 + order * 0.06, 0.74 + order * 0.06));
    const t = toTrash(x, y, f); x = t.x; y = t.y;
    const crown = keeper ? out(seg(p.value, 0.74, 0.84)) : 0;
    return { opacity: pop * (f >= 1 ? 0 : 1), transform: [{ translateX: x - w / 2 }, { translateY: y - h / 2 }, { rotate: `${r * (1 - crown) + f * 30}deg` }, { scale: (0.6 + pop * 0.4) * (1 - f * 0.8) * (1 + crown * 0.18) }] };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, zIndex: keeper ? 2 : 1 }, style]}><Print art="summer" width={w} height={h} index={i + 2} /></Animated.View>;
}
function DuplicatesScene() {
  const p = useScene();
  const c = useArt();
  const glass = useAnimatedStyle(() => {
    const m = inOut(seg(p.value, 0.3, 0.48)), hide = seg(p.value, 0.54, 0.6);
    return { opacity: seg(p.value, 0.28, 0.32) * (1 - hide), transform: [{ translateX: -40 + m * (IW / 2 + 10) }, { translateY: IH * 0.2 + m * IH * 0.16 }, { rotate: `${-10 + m * 10}deg` }] };
  });
  const star = useAnimatedStyle(() => {
    const s = seg(p.value, 0.8, 0.88);
    return { opacity: s > 0 ? 1 : 0, transform: [{ scale: s < 1 ? out(s) * 1.2 : 1 }] };
  });
  return <>
    {TWINS.map((_, i) => <Twin key={i} i={i} p={p} />)}
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, zIndex: 3 }, glass]}><Magnifier size={60} /></Animated.View>
    <Chip p={p} at={[0.44, 0.58]} x={IW / 2} y={IH * 0.52 - 76}>{"3 copies found"}</Chip>
    <At x={IW / 2 + 36} y={IH * 0.52 - 46} w={34} h={34}>
      <Animated.View style={[{ zIndex: 4 }, star]}>
        <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-sun"><Icon name="Star" size={18} color={c.ink} fill={c.ink} /></View>
      </Animated.View>
    </At>
    <Chip p={p} at={[0.82, 2]} x={IW / 2} y={IH * 0.52 + 76} tone="grass">{"Best one kept"}</Chip>
    <Trash p={p} hits={[0.74, 0.8]} />
  </>;
}

// —— Largest videos: clips sort themselves by size and the biggest goes first.
const CLIPS = [{ size: "240 MB", rank: 2 }, { size: "1.2 GB", rank: 0 }, { size: "85 MB", rank: 3 }, { size: "610 MB", rank: 1 }];
const ROW_H = 50, ROW_GAP = 10, ROW_TOP = 70;
function Clip({ i, p }: { i: number; p: SharedValue<number> }) {
  const c = CLIPS[i], w = IW - 28, top = c.rank === 0;
  const style = useAnimatedStyle(() => {
    const pop = out(seg(p.value, 0.02 + i * 0.04, 0.1 + i * 0.04));
    const g = inOut(seg(p.value, 0.24, 0.42));
    let x = IW / 2, y = ROW_TOP + (i + (c.rank - i) * g) * (ROW_H + ROW_GAP);
    const f = top ? inOut(seg(p.value, 0.62, 0.78)) : 0;
    const t = toTrash(x, y, f); x = t.x; y = t.y;
    return { opacity: pop * (f >= 1 ? 0 : 1), transform: [{ translateX: x - w / 2 }, { translateY: y - ROW_H / 2 + (1 - pop) * 16 }, { rotate: `${f * 20}deg` }, { scale: 1 - f * 0.8 }] };
  });
  const ring = useAnimatedStyle(() => ({ opacity: top ? seg(p.value, 0.44, 0.5) : 0 }));
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, zIndex: top ? 2 : 1 }, style]}>
      <VideoClip width={w} height={ROW_H} tint={i} size={c.size} index={i + 1} />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: -3, top: -3, right: -3, bottom: -3, borderRadius: 16, borderWidth: 3 }, ring]} className="border-tomato" />
    </Animated.View>
  );
}
function VideosScene() {
  const p = useScene();
  return <>
    {CLIPS.map((_, i) => <Clip key={i} i={i} p={p} />)}
    <Chip p={p} at={[0.2, 0.58]} x={IW / 2} y={30}>{"Biggest first"}</Chip>
    <Chip p={p} at={[0.78, 2]} x={IW / 2 - 20} y={30} tone="tomato">{"+1.2 GB"}</Chip>
    <Trash p={p} hits={[0.78]} />
  </>;
}

// —— Unlimited: the day's count sails past the free limit, the lock pops open, the flame grows.
const LIMIT_AT = 0.55;
const FILL = [0.08, 0.88] as const;
const CROSS = FILL[0] + LIMIT_AT * (FILL[1] - FILL[0]);
function UnlimitedScene() {
  const p = useScene();
  const c = useArt();
  const [count, setCount] = useState(45);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      // Same curve as the bar: the count reaches 100 exactly as the bar crosses the limit.
      const fill = Math.min(1, Math.max(0, ((Date.now() - started) / PLUS_SCENE_MS - FILL[0]) / (FILL[1] - FILL[0])));
      setCount(45 + Math.round(fill * 100));
      if (fill >= LIMIT_AT) setOpen(true);
    }, 50);
    return () => clearInterval(timer);
  }, []);
  const bar = useAnimatedStyle(() => ({ width: `${seg(p.value, FILL[0], FILL[1]) * 100}%` }));
  const lock = useAnimatedStyle(() => {
    const b = 1 - Math.abs(p.value - CROSS) / 0.06;
    return { transform: [{ scale: 1 + Math.max(0, b) * 0.35 }] };
  });
  const flame = useAnimatedStyle(() => ({ transform: [{ scale: 0.8 + out(seg(p.value, 0.1, 0.9)) * 0.7 }] }));
  const shine = useAnimatedStyle(() => { const s = seg(p.value, CROSS, CROSS + 0.1); return { opacity: s > 0 ? 1 - seg(p.value, 0.8, 0.95) : 0, transform: [{ scale: out(s) }] }; });
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width: IW, height: IH, alignItems: "center", paddingTop: 52, gap: 18 }}>
      <View style={{ backgroundColor: c.paper, borderRadius: 20, paddingHorizontal: 26, paddingVertical: 14, alignItems: "center", transform: [{ rotate: "-3deg" }] }}>
        <Text style={{ color: c.ink }} className="text-display">{count}</Text>
        <Text style={{ color: c.ink, opacity: 0.6 }} className="text-caption">reviewed today</Text>
      </View>
      <View style={{ width: IW - 40, height: 46, justifyContent: "center" }}>
        <View className="h-3.5 overflow-hidden rounded-full bg-foreground/10">
          <Animated.View style={[{ height: "100%", borderRadius: 999, backgroundColor: c.moss }, bar]} />
        </View>
        <View style={{ position: "absolute", left: (IW - 40) * LIMIT_AT - 1, top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: c.ink, opacity: 0.35 }} />
        <View style={{ position: "absolute", left: (IW - 40) * LIMIT_AT - 15, top: -24 }}>
          <Animated.View style={lock}>
            <View className={`h-[30px] w-[30px] items-center justify-center rounded-full ${open ? "bg-grass" : "bg-foreground"}`}>
              <Icon name={open ? "LockOpen" : "Lock"} size={15} color="#fff" />
            </View>
          </Animated.View>
        </View>
      </View>
      <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 6 }, flame]}>
        <Icon name="Flame" size={28} color={c.sun} fill={c.sun} />
        <Icon name="Infinity" size={28} className="text-foreground" />
      </Animated.View>
      <At x={IW * 0.82} y={150} w={22} h={22}><Animated.View style={shine}><Sparkle size={22} /></Animated.View></At>
      <At x={IW * 0.18} y={92} w={18} h={18}><Animated.View style={shine}><Sparkle size={18} /></Animated.View></At>
    </View>
  );
}

const SCENES: Record<PlusScene, () => ReactNode> = { screenshots: ScreenshotsScene, duplicates: DuplicatesScene, videos: VideosScene, unlimited: UnlimitedScene };

/** The "Pictopia+" sun stamp that pops onto the phone's corner. */
function PlusStamp() {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) v.value = withDelay(250, withSpring(1, { damping: 9, stiffness: 150 })); }, [reduced, v]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 2), transform: [{ scale: 0.3 + v.value * 0.7 }, { rotate: `${8 + (1 - v.value) * -30}deg` }] }));
  return (
    <Animated.View style={[{ position: "absolute", right: -14, top: -14, zIndex: 5 }, style]}>
      <View className="flex-row items-center gap-1 rounded-full bg-sun px-3 py-1.5" style={{ boxShadow: "0px 3px 8px rgba(28,36,87,0.18)" }}>
        <Icon name="Sparkles" size={15} className="text-sun-ink" />
        <Text className="text-h5 text-sun-ink">Pictopia+</Text>
      </View>
    </Animated.View>
  );
}

function SceneChips({ current, onPick }: { current: PlusScene; onPick?: (scene: PlusScene) => void }) {
  return (
    <View className="flex-row flex-wrap justify-center gap-2">
      {PLUS_SCENES.map(s => {
        const on = s.key === current;
        return (
          <Pressable key={s.key} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={TITLES[s.key]} disabled={!onPick} onPress={() => onPick?.(s.key)}
            className={`min-h-10 flex-row items-center gap-1.5 rounded-full border-2 px-3 ${on ? "border-foreground bg-foreground" : "border-border bg-card"}`}>
            <Icon name={s.icon} size={15} className={on ? "text-background" : "text-foreground"} />
            <Text className={`text-caption ${on ? "text-background" : "text-foreground"}`}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PlusShowcase({ onScene, initial = 0 }: { onScene?: (scene: PlusScene, seen: number) => void; initial?: number }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(initial);
  const [round, setRound] = useState(0);
  const seen = useRef(new Set<PlusScene>());
  const scene = PLUS_SCENES[index].key;
  useEffect(() => {
    if (reduced) return;
    if (!seen.current.has(scene)) { seen.current.add(scene); onScene?.(scene, seen.current.size); }
    const timer = setTimeout(() => { setIndex(i => (i + 1) % PLUS_SCENES.length); setRound(r => r + 1); }, PLUS_SCENE_MS + 250);
    return () => clearTimeout(timer);
  }, [reduced, scene, round, onScene]);
  const pick = useCallback((key: PlusScene) => { setIndex(PLUS_SCENES.findIndex(s => s.key === key)); setRound(r => r + 1); }, []);

  if (reduced) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="items-center">
        <View className="w-full max-w-xs flex-row flex-wrap justify-center gap-3">
          {PLUS_SCENES.map((s, i) => (
            <View key={s.key} className="w-[46%] gap-1.5">
              <View className="aspect-square overflow-hidden rounded-[20px]" style={{ transform: [{ rotate: `${[-2, 2, 1.5, -1.5][i]}deg` }] }}><Illustration name={ART[s.key]} square /></View>
              <Text className="text-center text-h5 text-foreground">{TITLES[s.key]}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const Scene = SCENES[scene];
  return (
    <View className="items-center gap-4">
      <View style={{ width: PW + 40, height: PH + 8 }} className="items-center justify-center">
        <Sunrays size={PH + 30} />
        <ConfettiBurst delay={350} />
        <View>
          <Phone width={PW} height={PH}>
            <View key={`${scene}:${round}`} style={{ width: IW, height: IH }}>
              <Scene />
              <View className="absolute bottom-3 self-center rounded-full bg-foreground/80 px-3 py-1">
                <Text className="text-caption text-background">{TITLES[scene]}</Text>
              </View>
              <Text className="absolute left-3 top-2 text-[11px] text-muted-foreground">Example</Text>
            </View>
          </Phone>
          <PlusStamp />
        </View>
      </View>
      <SceneChips current={scene} onPick={pick} />
    </View>
  );
}
