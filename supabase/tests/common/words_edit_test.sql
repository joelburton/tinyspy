-- ============================================================
-- Test: dictionary curation — update_word / delete_word / add_word
-- ============================================================
--
-- The contract (see sql/common.sql → Dictionary curation): every change is
-- gated on profiles.can_edit_words, applies to common.words LIVE, and
-- journals itself in common.words_edits (old = full prior row, new = the
-- changed fields / inserted row, plus the curator's note). Delete is a
-- hard DELETE — the journal snapshot is the only remaining copy.
--
-- Fixture words are invented z/q strings so they can't collide with the
-- real dictionary's primary keys. ada is granted the permission as the
-- superuser (exactly how Joel grants it on prod); bea stays a non-editor.

begin;

set search_path = common, public, extensions;
\ir ../_shared/setup.psql

select plan(17);

reset role;
update common.profiles set can_edit_words = true
 where user_id = 'ada11111-1111-1111-1111-111111111111';
insert into common.words
  (word, difficulty, american, british, canadian, australian, len)
values
  ('zqedita', 1, true, true, true, true, 7),
  ('zqeditb', 2, true, true, true, true, 7);

-- ── The gate: a non-editor is refused, and can't read the journal ──
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  $$ select common.update_word('zqedita', '{"difficulty": 3}'::jsonb) $$,
  '42501', 'word editing requires the can_edit_words permission',
  'a non-editor cannot update a word'
);
select is(
  (select count(*)::int from common.words_edits),
  0,
  'a non-editor sees no journal rows (RLS)'
);

-- ── update: live apply + journal ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  $$ select common.update_word('zqedita', '{"difficulty": 5, "slang": true}'::jsonb,
                               'saw this in wordle; way too obscure') $$,
  'an editor patches a word'
);
select is(
  (select difficulty::int from common.words where word = 'zqedita'),
  5,
  'the patch applied live'
);
select is(
  (select kind || '|' || (old->>'difficulty') || '|' || (new->>'difficulty')
        || '|' || edited_by_username || '|' || note
     from common.words_edits where word = 'zqedita'),
  'update|1|5|ada|saw this in wordle; way too obscure',
  'the journal row carries kind, the old snapshot, the patch, the editor, the note'
);

-- ── a definition edit stamps the manual provenance ──
select common.update_word('zqedita', '{"definition": "a fake test word"}'::jsonb);
select is(
  (select definition || '|' || definition_source from common.words where word = 'zqedita'),
  'a fake test word|m',
  'a definition edit sets definition_source = m (manual)'
);

-- ── validation ──
select throws_ok(
  $$ select common.update_word('zqedita', '{"wordle": true}'::jsonb) $$,
  'P0001', 'not an editable field: wordle',
  'only the editable column set is patchable'
);
select throws_ok(
  $$ select common.update_word('zqedita', '{"difficulty": 7}'::jsonb) $$,
  'P0001', 'difficulty must be 1-6',
  'a typo band is a clean rejection'
);
select throws_ok(
  $$ select common.update_word('zqnope', '{"difficulty": 3}'::jsonb) $$,
  'P0002', 'no such word: zqnope',
  'patching a missing word says so'
);

-- ── delete: a hard DELETE, snapshot in the journal ──
select common.delete_word('zqeditb', 'not a real word');
select is(
  (select count(*)::int from common.words where word = 'zqeditb'),
  0,
  'delete really deletes the row'
);
select is(
  (select kind || '|' || (old->>'word') || '|' || (old->>'difficulty') || '|' || note
     from common.words_edits where word = 'zqeditb'),
  'delete|zqeditb|2|not a real word',
  'the journal keeps the only remaining copy of a deleted word'
);

-- ── add: insert with derived columns + journal ──
select common.add_word('zqeditnew',
  '{"difficulty": 4, "american": true, "definition": "another fake"}'::jsonb,
  'heard at the table');
select is(
  (select difficulty::text || '|' || len::text || '|' || american::text
        || '|' || british::text || '|' || definition_source
     from common.words where word = 'zqeditnew'),
  '4|9|true|false|m',
  'add inserts with derived len, defaulted dialects, manual provenance'
);
select ok(
  (select letter_mask <> 0 from common.words where word = 'zqeditnew'),
  'the generated letter_mask materialized (the anagram finder can see it)'
);
select is(
  (select kind || '|' || (old is null)::text || '|' || (new->>'word')
     from common.words_edits where word = 'zqeditnew'),
  'add|true|zqeditnew',
  'the journal records the add with the full inserted row'
);
select throws_ok(
  $$ select common.add_word('zqeditnew', '{"difficulty": 1}'::jsonb) $$,
  'P0001', 'already in the dictionary: zqeditnew',
  'a duplicate add is rejected'
);
select throws_ok(
  $$ select common.add_word('Zq1', '{"difficulty": 1}'::jsonb) $$,
  'P0001', 'a word is 1-45 lowercase letters',
  'a malformed word is rejected'
);
select throws_ok(
  $$ select common.add_word('zqblank', '{"slang": true}'::jsonb) $$,
  'P0001', 'difficulty is required for a new word',
  'a new word must state its band'
);

select * from finish();
rollback;
