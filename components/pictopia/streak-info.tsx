import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Icon, Text } from "./ui";

/** A stationary backdrop and dialog: neither slides with the screen. */
export function StreakInfo() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="About day streak rewards" onPress={() => setOpen(true)} className="h-11 w-11 items-center justify-center rounded-full active:opacity-60">
      <Icon name="Info" size={19} className="text-muted-foreground" />
    </Pressable>
    <Modal visible={open} transparent animationType="none" onRequestClose={close}>
      <View className="flex-1 bg-black/50">
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss streak information" onPress={close} style={StyleSheet.absoluteFill} />
        <SafeAreaView pointerEvents="box-none" className="flex-1 items-center justify-center p-5">
          <View accessibilityViewIsModal onAccessibilityEscape={close} className="max-h-full w-full max-w-sm overflow-hidden rounded-[28px] border border-border bg-card">
            <ScrollView contentContainerClassName="gap-4 p-6" bounces={false}>
              <View className="flex-row items-center gap-3">
                <Icon name="Flame" size={26} className="text-sun" />
                <Text accessibilityRole="header" className="flex-1 text-h2 text-foreground">Keep your streak going</Text>
              </View>
              <Text className="text-body leading-6 text-foreground">Start with 100 free reviews a day. Each consecutive day adds 25 to your daily allowance, up to 100 extra reviews.</Text>
              <View className="gap-2 rounded-2xl bg-sun-soft p-4">
                {["Day 1 · 100 reviews", "Day 2 · 125 reviews (+25)", "Day 3 · 150 reviews (+50)", "Day 4 · 175 reviews (+75)", "Day 5 onward · 200 reviews (+100)"].map(line => <Text key={line} className="text-body text-foreground">{line}</Text>)}
              </View>
              <Text className="text-body leading-6 text-muted-foreground">Review 10 distinct photos or videos, or confirm a deletion, to complete a day. Completing today unlocks tomorrow’s allowance.</Text>
              <Text className="text-caption leading-5 text-muted-foreground">Daily reviews reset each day and don’t roll over. A missed day resets the allowance to 100 unless you restore your streak. Pictopia+ includes unlimited reviews.</Text>
              <Button onPress={close}>Got it</Button>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}
