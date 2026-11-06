import { useCallback, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { repository } from "@/services/repository";
import { observePhotoEncounter } from "@/lib/pictopia/photo-encounter";

/** Count only the loaded foreground card, never preloads, placeholders or background tabs. */
export function usePhotoEncounter(id: string | undefined, ready: boolean, sessionId?: string, onEncounter?: (displayedAt: number) => Promise<unknown>, onError?: (message: string) => void) {
  // Provider/session refreshes must not reset the dwell timer or launch duplicate writes.
  const callbacks = useRef({ onEncounter, onError });
  callbacks.current = { onEncounter, onError };
  useFocusEffect(useCallback(() => {
    if (!id || !ready) return;
    const observer = observePhotoEncounter({
      save: displayedAt => callbacks.current.onEncounter ? callbacks.current.onEncounter(displayedAt) : repository.encounter(id, sessionId, displayedAt),
      onError: () => callbacks.current.onError?.("Your explored progress couldn’t be saved. Reopen this photo to try again."),
    });
    const doc = Platform.OS === "web" ? globalThis.document : undefined;
    const update = () => {
      observer.setVisible(AppState.currentState === "active" && (!doc || doc.visibilityState === "visible"));
    };
    update();
    const sub = AppState.addEventListener("change", update);
    doc?.addEventListener("visibilitychange", update);
    return () => { observer.dispose(); sub.remove(); doc?.removeEventListener("visibilitychange", update); };
  }, [id, ready, sessionId]));
}
