import { execFileSync } from 'node:child_process'
import { asUser, createCrosswordsGameSized, type E2EClub } from '../../helpers/fixtures'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** A filled square: where it is and what belongs in it. */
type Square = { row: number; col: number; fill: string }

/**
 * The answer grid, read as the superuser.
 *
 * crosswords keeps its solution SERVER-ONLY behind a column grant — the client
 * genuinely never holds it — so filling the grid means looking it up. Fine here
 * (the trust model is friends, not adversaries), and every cell below is still
 * written through the real `set_cell`, so the grid, the check marks and the
 * terminal are all the ones a player would have produced.
 *
 * The column is rows of cells, each cell a list of characters (a rebus square
 * holds more than one) and a BLACK square an empty list — so the flatten both
 * skips the blacks and rejoins rebus squares into the string a player types.
 */
function solutionOf(gameId: string): Square[] {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error(`bad game id: ${gameId}`)
  const raw = execFileSync(
    'psql',
    [LOCAL_DB, '-X', '-tA', '-c', `select solution from crosswords.games where id = '${gameId}';`],
    { encoding: 'utf8' },
  ).trim()
  const grid = JSON.parse(raw) as string[][][]
  const squares: Square[] = []
  grid.forEach((cells, row) =>
    cells.forEach((letters, col) => {
      if (letters.length) squares.push({ row, col, fill: letters.join('') })
    }),
  )
  return squares
}

/**
 * CrossPlay (crosswords) gallery states (docs/gallery-plan.md).
 *
 * There is no LOSS: a crossword can be abandoned but not failed, so the only
 * terminals are the solve and the neutral stop.
 */
export const crosswordsGallery: GameGallery = {
  game: 'crosswords',
  brand: 'CrossPlay',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'a few squares filled' },
    { mode: 'coop', phase: 'won', note: 'grid completed' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'a few squares filled' },
    { mode: 'compete', phase: 'won', note: 'first to complete' },
    // Coop only: `end_game` here is coop-only by design — a compete racer
    // drops out by CONCEDING, which is a loss rather than a neutral stop, so
    // compete has no `ended` to show.
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },

  ],

  async build(club: E2EClub, cell: Cell) {
    // A FULL-SIZE 15x15, not the 2x2 the default fixture builds: a crossword's
    // layout question is what a whole board does to the columns, the clue lists
    // and the print, and four squares answer none of it.
    //
    // Built directly rather than drawn from the puzzle library, which on a dev
    // machine is entirely e2e leftovers ("E2E Puzzle" x164) — the real .puz
    // files aren't in the checkout, so "pick the biggest from the library" is
    // both non-deterministic and no more realistic than this.
    const { id, gametype } = await createCrosswordsGameSized(club, 15, cell.mode)
    const viewer = club.members[0]
    if (cell.phase === 'fresh') return { gametype, id, viewer }

    const squares = solutionOf(id)
    // A mid-game is a PARTLY filled grid — a third of it, so the empties are
    // still obvious next to what's been answered. On a real 15x15 that's ~60
    // squares, which is a plausible half-hour in rather than a token letter.
    const wanted = cell.phase === 'won' ? squares : squares.slice(0, Math.ceil(squares.length / 3))
    for (const sq of wanted) {
      const res = await asUser(viewer.session.access_token)
        .schema('crosswords')
        .rpc('set_cell', {
          target_game: id,
          p_row: sq.row,
          p_col: sq.col,
          p_fill: sq.fill,
          p_pencil: false,
        })
      if (res.error) throw new Error(`crosswords.set_cell(${sq.row},${sq.col}): ${res.error.message}`)
    }
    if (cell.phase === 'ended') await endGame(club, 'crosswords', id)

    return { gametype, id, viewer }
  },
}
