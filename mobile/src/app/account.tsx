import { router } from 'expo-router';
import AccountScreen from '../auth/account-screen';
import { useSignedInSession } from '../auth/session-context';

export default function Account() {
  return <AccountScreen session={useSignedInSession()} onBack={() => router.back()} />;
}
