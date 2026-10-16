-- Stage04: in-app account deletion (App Store guideline 5.1.1(v)), approved by Dor
-- 2026-10-17 with the retro account screen (Figma 104:657).
--
-- The app cannot delete a Supabase user itself: that needs the service-role key,
-- which never ships in the app. This function runs inside the database with the
-- owner's rights (security definer) and deletes exactly one user: the one whose
-- verified token is making the call (auth.uid()). It takes no arguments, so a
-- caller cannot name somebody else.
--
-- Deleting the auth.users row removes the account's identities and sessions, and
-- user_unit_progress rows go with it (on delete cascade). Learner recordings stay
-- on the device and are never uploaded, so nothing else holds personal data.
-- Revoking the Sign in with Apple token is a separate release gate for the API.
create function public.delete_my_account()
returns void
language plpgsql
security definer
-- Empty search_path: every name below is schema-qualified, so a caller cannot
-- shadow auth.users with an object of their own.
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'delete_my_account requires a signed-in user'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  delete from auth.users where id = caller;
end;
$$;

-- Only signed-in learners may call it; never anonymous visitors or PUBLIC.
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the calling user (auth.uid()) and, by cascade, their progress. No arguments, so nobody can delete another account. Called from the account screen after a native confirmation.';
