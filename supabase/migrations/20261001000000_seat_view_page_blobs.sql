-- cs-unmet

-- ============================================================
-- The page is written, not assembled: three blobs on common.games
-- ============================================================
-- plans/seat-view.md → The page is written, not assembled. Each game's status
-- builder writes, in the move's own transaction, everything a page shows onto
-- `common.games`, already in the page's shape and names, one column per
-- reader:
--
--   clubpage  — what the club page's list shows for this game
--   shell     — what GamePage shows; the SAME shape for every gametype, written
--               by one common function
--   playarea  — what the play surface shows; the game's own shape on top of
--               the common player fields
--
-- Nullable: a game whose builder has not yet been taught the blobs leaves them
-- empty rather than failing, and its page is broken until its turn — which is
-- the slice's order, psychicnum first (plans/seat-view.md → What this touches).
-- The builders themselves are behavior and live in `supabase/sql/`.
--
-- `game_status` and `clubpage_info` stay until a later migration retires them.

alter table common.games
  add column clubpage jsonb,
  add column shell    jsonb,
  add column playarea jsonb;


-- ============================================================
-- What a gametype states: brand and one_board
-- ============================================================
-- Two facts the shell blob carries that a game's manifest used to be the only
-- source of (plans/seat-view.md → One shape): the gametype states them here,
-- the manifest keeps its copy, and the two are kept in sync by hand.
--
--   brand      — the user-facing name: `WordNerd` for the wordle pair. Both
--                siblings of a pair carry the same brand.
--   one_board  — the game has ONE board that every player's moves land on
--                (true for a solo coop game, which has one board and one
--                player). False, each player plays their own copy. Every coop
--                gametype is one board; compete is per-player except where the
--                board is the contended thing itself: setgame's claims remove
--                cards from under everyone, scrabble's commits land on the one
--                board.
--
-- No default on either: a gametype registered without them is a bug, and this
-- is the one place it can be caught. A new game's baseline migration names both
-- in its `insert into common.gametypes`.

alter table common.gametypes
  add column brand     text,
  add column one_board boolean;

update common.gametypes as g
   set brand     = v.brand,
       one_board = v.one_board
  from (values
    ('bananagrams',          'MonkeyGrams', false),
    ('boggle_coop',          'MothCubes',   true),
    ('boggle_compete',       'MothCubes',   false),
    ('codenamesduet',        'TinySpy',     true),
    ('connections_coop',     'WordKnit',    true),
    ('connections_compete',  'WordKnit',    false),
    ('crosswords_coop',      'CrossPlay',   true),
    ('crosswords_compete',   'CrossPlay',   false),
    ('letterboxed_coop',     'SnakeBox',    true),
    ('letterboxed_compete',  'SnakeBox',    false),
    ('psychicnum_coop',      'PsychicNum',  true),
    ('psychicnum_compete',   'PsychicNum',  false),
    ('scrabble_coop',        'RackAttack',  true),
    ('scrabble_compete',     'RackAttack',  true),
    ('setgame_coop',         'HareTrigger', true),
    ('setgame_compete',      'HareTrigger', true),
    ('spellingbee_coop',     'FreeBee',     true),
    ('spellingbee_compete',  'FreeBee',     false),
    ('stackdown_coop',       'StackDown',   true),
    ('stackdown_compete',    'StackDown',   false),
    ('strands_coop',         'PaulPath',    true),
    ('strands_compete',      'PaulPath',    false),
    ('waffle_coop',          'SyrupSwap',   true),
    ('waffle_compete',       'SyrupSwap',   false),
    ('wordiply_coop',        'WordWire',    true),
    ('wordiply_compete',     'WordWire',    false),
    ('wordle_coop',          'WordNerd',    true),
    ('wordle_compete',       'WordNerd',    false),
    ('wordwheel_coop',       'MooseWheel',  true),
    ('wordwheel_compete',    'MooseWheel',  false)
  ) as v (gametype, brand, one_board)
 where g.gametype = v.gametype;

-- A gametype the list above missed shows up here as the migration failing,
-- not as a page with no brand.
alter table common.gametypes
  alter column brand     set not null,
  alter column one_board set not null;
