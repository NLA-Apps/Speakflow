import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
const key = 'speakingflow.local-user-id.v1';
export async function getLocalUserId(): Promise<string> {
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(key, created);
  return created;
}
