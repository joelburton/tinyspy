-- ============================================================
-- common.profiles: display_name → username
-- ============================================================
--
-- Renames the display_name column to username and adds a unique
-- constraint, making username the user's authoritative handle —
-- the identity shown in rosters, chat, mentions, and (eventually)
-- URLs. Email is still the auth credential (magic-link target);
-- username is the in-app identity.
--
-- For v1, the username is auto-seeded from the email's local part
-- by the handle_new_user trigger (same logic as the old default).
-- The unique constraint means a second user signing in with
-- a colliding local-part (e.g. bob@foo.com after bob@bar.com) will
-- fail magic-link sign-in entirely. That's accepted for alpha —
-- ~3 users, the conflict is unlikely, and a username picker UI
-- would be premature while the auth method itself (magic link vs.
-- password) is still being decided. When that lands, a picker
-- screen + collision handling moves into the auth flow.
--
-- This migration is destructive — there's no graceful path for
-- existing data if multiple profiles share a local-part. Per the
-- alpha-software prior (see CLAUDE.md), that's fine: any local
-- conflict resolves by `supabase db reset`; prod is empty.

alter table common.profiles rename column display_name to username;

alter table common.profiles add constraint profiles_username_unique unique (username);

-- Recreate the new-user trigger function to write into `username`
-- instead of `display_name`. Logic is unchanged: take the part of
-- the email before `@`, fall back to 'player' if (somehow) empty.
create or replace function common.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  insert into common.profiles (user_id, username)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'player')
  );
  return new;
end;
$$;
