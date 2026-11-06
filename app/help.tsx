import { useState } from "react";
import { reviewGuidance } from "@/services/review-guidance";
import { View, Linking } from "react-native";
import { Page, Text, Button } from "@/components/pictopia/ui";
export default function Help() {
  const [replayMessage, setReplayMessage] = useState<string>();
  const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  return (
    <Page title="A little help" fallback="/settings">
      <View className="mx-auto max-w-2xl gap-6">
        <Button secondary onPress={() => { void reviewGuidance.reset().then(() => setReplayMessage("The tips will appear in your next adventure review, using your own photos.")).catch(() => setReplayMessage("The instructions couldn’t be reset. Please try again.")); }}>Replay review instructions</Button>
        {replayMessage && <Text accessibilityLiveRegion="polite" className="text-body text-muted-foreground">{replayMessage}</Text>}
        {[
          [
            "How do I delete photos?",
            "In an adventure, swipe either sideways direction to mark a photo for deletion. Scroll freely without making decisions; use the thumbnails to revisit and Restore. Open the queue, review your choices, then request deletion. Your device asks for authorization. Nothing is deleted while you swipe.",
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
            "The heart in Adventure review updates Photos favorites on iOS or device MediaStore favorites on Android 11 and later, after any required system approval. Android favorites do not imply Google Photos cloud synchronization. Browser favorites and older Android versions are unsupported. Classic review’s older app favorites remain local to Pictopia.",
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
