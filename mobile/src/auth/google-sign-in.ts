// Sign in with Google, then exchange Google's ID token for a Supabase session.
//
// No nonce here (decision with Dor, 2026-10-16): the free Google sign-in library
// cannot pass one, and the iOS Google SDK puts its own hidden nonce in the token,
// so the Supabase Google provider has "Skip nonce check" on. Supabase still checks
// Google's signature, that the token was issued for our client IDs, and expiry.

export type GoogleSignInResult =
  | { status: 'signed_in' }
  | { status: 'canceled' }
  | { status: 'error'; message: string };

export type GoogleCredential =
  | { type: 'success'; idToken: string | null }
  | { type: 'cancelled' };

export type GoogleSignInDeps = {
  requestGoogleCredential(): Promise<GoogleCredential>;
  exchangeWithSupabase(idToken: string): Promise<{ error: { message: string } | null }>;
};

// The library reports a cancel as a resolved { type: 'cancelled' } response, so
// anything thrown is a real failure.
export async function signInWithGoogle(deps: GoogleSignInDeps): Promise<GoogleSignInResult> {
  let credential: GoogleCredential;
  try {
    credential = await deps.requestGoogleCredential();
  } catch {
    return { status: 'error', message: 'Google sign-in failed' };
  }
  if (credential.type === 'cancelled') return { status: 'canceled' };
  if (!credential.idToken) return { status: 'error', message: 'Google returned no ID token' };
  const { error } = await deps.exchangeWithSupabase(credential.idToken);
  return error ? { status: 'error', message: error.message } : { status: 'signed_in' };
}
