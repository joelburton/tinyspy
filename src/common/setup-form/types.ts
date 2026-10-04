// cs-unmet

/** One setup row: what it describes, what it's called, what it says. */
export type SetupRow = {
  // The setup key this row describes — `'timer'`, `'legal_band'`, … Nothing
  // RENDERS it; it exists so `src/guards/setupRows.test.ts` can assert that
  // every key in a game's default setup produces a row — so adding a setup
  // field forces a decision about whether players see it recorded, rather than
  // leaving two lists to agree by convention. The two PSEUDO-KEYS below
  // describe something real that isn't a setup key: the roster, and the board.
  key: string
  label: string
  // Plain string, never a React node. The PDF is WinAnsi (no `→`, no elements),
  // so it's the lower bound for what a shared row may carry — which is the
  // right way round. Screen-only richness lives outside these rows.
  value: string
}

/**
 * WHAT THE FORM HOLDS, minus what the form alone needs — the setup blob a
 * game's `create_game` is actually sent, and the shape stored on
 * `common.games.setup` and `clubs_gametypes.default_setup`.
 *
 * `Values` is the primary type and `Setup` is derived from it, because the form
 * is where every one of these values is decided. The only difference is the
 * players: they are the RPC's own argument and become `common.game_players`
 * rows, so they are never in the setup blob — which matters, because
 * `<game>/lib/setupRows.ts` and each `PlayArea` read that blob BACK as
 * `<Game>Setup` and would otherwise be typed for a key that is never there.
 */
export type SetupOf<V> = Omit<V, 'player_user_ids'>
