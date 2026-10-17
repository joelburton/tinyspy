-- cs-unmet

-- ============================================================
-- common.profiles.hide_celebrations — skip the win celebration
-- ============================================================
-- When true, a win pops no celebration modal for you, and so plays no jingle
-- (the jingle is the modal's). The frontend's one gate is
-- `common/ending/useCelebration`, so no game decides for itself. Set from the
-- "Don't display celebration modal" row of the Edit profile dialog.
--
-- OFF by default, and that default is how every EXISTING account gets it:
-- `add column … not null default <constant>` fills the rows already there as
-- it adds the column. A new account gets it from the same default, since
-- `claim_username`'s insert names its columns and not this one.
--
-- Allowed on this table under the standing rule above
-- `profiles_select_authenticated`: it is a UI setting, the same kind of fact
-- as `sounds_enabled`, and says nothing about a person.
--
-- The write path is `common.update_profile`, a definer RPC; this table has no
-- UPDATE policy on purpose.
alter table common.profiles
  add column hide_celebrations boolean not null default false;
