import React, { useState } from "react";
import { View, ViewProps, Platform, ActivityIndicator } from "react-native";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Text, Empty } from "./ui";
import { LivePhotoProps } from "./live-photo.types";
interface NativeProps extends ViewProps {
  assetId: string;
  onReady: () => void;
  onUnavailable: (event: { nativeEvent: { message: string } }) => void;
}
const available = Platform.OS === "ios" && !!requireOptionalNativeModule("FlickWellAnalysis");
const NativeLivePhoto = available
  ? requireNativeViewManager<NativeProps>("FlickWellAnalysis")
  : null;
const fill = { flex: 1 };
export function LivePhoto({ id }: LivePhotoProps) {
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  if (!NativeLivePhoto)
    return (
      <Empty
        icon="Image"
        title="Motion needs the native iOS app"
        description="Use the still-image preview here."
      />
    );
  return (
    <View style={fill}>
      {error ? (
        <Empty icon="CloudOff" title="Motion isn’t available locally" description={error} />
      ) : (
        <NativeLivePhoto
          assetId={id}
          style={fill}
          onReady={() => setLoading(false)}
          onUnavailable={(e) => {
            setLoading(false);
            setError(e.nativeEvent.message);
          }}
        />
      )}
      {loading && (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}
      <Text className="p-3 text-caption text-center text-muted-foreground">
        Tap the Live Photo to replay its motion.
      </Text>
    </View>
  );
}
