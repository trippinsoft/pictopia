import { storage } from './storage';
export const referralCredential = {
  read: async (id: string) => (await storage.getValue<string>(`referralCredential:${id}`)) ?? null,
  write: (id: string, token: string) => storage.setValue(`referralCredential:${id}`, token),
};
