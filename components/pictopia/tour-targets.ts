import type { View } from "react-native";

/** Real on-screen elements the Home tour points at (tab icons, Home's postcards). Elements
 * register themselves with a callback ref; the tour measures them only while it is showing, so
 * nothing here feeds back into any layout. */
export type TourRect = { x: number; y: number; width: number; height: number };
const targets = new Map<string, View>();
const callbacks = new Map<string, (view: View | null) => void>();

export function tourTarget(name: string) {
  let cb = callbacks.get(name);
  if (!cb) {
    cb = (view: View | null) => { if (view) targets.set(name, view); else targets.delete(name); };
    callbacks.set(name, cb);
  }
  return cb;
}

export function measureTarget(name: string): Promise<TourRect | undefined> {
  const view = targets.get(name);
  if (!view) return Promise.resolve(undefined);
  return new Promise(resolve => {
    try {
      view.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : undefined));
    } catch {
      resolve(undefined);
    }
  });
}
