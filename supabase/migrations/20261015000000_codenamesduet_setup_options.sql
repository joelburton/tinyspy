-- cs-unmet

-- ============================================================
-- codenamesduet — three setup options, and sudden death that can start early
-- ============================================================
--
-- `guess_required` keeps the guesser from passing before their first guess of
-- the turn. `strict_words` limits a clue to the letters a to z. And
-- `can_decline_clue_giving` lets the clue-giver decline instead of giving a
-- clue: no turn is spent, and their partner gives every clue from then on. A
-- decline is a new kind of event, `decline`, with no payload, so the
-- payload-by-kind CHECK already covers it.
--
-- A decline can leave nobody to give a clue: the partner has no agents left,
-- or has declined too. The game then drops into sudden death before the
-- budget is spent, so sudden death is no longer "`turn_number` past
-- `max_turns`". `sudden_death_turn` is the turn it began on, null until it
-- does; a game already in it began one past the budget.
--
-- Every existing game was played without the three options, so their columns
-- are false, and its setup — which the setup rows read back, through both
-- copies of it — gains the three keys as false. A club's saved default is not
-- touched: a key missing there falls through to the form's default.

alter table codenamesduet.games
  add column guess_required boolean not null default false,
  add column strict_words boolean not null default false,
  add column can_decline_clue_giving boolean not null default false,
  add column sudden_death_turn int;

-- `create_game` writes all three from the setup.
alter table codenamesduet.games
  alter column guess_required drop default,
  alter column strict_words drop default,
  alter column can_decline_clue_giving drop default;

update codenamesduet.games
   set sudden_death_turn = max_turns + 1
 where turn_number > max_turns;

alter table codenamesduet.events drop constraint events_kind_check;
alter table codenamesduet.events
  add constraint events_kind_check check (kind in ('clue', 'guess', 'pass', 'hint', 'decline'));

update common.games
   set setup = setup || '{"guess_required": false, "strict_words": false, "can_decline_clue_giving": false}'::jsonb
 where gametype = 'codenamesduet'
   and not (setup ? 'guess_required');

update common.games
   set static_game_data = jsonb_set(static_game_data, '{setup}',
         (static_game_data -> 'setup')
           || '{"guess_required": false, "strict_words": false, "can_decline_clue_giving": false}'::jsonb)
 where gametype = 'codenamesduet'
   and static_game_data ? 'setup'
   and not (static_game_data -> 'setup' ? 'guess_required');
