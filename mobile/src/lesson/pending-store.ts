import * as SecureStore from 'expo-secure-store';
import type { PendingAttempt } from './opening-data';

// One unconfirmed tap per unit, in the iOS Keychain next to the sign-in session, so a
// resend after the app was closed reuses the same requestId. Small (well under the
// ~2048-byte Keychain limit), and holds no answers or tokens.
const keyFor = (unitId: string) => `pending-attempt.${unitId}`;

// Storage failures never block the lesson: the request still lives in memory.
export async function readPending(unitId: string) {
  try { return await SecureStore.getItemAsync(keyFor(unitId)); } catch { return null; }
}
export async function savePending(pending: PendingAttempt) {
  try { await SecureStore.setItemAsync(keyFor(pending.unitId), JSON.stringify(pending)); } catch { /* memory only */ }
}
export async function clearPending(unitId: string) {
  try { await SecureStore.deleteItemAsync(keyFor(unitId)); } catch { /* nothing to restore later */ }
}
