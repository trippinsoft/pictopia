import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "./ui";
import { useTheme } from "@/theming/ThemeProvider";

export function ProgressRing({ percent, large = false, size: sized }: { percent?: number; large?: boolean; size?: number }) {
  const { theme } = useTheme();
  const size = sized ?? (large ? 144 : 48);
  const strokeWidth = sized ? 10 : large ? 6 : 3;
  const radius = size / 2 - (sized ? 6 : large ? 5 : 4);
  const circumference = Math.PI * 2 * radius;
  return <View className="items-center justify-center" style={{ width: size, height: size }}>
    <Svg width={size} height={size} style={overlayStyle}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.border} strokeWidth={strokeWidth} fill="none" />
      {percent !== undefined && percent > 0 && <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.grass ?? theme.colors.primary} strokeWidth={strokeWidth} fill="none" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - percent / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round" />}
    </Svg>
    <Text className={large || sized ? "text-h2 text-foreground" : "text-caption text-foreground"}>{percent === undefined ? "—" : `${percent}%`}</Text>
  </View>;
}

const overlayStyle = { position: "absolute" as const };
