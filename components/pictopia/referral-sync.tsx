import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { referralStore } from '@/services/referrals';
/** Best-effort synchronization never gates library loading or local review. */
export function ReferralSync({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    const sync = () => { if (AppState.currentState === 'active') void referralStore.sync().catch(() => {}); };
    sync();
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') sync(); });
    const timer = setInterval(sync, 5 * 60 * 1000);
    if (Platform.OS === 'web') globalThis.addEventListener?.('online', sync);
    return () => { subscription.remove(); clearInterval(timer); if (Platform.OS === 'web') globalThis.removeEventListener?.('online', sync); };
  }, [ready]);
  return null;
}
