import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SessionContext } from '../auth/session-context';
import { useSession } from '../auth/use-session';
import { theme } from '../theme';

// Keep the D1 splash (app.json) up until we know whether someone is signed in,
// so the app opens straight on the right screen. Called at load, before any render.
void SplashScreen.preventAutoHideAsync();

// Root of every screen. Google or Apple sign-in is required; there is no guest
// mode, so signed-out users can only reach the sign-in route.
export default function RootLayout() {
  const session = useSession();
  // The session read always settles (a failure counts as signed out), so this cannot hang.
  useEffect(() => { if (session !== undefined) SplashScreen.hide(); }, [session]);
  if (session === undefined) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>;
  }
  const signedIn = session !== null;
  return <SessionContext.Provider value={session}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account" />
        <Stack.Screen name="recorder" />
      </Stack.Protected>
    </Stack>
  </SessionContext.Provider>;
}
