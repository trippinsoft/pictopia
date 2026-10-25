import { View, Linking } from "react-native";
import { Page, Text, Button } from "@/components/pictopia/ui";
export default function Help() {
  const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  return (
    <Page title="A little help">
      <View className="mx-auto max-w-2xl gap-6">
        {[
          [
            "How do I delete photos?",
            "Swipe left to set items aside. Open the queue, review your choices, then request deletion. Your device asks for authorization. Nothing is deleted while you swipe.",
          ],
          [
            "Why didn’t my free storage change?",
            "Deleted files may remain in Recently Deleted or Trash. Pictopia shows estimates from known file sizes, not a promise of immediate free space.",
          ],
          [
            "Why are some photos missing?",
            "Pictopia sees only authorized media. Cloud originals must be downloaded in Photos before local analysis. You can change access in Settings.",
          ],
          [
            "Can I use Pictopia in a browser?",
            "Yes: choose your own files and try swiping, zoom, video playback, undo, and resumable progress. Original-file deletion and store purchases require the native app.",
          ],
          [
            "What does Smart Clean detect?",
            "Exact duplicates use SHA-256 hashes of accessible originals. Similar groups use a 64-bit difference hash within a two-minute capture window. Blur uses an edge-sharpness heuristic. These suggestions need your review.",
          ],
          [
            "Where are my favorites?",
            "Favorites marked here are local Pictopia preferences. They don’t change the favorite flag in your device’s Photos app. Existing iOS favorites are also excluded by default when their metadata is available.",
          ],
        ].map(([title, body]) => (
          <View key={title}>
            <Text className="mb-3 text-h3 text-foreground">{title}</Text>
            <Text className="text-body leading-7 text-muted-foreground">{body}</Text>
          </View>
        ))}
        {email ? (
          <Button
            onPress={() => void Linking.openURL(`mailto:${email}?subject=Pictopia%20support`)}
          >
            Contact support
          </Button>
        ) : (
          <Text className="rounded-2xl bg-accent p-5 text-body leading-6 text-muted-foreground">
            The publisher’s support contact will appear here before release.
          </Text>
        )}
      </View>
    </Page>
  );
}
