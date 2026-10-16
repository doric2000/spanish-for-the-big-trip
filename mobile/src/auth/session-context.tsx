import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

// Filled by the root layout, which reads the session once for the whole app.
export const SessionContext = createContext<Session | null>(null);

// For screens that are only reachable while signed in (Stack.Protected).
export function useSignedInSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('This screen requires a signed-in session');
  return session;
}
