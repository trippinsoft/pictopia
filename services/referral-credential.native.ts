import * as SecureStore from 'expo-secure-store';
export const referralCredential = {
  read: (id: string) => SecureStore.getItemAsync(`pictopia.referral.${id}`),
  write: (id: string, token: string) => SecureStore.setItemAsync(`pictopia.referral.${id}`, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
};
