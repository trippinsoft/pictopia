import { Redirect } from "expo-router";

/** Choosing an Adventure now lives in the Explore tab. */
export default function ChooseAdventure() {
  return <Redirect href="/(tabs)/explore" />;
}
