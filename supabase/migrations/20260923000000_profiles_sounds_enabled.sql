-- cs-unmet

-- ============================================================
-- common.profiles.sounds_enabled — may the app play sounds for you
-- ============================================================
-- One switch for every sound the app plays: the bell when a turn becomes
-- yours, the win jingle, and any sound added later. The frontend's single
-- player (`common/sounds/playSound`) reads it, so no caller decides for
-- itself. Set from the "Enable sounds" row of the Edit profile dialog.
--
-- ON by default, and that default is how every EXISTING account gets it:
-- `add column … not null default <constant>` fills the rows already there as
-- it adds the column, so there is no separate UPDATE to run and no row that
-- could be missed. A new account gets it from the same default, since
-- `claim_username`'s insert names its columns and not this one.
--
-- Allowed on this table under the standing rule above
-- `profiles_select_authenticated`: a sound preference is a UI setting, the
-- same kind of fact as `theme`, and says nothing about a person.
--
-- The write path is `common.update_profile`, a definer RPC; this table has no
-- UPDATE policy on purpose.
--
-- ADD COLUMN, which appends — the frozen baseline is not edited.
alter table common.profiles
  add column sounds_enabled boolean not null default true;
