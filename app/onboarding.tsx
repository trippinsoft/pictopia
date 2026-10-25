import React, { useState } from "react";
import { View, Platform, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Page, Text, Icon, Button } from "@/components/pictopia/ui";
import { Collection, SessionMinutes } from "@/lib/pictopia/types";
import { usePictopia } from "@/components/pictopia/provider";
const steps = [
  {
    icon: "MoveHorizontal" as const,
    title: "Keep the memories. Lose the clutter.",
    description:
      "Swipe right to keep. Swipe left to set aside. Prefer tapping? Use the Keep and Set aside buttons. Every choice is saved as you go.",
  },
  {
    icon: "ShieldCheck" as const,
    title: "Your photos. Your say.",
    description:
      "Nothing is deleted while you swipe. You review set-aside items and confirm before your device asks for deletion. Photos stay on your device, with no account needed.",
  },
];
export default function Onboarding() {
  const [step, setStep] = useState(0);
  const app = usePictopia();
  const params = useLocalSearchParams<{ collection?: string; minutes?: string }>();
  const minutes: SessionMinutes = params.minutes === "2" ? 2 : params.minutes === "10" ? 10 : 5;
  const collection: Collection = [
    "quick",
    "memory",
    "best",
    "recent",
    "today",
    "random",
    "screenshots",
    "videos",
    "favorites",
  ].includes(params.collection ?? "")
    ? (params.collection as Collection)
    : "quick";
  const item = steps[step];
  async function next() {
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    const connected = await app.connect();
    if (connected) {
      await app.updatePrefs({ onboarded: true });
      await app.start(collection, minutes);
      router.replace("/(tabs)/swipe");
    }
  }
  return (
    <Page title="Welcome to Pictopia">
      <View className="mx-auto max-w-lg items-center py-8">
        <View className="mb-9 h-40 w-40 items-center justify-center rounded-[40px] bg-accent">
          <Icon name={item.icon} size={70} className="text-primary" />
        </View>
        <Text className="text-h1 text-center text-foreground">{item.title}</Text>
        <Text className="mb-9 mt-5 text-body text-center leading-7 text-muted-foreground">
          {item.description}
        </Text>
        {step === steps.length - 1 && Platform.OS === "web" && (
          <Text className="mb-6 text-body text-center leading-6 text-muted-foreground">
            In your browser, choose your own photos and videos. File dates use the last-modified
            date. Original files are never deleted here.
          </Text>
        )}
        <View className="mb-8 flex-row gap-2">
          {steps.map((_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${i === step ? "w-7 bg-primary" : "w-2 bg-border"}`}
            />
          ))}
        </View>
        <Button disabled={app.busy || !app.ready} onPress={() => void next()} icon="ArrowRight">
          {app.busy
            ? "Connecting…"
            : step === steps.length - 1
              ? Platform.OS === "web"
                ? "Choose photos & videos"
                : "Allow photo access"
              : "Continue"}
        </Button>
        {!!app.syncProgress && (
          <Text className="mt-4 text-body text-muted-foreground">{app.syncProgress}</Text>
        )}
        <Pressable onPress={() => router.replace("/(tabs)/home")} className="mt-5 p-4">
          <Text className="text-body text-muted-foreground">
            {step === steps.length - 1 ? "Maybe later" : "Explore first"}
          </Text>
        </Pressable>
      </View>
    </Page>
  );
}
