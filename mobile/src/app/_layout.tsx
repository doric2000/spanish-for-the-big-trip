import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SessionContext } from '../auth/session-context';
import { useSession } from '../auth/use-session';
import { theme } from '../theme';

// Root of every screen. Google or Apple sign-in is required; there is no guest
// mode, so signed-out users can only reach the sign-in route.
export default function RootLayout() {
  const session = useSession();
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
