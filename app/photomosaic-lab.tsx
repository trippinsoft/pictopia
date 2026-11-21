import { useState } from "react";
import { Image } from "expo-image";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, Share, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePictopia } from "@/components/pictopia/provider";
import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { Button, Page, Text } from "@/components/pictopia/ui";
import {
  benchmarkText, matchScore, memory, sampleSizes, seconds, sizeLabel,
  useMosaicLab, type SampleSize, type Treatment,
} from "@/components/pictopia/use-mosaic-lab";
import { mosaicScenes } from "@/lib/pictopia/mosaic-scenes";
import { mosaicNative, MosaicViewport } from "@/services/mosaic-lab";
import type { MosaicNativeService, MosaicViewportComponent } from "@/services/mosaic-lab.types";

const title = "Photomosaic Lab";
const fill = { flex: 1 };
const treatments = [
  { value: "natural", label: "Natural" },
  { value: "adjusted", label: "Soft color" },
] as const;

function Choices<T extends string | number>({
  options, selected, onChange, label, disabled,
}: {
  options: readonly { value: T; label: string }[];
  selected: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {options.map(option => {
        const checked = selected === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={`min-h-11 justify-center rounded-full px-3.5 py-2 ${checked ? "bg-primary" : "bg-secondary"} ${disabled ? "opacity-60" : "active:opacity-80"}`}
          >
            <Text className={`text-h6 ${checked ? "text-primary-foreground" : "text-secondary-foreground"}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Lab({
  native, Viewport,
}: {
  native: MosaicNativeService;
  Viewport: MosaicViewportComponent;
}) {
  const app = usePictopia();
  const lab = useMosaicLab(native);
  const [sample, setSample] = useState<SampleSize>(500);
  const [treatment, setTreatment] = useState<Treatment>("natural");
  const [actionError, setActionError] = useState<string>();
  const { result, scene, busy, viewer, inspection } = lab;
  const render = result?.rendered[scene];
  const report = result?.benchmark;
  const match = result?.matches.scenes[scene];
  const blocked = app.permission?.granted === false;
  const imageUri = render?.[treatment];

  async function allowAccess() {
    setActionError(undefined);
    try {
      if (app.permission?.canAskAgain === false) await Linking.openSettings();
      else await app.connect();
    } catch {
      setActionError("Photos access couldn’t be opened. Try allowing access in iPhone Settings.");
    }
  }

  async function shareReport() {
    try {
      setActionError(undefined);
      await Share.share({ message: benchmarkText(lab.history) });
    } catch {
      setActionError("The diagnostic report couldn’t be shared. Try again.");
    }
  }

  return (
    <Page title={title} fallback="/settings">
      <View className="gap-5 pt-3">
        <Text className="text-body leading-6 text-muted-foreground">
          Build a picture from your own photo thumbnails. All processing stays on this iPhone.
        </Text>
        <View className="gap-3 rounded-3xl border border-border bg-card p-4">
          <Text accessibilityRole="header" className="text-h4 text-foreground">Photo sample</Text>
          <Choices label="Photo sample size" options={sampleSizes.map(value => ({ value, label: sizeLabel(value) }))}
            selected={sample} onChange={setSample} disabled={!!busy} />
          {app.permission?.limited ? (
            <Text className="text-caption text-muted-foreground">Limited Photos access. Full library uses all photos you’ve shared with Pictopia.</Text>
          ) : null}
          {busy ? <Button secondary onPress={() => lab.reset()}>Cancel</Button> : blocked ? (
            <Button onPress={() => void allowAccess()}>
              {app.permission?.canAskAgain === false ? "Open iPhone Settings" : "Allow Photos access"}
            </Button>
          ) : (
            <Button onPress={() => void lab.build(sample)}>{result ? "Run again" : "Build mosaic"}</Button>
          )}
          {busy ? (
            <View className="flex-row items-center gap-2.5">
              <ActivityIndicator />
              <Text accessibilityLiveRegion="polite" className="flex-1 text-caption text-foreground">{busy}</Text>
            </View>
          ) : null}
          {lab.error || actionError ? (
            <Text accessibilityRole="alert" className="text-body text-destructive">{lab.error ?? actionError}</Text>
          ) : null}
        </View>

        {result && report && match ? (
          <>
            <View className="gap-3">
              <View className="gap-1">
                <Text accessibilityRole="header" className="text-h3 text-foreground">{mosaicScenes[scene].name}</Text>
                <Text className="text-caption text-muted-foreground">
                  {matchScore(match.score)} / 100 match · {match.unique.toLocaleString()} distinct photos
                </Text>
              </View>
              {imageUri ? (
                <>
                  <Pressable onPress={() => lab.setViewer(true)} accessibilityRole="button"
                    accessibilityLabel={`Open zoomable ${mosaicScenes[scene].name} mosaic`}
                    className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-card active:opacity-90">
                    <Image source={imageUri} contentFit="contain" cachePolicy="none" style={fill} />
                  </Pressable>
                  <Button secondary onPress={() => lab.setViewer(true)}>Zoom and inspect</Button>
                </>
              ) : (
                <View className="aspect-[4/3] items-center justify-center gap-3 rounded-2xl bg-card px-4">
                  <Text className="text-center text-body text-muted-foreground">{busy ?? "This scene hasn’t rendered."}</Text>
                  {!busy ? <Button secondary onPress={() => void lab.choose(scene)}>Try rendering again</Button> : null}
                </View>
              )}
              <Choices options={treatments} selected={treatment} onChange={setTreatment} label="Color treatment" />
              {render && render.missing > 0 ? (
                <Text className="text-caption text-muted-foreground">{render.missing} tiles became unavailable during rendering.</Text>
              ) : null}
            </View>
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-h4 text-foreground">Compare scenes</Text>
              <Text className="text-caption text-muted-foreground">Scores compare the natural tile colors with each scene’s target colors.</Text>
              <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {result.matches.scenes.map((option, index) => (
                  <Pressable key={mosaicScenes[index].name} accessibilityRole="button"
                    accessibilityState={{ selected: scene === index, disabled: !!busy }}
                    disabled={!!busy} onPress={() => void lab.choose(index)}
                    className={`min-h-14 flex-row items-center gap-3 border-border px-4 py-3 ${index ? "border-t" : ""} ${index === scene ? "bg-accent" : "active:opacity-70"}`}>
                    <View className="flex-1">
                      <Text className="text-body text-foreground">{mosaicScenes[index].name}</Text>
                      {index === result.matches.best ? <Text className="text-caption text-muted-foreground">Best natural match</Text> : null}
                    </View>
                    <Text className="text-h6 text-foreground">{matchScore(option.score)} / 100</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="gap-2 rounded-2xl border border-border bg-card p-4">
              <Text accessibilityRole="header" className="text-h4 text-foreground">Run diagnostics</Text>
              <Text className="text-body text-foreground">
                {report.analyzed.toLocaleString()} of {report.selected.toLocaleString()} analyzed · {report.available.toLocaleString()} accessible
              </Text>
              <Text className="text-caption leading-5 text-muted-foreground">
                {report.hits.toLocaleString()} cache hits · {(report.selected - report.analyzed).toLocaleString()} unavailable locally
                {"\n"}Thumbnail analysis {seconds(report.scanMs)} · Four-scene matching {seconds(report.matchMs)}
                {render ? `\nBoth treatments rendered in ${seconds(render.renderMs)}` : ""}
                {"\n"}Process memory {memory(report.startBytes)} at start · {memory(report.peakBytes)} sampled peak
              </Text>
            </View>
          </>
        ) : null}
        {lab.history.length > 0 ? (
          <Button secondary onPress={() => void shareReport()}>Share run diagnostics</Button>
        ) : null}
      </View>

      {imageUri && viewer ? (
        <Modal visible animationType="none" onRequestClose={inspection ? lab.closeTile : lab.closeViewer}>
          <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom", "left", "right"]}>
            <View className="px-5">
              <ScreenHeader title={inspection ? `Photo tile ${inspection.tile + 1}` : mosaicScenes[scene].name}
                backLabel={inspection ? "Back to mosaic" : "Close zoom viewer"}
                onBack={inspection ? lab.closeTile : lab.closeViewer} />
            </View>
            <View className="flex-1">
              <View className="flex-1" accessibilityElementsHidden={!!inspection} importantForAccessibility={inspection ? "no-hide-descendants" : "auto"}>
                <Viewport imageUri={imageUri} onTile={event => void lab.inspect(event.nativeEvent.x, event.nativeEvent.y)}
                  style={fill} />
                <View className="gap-3 px-5 pb-3 pt-2">
                  <Choices options={treatments} selected={treatment} onChange={setTreatment} label="Color treatment" />
                  <Text className="text-caption text-muted-foreground">Pinch or double-tap to zoom. Tap a tile to open its photo.</Text>
                </View>
              </View>
              {inspection ? (
                <View className="absolute inset-0 justify-center gap-3 bg-background p-5">
                  {inspection.uri ? (
                    <>
                      <Image source={inspection.uri} contentFit="contain" cachePolicy="none" style={fill}
                        accessibilityLabel="Original photo behind this tile" />
                      <Text className="text-caption text-muted-foreground">Original photo colors</Text>
                    </>
                  ) : inspection.error ? (
                    <Text accessibilityRole="alert" className="text-center text-body text-foreground">{inspection.error}</Text>
                  ) : (
                    <>
                      <ActivityIndicator />
                      <Text className="text-center text-caption text-foreground">Opening photo…</Text>
                    </>
                  )}
                </View>
              ) : null}
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
    </Page>
  );
}

export default function PhotomosaicLab() {
  const { devTools } = usePictopia();
  if (!devTools || !mosaicNative || !MosaicViewport) {
    return (
      <Page title={title} fallback="/settings">
        <View className="gap-2 rounded-2xl border border-border bg-card p-5">
          <Text accessibilityRole="header" className="text-h4 text-foreground">
            {!devTools ? "Developer tools are off" : "Open on iPhone"}
          </Text>
          <Text className="text-body leading-6 text-muted-foreground">
            {!devTools
              ? "This experiment is available in authorized developer builds."
              : Platform.OS === "ios"
                ? "Install a fresh iOS development build to run the mosaic with your photo library."
                : "Install an iOS development build on your iPhone to build a mosaic from your photos."}
          </Text>
        </View>
      </Page>
    );
  }
  return <Lab native={mosaicNative} Viewport={MosaicViewport} />;
}
