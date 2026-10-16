import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Public client IDs from mobile/.env.local (ignored by Git). Client IDs are not
// secrets: Google sends them to every device. The Web client's secret lives only
// in the Supabase dashboard.
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
if (!webClientId || !iosClientId) {
  throw new Error('Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in mobile/.env.local');
}

// Default scopes (openid, email, profile) are enough: Supabase needs only the ID token.
GoogleSignin.configure({ webClientId, iosClientId });

export { GoogleSignin };
