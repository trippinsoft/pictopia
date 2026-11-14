const listeners = new Set<() => void>();
export const rewardEvents = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  notify() { for (const listener of listeners) listener(); },
};
