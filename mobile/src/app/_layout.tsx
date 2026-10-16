import { Karantina_700Bold } from '@expo-google-fonts/karantina';
import { Rubik_400Regular, Rubik_500Medium, Rubik_700Bold, Rubik_800ExtraBold } from '@expo-google-fonts/rubik';
import { SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SessionContext } from '../auth/session-context';
import { useSession } from '../auth/use-session';
import { retro, theme } from '../theme';

// Keep the D1 splash (app.json) up until we know whether someone is signed in and the
// retro fonts are ready, so the app opens straight on the right screen in its real
// typeface. Called at load, before any render.
void SplashScreen.preventAutoHideAsync();

// Root of every screen. Google or Apple sign-in is required; there is no guest
// mode, so signed-out users can only reach the sign-in route.
export default function RootLayout() {
  const session = useSession();
  const [fontsLoaded, fontError] = useFonts({
    Karantina_700Bold, Rubik_400Regular, Rubik_500Medium, Rubik_700Bold, Rubik_800ExtraBold, SpaceMono_700Bold,
  });
  // Both settle: the session read treats a failure as signed out, and a font error falls
  // back to the system font. So the splash cannot hang.
  const ready = session !== undefined && (fontsLoaded || fontError !== null);
  useEffect(() => { if (ready) SplashScreen.hide(); }, [ready]);
  if (!ready) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: retro.colors.night }}>
      <ActivityIndicator color={retro.colors.gold} />
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
        <Stack.Screen name="lesson" />
        <Stack.Screen name="account" />
        <Stack.Screen name="recorder" />
      </Stack.Protected>
    </Stack>
  </SessionContext.Provider>;
}
