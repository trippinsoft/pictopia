import React from "react";
import { SharedValue } from "react-native-reanimated";
export interface SwipeGestureProps {
  children: React.ReactElement;
  x: SharedValue<number>;
  y: SharedValue<number>;
  enabled: boolean;
  threshold: number;
  /** Release past the threshold or a fast flick; 1 is right, -1 is left. */
  onCommit: (direction: 1 | -1) => void;
  /** Release short of a commit; the card should spring back. */
  onCancel: () => void;
}
