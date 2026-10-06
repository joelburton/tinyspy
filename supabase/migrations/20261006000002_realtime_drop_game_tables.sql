-- cs-unmet

-- ============================================================
-- supabase_realtime: no game table is published any more
-- ============================================================
-- Every game's migration added its tables to the publication so the page could
-- subscribe to their row changes. Every game is on the page blobs now: a game
-- page reads `common.games` and hears a move through the `changed` Broadcast
-- (`common._nudge_game_page`, src/common/realtime/doc.md), and no client
-- subscribes to a game's own table. Each table listed here was published with
-- nobody listening, which is replication work for nothing (plans/seat-view.md
-- → When every game has converted; Joel, 2026-10-05).
--
-- What stays published is `common`'s five: `games` (the club page's list),
-- `game_players` (game invitations), `game_scratchpads`, `messages` and
-- `clubs_members`. supabase/tests/common/realtime_publication_test.sql pins
-- the list.

alter publication supabase_realtime drop table
  bananagrams.player_boards,
  boggle.games, boggle.found_words,
  codenamesduet.games, codenamesduet.words, codenamesduet.events,
  connections.games, connections.players, connections.events,
  letterboxed.games, letterboxed.players, letterboxed.events,
  psychicnum.games, psychicnum.players, psychicnum.events,
  scrabble.games, scrabble.players, scrabble.events,
  setgame.games, setgame.players, setgame.events,
  spellingbee.games, spellingbee.found_words,
  stackdown.games, stackdown.players, stackdown.events,
  strands.games, strands.players, strands.events,
  waffle.games, waffle.players, waffle.events,
  wordiply.games, wordiply.events,
  wordle.games, wordle.players, wordle.events,
  wordwheel.games, wordwheel.found_words;
