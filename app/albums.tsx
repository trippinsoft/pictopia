import { ScreenHeader } from "@/components/pictopia/navigation-header";
import { useEffect, useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, Loading, Text } from "@/components/pictopia/ui";
import { useLift } from "@/components/pictopia/playful";
import { albumService } from "@/services/albums";
import type { AlbumSummary } from "@/services/albums.types";
import { albumsLabel } from "@/lib/pictopia/albums";

/** Every album (iOS) or folder (Android), alphabetically. Each opens as a collection in the
 * shared review; membership is read live when it opens. */
export default function Albums() {
  const lift = useLift(3);
  const label = albumsLabel(Platform.OS);
  const [albums, setAlbums] = useState<AlbumSummary[]>();
  const [error, setError] = useState(false);
  useEffect(() => {
    void albumService.list().then(setAlbums).catch(() => setError(true));
  }, []);
  return <SafeAreaView className="flex-1 bg-background">
    <Stack.Screen options={{ title: label, headerShown: false }} />
    <View className="mx-auto w-full max-w-lg flex-1">
      <View className="px-5"><ScreenHeader title={label} fallback="/(tabs)/explore" /></View>
      {error ? <Text className="p-6 text-body text-destructive">{`Your ${label.toLowerCase()} couldn’t be read. Check photo access and try again.`}</Text>
        : !albums ? <Loading />
        : <FlatList
          data={albums}
          keyExtractor={a => a.id}
          contentContainerStyle={listStyle}
          ListEmptyComponent={<Text className="p-6 text-center text-body text-muted-foreground">{`No ${label.toLowerCase()} with photos or videos yet.`}</Text>}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.count} items`} onPress={() => router.push({ pathname: "/collection-review", params: { scope: `album:${item.id}`, title: item.title } })} style={lift} className="mb-2.5 min-h-16 flex-row items-center gap-3 rounded-[18px] bg-card px-4 py-3 active:opacity-80">
            <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sun-soft"><Icon name={item.kind === "folder" ? "Folder" : "BookImage"} size={20} className="text-foreground" /></View>
            <Text className="min-w-0 flex-1 text-h4 text-foreground">{item.title}</Text>
            <Text className="text-caption text-muted-foreground">{item.count.toLocaleString()}</Text>
            <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
          </Pressable>}
        />}
    </View>
  </SafeAreaView>;
}
const listStyle = { padding: 16, paddingBottom: 32 };
