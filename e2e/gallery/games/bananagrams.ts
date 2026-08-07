import { execFileSync } from 'node:child_process'
import {
  asUser,
  createBananagramsGame,
  drainBananagramsPool,
  type E2EClub,
  type E2EMember,
} from '../../helpers/fixtures'
import { endGame } from '../endGame'
import { timeOut } from '../timeOut'
import type { Cell, GameGallery } from '../types'

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SIZE = 25

/**
 * A player's hand, read as the superuser.
 *
 * `player_boards.tiles` is private to its owner by design — the gallery needs
 * it because it plays FOR that player, and no RPC hands you your own tiles as a
 * value. Reading is the escape hatch; the WRITE still goes through
 * `save_player_board`, which is where the real bookkeeping lives.
 */
function tilesOf(gameId: string, userId: string): string {
  return execFileSync(
    'psql',
    [
      LOCAL_DB,
      '-X',
      '-tA',
      '-c',
      `select tiles from bananagrams.player_boards
        where game_id = '${gameId}' and user_id = '${userId}';`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .replace(/[^A-Za-z]/g, '')
}

/**
 * A plausible grid: a run across with a run crossing it downward.
 *
 * The letters are simply the next ones off the hand — they don't spell
 * anything, and they don't have to. `setup.word_check` defaults to `'off'`
 * (the fixture leaves it unset), which is a real, player-pickable option
 * meaning "we're not checking the dictionary"; under it, only the GEOMETRY
 * matters — one 4-connected mass — and that's exactly what the screenshot is
 * for. Hunting a real word from the hand would be solver work in service of a
 * detail nothing on this page is looking at.
 *
 * `layEverything` places the WHOLE hand (the down run takes the remainder)
 * instead of the mid-game partial — a winning peel validates that every held
 * tile is on the board in one connected mass, so the win builder needs it.
 */
function buildBoard(tiles: string, layEverything = false): string {
  const cells = Array<string>(SIZE * SIZE).fill('.')
  const at = (x: number, y: number) => y * SIZE + x
  const hand = tiles.split('')

  const x0 = 9
  const y0 = 12
  const acrossLen = Math.min(8, hand.length)
  const across = hand.splice(0, acrossLen)
  across.forEach((ch, i) => (cells[at(x0 + i, y0)] = ch))

  // The down run hangs off the across run's third tile, so the two share a cell
  // and the whole thing is one connected mass rather than two islands.
  const down = layEverything ? hand.splice(0) : hand.splice(0, Math.min(5, hand.length))
  down.forEach((ch, i) => (cells[at(x0 + 2, y0 + 1 + i)] = ch))

  return cells.join('')
}

/**
 * MonkeyGrams (bananagrams) gallery states (docs/testing.md → The screenshot gallery).
 *
 * Compete-only — there is no coop gametype, so no coop cells.
 *
 * `won` needs no solver (the old excuse for its hole): with `word_check: 'off'`
 * a winning peel validates GEOMETRY only, so laying the whole hand in one
 * connected mass, draining the bunch (`drainBananagramsPool`, the same
 * documented psql escape hatch the win e2e uses), and peeling dry IS the win —
 * the game's one intrinsic terminal, produced by its own RPC.
 */
export const bananagramsGallery: GameGallery = {
  game: 'bananagrams',
  brand: 'MonkeyGrams',
  members: 2,
  cells: [
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'both players building' },
    { mode: 'compete', phase: 'won', note: 'peeled the bunch dry' },
    { mode: 'compete', phase: 'lost', note: 'time ran out' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createBananagramsGame(club)
    const viewer = club.members[0]
    if (cell.phase === 'fresh') return { gametype, id, viewer }

    // Every player builds, not just the viewer: the peer strip's whole job is
    // showing rivals' unplaced counts ticking down, and it can only do that if
    // the rivals have actually placed something. In the `won` cell the viewer
    // lays their ENTIRE hand (a winning peel checks every held tile is on the
    // board); the rival stays mid-build — a real race, caught at the end.
    for (const member of club.members as E2EMember[]) {
      const layEverything = cell.phase === 'won' && member.userId === viewer.userId
      const board = buildBoard(tilesOf(id, member.userId), layEverything)
      const res = await asUser(member.session.access_token)
        .schema('bananagrams')
        .rpc('save_player_board', { target_game: id, board })
      if (res.error) throw new Error(`bananagrams.save_player_board: ${res.error.message}`)
    }

    if (cell.phase === 'won') {
      drainBananagramsPool(id)
      const res = await asUser(viewer.session.access_token)
        .schema('bananagrams')
        .rpc('peel', { target_game: id })
      if (res.error) throw new Error(`bananagrams.peel: ${res.error.message}`)
      const result = (res.data as { result?: string })?.result
      if (result !== 'won') throw new Error(`peel → ${result}, expected won`)
    }
    if (cell.phase === 'lost') await timeOut(club, 'bananagrams', id)
    if (cell.phase === 'ended') await endGame(club, 'bananagrams', id)

    return { gametype, id, viewer }
  },
}
