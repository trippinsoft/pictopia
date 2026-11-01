import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/pictopia/art-list";
import { PitStopMenu } from "@/components/pictopia/pit-stop-menu";
import { Text } from "@/components/pictopia/ui";

export default function PitStops() {
  return <SafeAreaView className="flex-1 bg-background">
    <ScrollView><View className="mx-auto w-full max-w-md px-6 pb-10">
      <ScreenHeader title="Pit Stops" subtitle="A little play along the way." fallback="/(tabs)/explore" />
      <View className="mt-7"><PitStopMenu /></View>
      <Text className="mt-5 text-center text-caption leading-5 text-muted-foreground">Your photos, a fresh way to see them. Playing never changes or deletes a photo.</Text>
    </View></ScrollView>
  </SafeAreaView>;
}
