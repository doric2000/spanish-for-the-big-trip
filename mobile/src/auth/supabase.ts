import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { createChunkedStorage } from './chunked-storage';

// Public values from mobile/.env.local (ignored by Git). Never put a secret or
// service-role key here: everything in the app can be read by its users, so
// Row Level Security in the database is what protects the data.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.local');
}

// Readable only while the iPhone is unlocked, and never copied to another device.
const keychain = {
  getItemAsync: (key: string) => SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
};

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: createChunkedStorage(keychain),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // a native app has no URL to read a session from
  },
});

// Refresh the session token only while the app is on screen.
AppState.addEventListener('change', state => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
