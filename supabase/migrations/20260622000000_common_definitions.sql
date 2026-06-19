-- ============================================================
-- common.definitions — the shared word→definition cache
-- ============================================================
--
-- Powers the click-to-define popover + the "look up any word"
-- shortcut. Lives in `common` (NOT in any game's schema) because
-- every word game wants definitions — freebee today, boggle and
-- crosswords later. Putting it here keeps the removability
-- invariant intact: removing a game never deletes the shared
-- dictionary the other games read. See docs/common.md.
--
-- This table is the *superset* word store. It is seeded from the
-- Scrabble-dictionary definitions vendored alongside the SCOWL
-- lists (192k words, terse glosses like "rough, cindery lava"),
-- and grows lazily: when a lookup misses, the `define` Edge
-- Function fetches Wiktionary (freedictionaryapi.com, CC BY-SA)
-- and caches the result back here via `cache_definition` below.
--
-- It is deliberately decoupled from `freebee.dictionary`:
--   - freebee.dictionary = gameplay legality (letter_mask,
--     in_scoring, in_legal) for ~102k SCOWL words.
--   - common.definitions = the def text for *any* word, including
--     the ~90k Scrabble words that aren't SCOWL-legal and the
--     novel words a player looks up. No in_scoring/in_legal here —
--     "is it playable" is each game's question, not the
--     dictionary's. The two relate only by `word`, and the hot
--     paths never join (lookups want def; gameplay wants flags).
--
-- A NULL `def` is a *negative-cache tombstone*: "we asked and the
-- source had nothing." It exists so the free-form lookup box
-- (which invites typos + nonsense) doesn't re-hit the API on
-- every repeat of an unknown word. `fetched_at` lets the Edge
-- Function re-try a stale tombstone (a word Wiktionary adds later).

create table common.definitions (
  word        text primary key,        -- lowercase; the exact-match lookup key
  def         text,                     -- NULL = looked-up-but-not-found tombstone
  source      text not null
                check (source in ('scrabble', 'wiktionary')),
  fetched_at  timestamptz not null default now()
);

-- Public reference data: readable by any signed-in user (an
-- English dictionary isn't secret, and exposing it leaks no
-- per-game answer key — the board's legal words live in the
-- hidden freebee.games_state columns, not here). No RLS; writes
-- are funnelled through cache_definition() below, so authenticated
-- gets SELECT only. The bulk seed import runs as service_role,
-- which bypasses the missing INSERT grant.
grant select on common.definitions to authenticated;
-- The seed importer (scripts/import-definitions.ts) and the
-- `define` Edge Function connect as service_role and need schema
-- USAGE + write access. `common` grants authenticated USAGE in the
-- baseline but not service_role, so grant it here. INSERT alongside
-- SELECT because PostgREST's upsert path reads back on conflict.
grant usage on schema common to service_role;
grant insert, select on common.definitions to service_role;

-- ============================================================
-- common.cache_definition — the lazy-fill write path
-- ============================================================
-- Called by the `define` Edge Function (as service_role) after it
-- fetches a missing word from the API. SECURITY DEFINER so the
-- single write path is auditable + atomic; the conditional ON
-- CONFLICT is the important part:
--
--   we only ever call this on a cache MISS, so the existing row is
--   either absent or a NULL tombstone. The `where ... def is null`
--   guard means a real definition (notably a seeded Scrabble
--   gloss) is NEVER clobbered by a later API write or tombstone —
--   Scrabble's direct glosses win over Wiktionary's thinner
--   "plural of X" entries when both exist.
--
-- p_def NULL writes/refreshes a tombstone. Word is lowercased so
-- callers don't have to.
create function common.cache_definition(
  p_word   text,
  p_def    text,
  p_source text
) returns void
language plpgsql
security definer
set search_path = common, public
as $$
begin
  insert into common.definitions (word, def, source, fetched_at)
  values (lower(trim(p_word)), p_def, p_source, now())
  on conflict (word) do update
    set def        = excluded.def,
        source     = excluded.source,
        fetched_at = excluded.fetched_at
    where common.definitions.def is null;
end;
$$;

-- Only the Edge Function (service_role) writes. Not authenticated:
-- letting any client cache arbitrary (word, def) pairs is a
-- junk-injection vector with no upside.
revoke execute on function common.cache_definition(text, text, text) from public;
grant execute on function common.cache_definition(text, text, text) to service_role;
