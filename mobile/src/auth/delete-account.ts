// Account deletion (App Store guideline 5.1.1(v)). The database function
// delete_my_account() removes the signed-in user and, by cascade, their progress;
// it can only ever delete the caller. Dependencies are injected so the flow can be
// tested without React Native or a network.

export type DeleteAccountResult = { status: 'deleted' } | { status: 'error'; message: string };

export type DeleteAccountDeps = {
  deleteOnServer(): Promise<{ error: { message: string } | null }>;
  // Best effort: removes this app's access from the Google account. Nothing to do for Apple
  // here; revoking the Apple token is a separate server-side release gate.
  forgetGoogle?(): Promise<unknown>;
  signOutLocally(): Promise<unknown>;
};

export async function deleteAccount(deps: DeleteAccountDeps): Promise<DeleteAccountResult> {
  let error: { message: string } | null;
  try {
    ({ error } = await deps.deleteOnServer());
  } catch {
    error = { message: 'delete_my_account failed' };
  }
  // Nothing was deleted: stay signed in so the learner can try again.
  if (error) return { status: 'error', message: error.message };
  // The account is gone. Clean up locally even if these fail: the session is already invalid.
  await deps.forgetGoogle?.().catch(() => undefined);
  await Promise.resolve(deps.signOutLocally()).catch(() => undefined);
  markAccountDeleted();
  return { status: 'deleted' };
}

// One-shot note for the sign-in screen, which appears after the route guard swaps
// screens, so it can confirm "החשבון נמחק." exactly once.
let accountJustDeleted = false;
export function markAccountDeleted() { accountJustDeleted = true; }
export function consumeAccountDeleted(): boolean {
  const value = accountJustDeleted;
  accountJustDeleted = false;
  return value;
}
