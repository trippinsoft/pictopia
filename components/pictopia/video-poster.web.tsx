import React from "react";
import { VideoPosterProps } from "./video-poster.types";
export function VideoPoster({ uri, fit, onReady, onFailed }: VideoPosterProps) {
  const videoStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: fit,
    pointerEvents: "none",
  };
  return (
    <video
      src={uri}
      muted
      playsInline
      preload="metadata"
      onLoadedData={onReady}
      onError={onFailed}
      style={videoStyle}
    />
  );
}
