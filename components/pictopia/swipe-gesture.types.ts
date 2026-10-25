import React from "react";
import { SharedValue } from "react-native-reanimated";
export interface SwipeGestureProps {
  children: React.ReactElement;
  x: SharedValue<number>;
  y: SharedValue<number>;
  enabled: boolean;
  onRelease: (offset: number) => void;
}
