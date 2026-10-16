// Sign in with Apple, then exchange Apple's identity token for a Supabase session.
//
// Nonce: a one-time random value that ties Apple's token to this attempt, so a
// stolen token cannot be replayed. Apple receives the SHA-256 hash and copies it
// into the token; Supabase receives the raw value, hashes it and compares.

export type AppleSignInResult =
  | { status: 'signed_in' }
  | { status: 'canceled' }
  | { status: 'error'; message: string };

export type AppleSignInDeps = {
  randomNonce(): string;
  sha256Hex(value: string): Promise<string>;
  requestAppleCredential(hashedNonce: string): Promise<{ identityToken: string | null }>;
  exchangeWithSupabase(identityToken: string, rawNonce: string): Promise<{ error: { message: string } | null }>;
};

export async function signInWithApple(deps: AppleSignInDeps): Promise<AppleSignInResult> {
  const rawNonce = deps.randomNonce();
  let identityToken: string | null;
  try {
    ({ identityToken } = await deps.requestAppleCredential(await deps.sha256Hex(rawNonce)));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return { status: 'canceled' };
    return { status: 'error', message: 'Apple sign-in failed' };
  }
  if (!identityToken) return { status: 'error', message: 'Apple returned no identity token' };
  const { error } = await deps.exchangeWithSupabase(identityToken, rawNonce);
  return error ? { status: 'error', message: error.message } : { status: 'signed_in' };
}
