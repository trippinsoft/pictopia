import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Button, Icon, Page, Text } from '@/components/pictopia/ui';
import { referralStore } from '@/services/referrals';
import { walletCredits, type ReferralWallet } from '@/lib/pictopia/referral-wallet';
import { useTheme } from '@/theming/ThemeProvider';

export default function Referrals() {
  const { theme } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const inputFocused = useRef(false);
  const redemptionY = useRef(0);
  const revealRedemption = useCallback(() => {
    if (inputFocused.current) scroll.current?.scrollTo({ y: Math.max(0, redemptionY.current - 12), animated: true });
  }, []);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', revealRedemption);
    return () => shown.remove();
  }, [revealRedemption]);
  const [wallet, setWallet] = useState<ReferralWallet>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  useFocusEffect(useCallback(() => {
    let alive = true;
    setSyncing(true);
    void referralStore.load().then(saved => { if (alive) setWallet(saved); }).catch(() => { if (alive) setError('Couldn’t read saved credits. Try again.'); });
    void referralStore.sync().then(saved => { if (alive) { setWallet(saved); setError(undefined); } }).catch(e => { if (alive) setError((e as Error).message); }).finally(() => { if (alive) setSyncing(false); });
    return () => { alive = false; };
  }, []));
  async function action(work: () => Promise<void>) {
    setBusy(true); setMessage(undefined); setError(undefined);
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.fill} enabled={Platform.OS !== 'web'} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <Page title="Invite a friend" scroll={false}>
    <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onLayout={revealRedemption}>
    <View className="mx-auto w-full max-w-md gap-5 pt-5">
      <View className="items-center gap-2">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-card"><Icon name="Handshake" size={24} className="text-tomato" /></View>
        <Text className="text-center text-h2 text-foreground">1,000 reviews each</Text>
        <Text className="text-center text-body leading-6 text-muted-foreground">Share your code. When a friend redeems it, you both get 1,000 bonus photo or video reviews.</Text>
      </View>
      <View className="items-center gap-2 rounded-[20px] bg-card p-5">
        <Text className="text-caption text-muted-foreground">Available bonus reviews</Text>
        <Text className="text-h1 text-foreground">{wallet ? walletCredits(wallet).toLocaleString() : '…'}</Text>
        <Text className="text-center text-caption leading-5 text-muted-foreground">Never expire · Saved credits work offline</Text>
      </View>
      <View className="gap-3 rounded-[20px] bg-card p-5">
        <Text className="text-h5 text-foreground">{!wallet?.code && syncing ? 'Getting your code…' : 'Your referral code'}</Text>
        <Text selectable className="text-center text-h2 tracking-widest text-foreground">{wallet?.code ?? (syncing ? '…' : 'Connect to get your code')}</Text>
        <View className="flex-row gap-3">
          <View className="flex-1"><Button icon="Copy" disabled={!wallet?.code || busy} onPress={() => void action(async () => { const copied = await Clipboard.setStringAsync(wallet!.code!); if (!copied) throw Error('Couldn’t copy. You can select and copy the code above.'); setMessage('Code copied.'); })}>Copy</Button></View>
          <View className="flex-1"><Button icon="Share2" disabled={!wallet?.code || busy} onPress={() => void action(async () => { await Share.share({ message: `Try Pictopia! Redeem my code ${wallet!.code!} in Settings → Invite a friend and we both get 1,000 bonus photo/video reviews.` }); })}>Share</Button></View>
        </View>
      </View>
      <View onLayout={event => { redemptionY.current = event.nativeEvent.layout.y; }} className="gap-3 rounded-[20px] bg-card p-5">
        <Text className="text-h5 text-foreground">Have a friend’s code?</Text>
        {wallet?.redeemed ? <Text className="text-body text-muted-foreground">Your referral reward is saved. Each installation can redeem one code.</Text> : <>
          <TextInput onFocus={() => { inputFocused.current = true; revealRedemption(); }} onBlur={() => { inputFocused.current = false; }} accessibilityLabel="Friend’s referral code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={7} placeholder="7-character code" placeholderTextColor={theme.colors.mutedForeground} editable={!busy} className="min-h-12 rounded-xl border border-border bg-background px-4 text-body text-foreground" />
          <Button disabled={busy || !code.trim()} onPress={() => void action(async () => { setWallet(await referralStore.redeem(code)); Keyboard.dismiss(); setCode(''); setMessage('1,000 bonus reviews added for you and your friend.'); })}>{busy ? 'Connecting…' : 'Redeem'}</Button>
        </>}
      </View>
      {!!message && <Text accessibilityRole="alert" className="text-center text-body text-foreground">{message}</Text>}
      {!!error && <View className="gap-2"><Text accessibilityRole="alert" className="text-center text-body text-destructive">{error}</Text><Button secondary disabled={busy} onPress={() => void action(async () => { setWallet(await referralStore.sync()); })}>Try again</Button></View>}
      <Text className="text-center text-caption leading-5 text-muted-foreground">Daily and streak reviews are used first, then bonus reviews. Pictopia+ is unlimited and saves your bonus balance. No account needed. Codes and credits belong to this installation.</Text>
    </View>
    </ScrollView>
    </Page>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
});
