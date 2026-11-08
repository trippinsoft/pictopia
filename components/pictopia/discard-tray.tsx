import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";
import { AdventureTheme } from "./adventure-theme";
import { MediaImage } from "./media-image";
import { Button, Icon, Text } from "./ui";
import type { Media } from "@/lib/pictopia/types";

/** Peeking neighbours on both sides, so it is obvious the tray scrolls sideways. */
const PEEK = 44;
const GAP = 12;
/** The pending-discard tray: the photographs this adventure has marked for deletion, one at a
 * time, each a swipe away from being restored. Not the device's trash: nothing here has been
 * deleted, and nothing is deleted from here. */
export function DiscardTray({
  visible,
  ids,
  media,
  busy,
  onRestore,
  onClose,
  onReview,
}: {
  visible: boolean;
  /** Marked photographs in the adventure's own order. */
  ids: string[];
  media: Record<string, Media>;
  busy: boolean;
  onRestore(id: string): void;
  onClose(): void;
  /** Opens Ready to delete, where marks can be confirmed. */
  onReview?(): void;
}) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const list = useRef<FlatList<string>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [inspecting, setInspecting] = useState<string>();
  const item = Math.max(160, width - PEEK * 2);
  const interval = item + GAP;
  const frame = Math.min(380, Math.max(220, Math.round(height * 0.4)));
  const selected = ids[Math.min(index, ids.length - 1)];
  // Restoring the last photograph, or arriving with fewer than before, keeps the tray on a
  // real photograph instead of an empty slot.
  useEffect(() => {
    if (index < ids.length || !ids.length) return;
    const last = ids.length - 1;
    setIndex(last);
    list.current?.scrollToOffset({ offset: last * interval, animated: !reduced });
  }, [ids.length, index, interval, reduced]);
  useEffect(() => {
    if (!visible) setInspecting(undefined);
  }, [visible]);
  const taken = selected && media[selected]?.created;
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "slide"}
      onRequestClose={onClose}
    >
      <AdventureTheme enabled>
        <View className="flex-1 justify-end bg-overlay/70">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the trash"
            onPress={onClose}
            className="flex-1"
          />
          <SafeAreaView edges={["bottom"]} className="rounded-t-3xl bg-card">
            <View className="px-5 pb-3 pt-4">
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text accessibilityRole="header" className="text-h3 text-foreground">
                  {ids.length ? `Discarded (${ids.length})` : "Discarded"}
                </Text>
                <Text className="mt-1 text-caption text-muted-foreground">
                  Nothing is deleted until you confirm.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close the trash"
                onPress={onClose}
                className="h-11 w-11 items-center justify-center"
              >
                <Icon name="X" size={20} className="text-muted-foreground" />
              </Pressable>
            </View>
            {!ids.length ? (
              <View className="items-center gap-2 py-10">
                <Icon name="Trash2" size={26} className="text-muted-foreground" />
                <Text className="text-body text-foreground">Nothing discarded yet.</Text>
                <Text className="text-center text-caption text-muted-foreground">
                  Swipe a photo or video sideways and it lands here.
                </Text>
              </View>
            ) : (
              <View className="pb-2" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
                {width > 0 && (
                  <FlatList
                    ref={list}
                    horizontal
                    data={ids}
                    keyExtractor={(id) => id}
                    extraData={`${index}:${ids.length}`}
                    accessibilityLabel="Discarded photographs. Swipe sideways to review them."
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={interval}
                    snapToAlignment="start"
                    disableIntervalMomentum
                    decelerationRate="fast"
                    initialNumToRender={2}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    contentContainerStyle={{ paddingHorizontal: PEEK - GAP / 2 }}
                    getItemLayout={(_data, position) => ({
                      length: interval,
                      offset: interval * position,
                      index: position,
                    })}
                    onMomentumScrollEnd={(event) =>
                      setIndex(
                        Math.max(
                          0,
                          Math.min(
                            ids.length - 1,
                            Math.round(event.nativeEvent.contentOffset.x / interval),
                          ),
                        ),
                      )
                    }
                    onScrollEndDrag={(event) =>
                      setIndex(
                        Math.max(
                          0,
                          Math.min(
                            ids.length - 1,
                            Math.round(event.nativeEvent.contentOffset.x / interval),
                          ),
                        ),
                      )
                    }
                    renderItem={({ item: id, index: position }) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: id === selected }}
                        accessibilityLabel={`Discarded photograph ${position + 1} of ${ids.length}. Tap to see it larger.`}
                        onPress={() => setInspecting(id)}
                        style={{ width: item, height: frame, marginHorizontal: GAP / 2 }}
                        className="overflow-hidden rounded-2xl bg-secondary"
                      >
                        {media[id] ? (
                          <MediaImage media={media[id]} fit="contain" style={styles.fill} />
                        ) : (
                          <View className="flex-1 items-center justify-center px-6">
                            <Icon name="CloudOff" size={24} className="text-muted-foreground" />
                            <Text className="mt-2 text-center text-caption text-muted-foreground">
                              This one can’t be shown right now. Restoring still works.
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    )}
                  />
                )}
                <View className="mt-3 flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="text-caption text-muted-foreground">
                      {index + 1} of {ids.length}
                      {taken
                        ? ` · ${new Date(taken).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}`
                        : ""}
                    </Text>
                  </View>
                  <View>
                    <Button
                      secondary
                      icon="Undo2"
                      disabled={busy || !selected}
                      onPress={() => selected && onRestore(selected)}
                    >
                      Restore
                    </Button>
                  </View>
                </View>
                {onReview && (
                  <View className="mt-3">
                    <Button icon="Trash2" disabled={busy} onPress={onReview}>
                      Review & delete
                    </Button>
                  </View>
                )}
              </View>
            )}
            </View>
          </SafeAreaView>
          {inspecting && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the larger preview"
              onPress={() => setInspecting(undefined)}
              style={StyleSheet.absoluteFill}
              className="bg-background/95 p-4"
            >
              {media[inspecting] ? (
                <MediaImage media={media[inspecting]} fit="contain" style={styles.fill} />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-body text-muted-foreground">
                    This item can’t be shown right now.
                  </Text>
                </View>
              )}
              <Text className="pt-3 text-center text-caption text-muted-foreground">
                Tap anywhere to go back
              </Text>
            </Pressable>
          )}
        </View>
      </AdventureTheme>
    </Modal>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
