import { execFileSync } from 'node:child_process'
import { asUser, createBananagramsGame, type E2EClub, type E2EMember } from '../../helpers/fixtures'
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
 * A plausible mid-game grid: a run across with a run crossing it downward.
 *
 * The letters are simply the next ones off the hand — they don't spell
 * anything, and they don't have to. `setup.word_check` defaults to `'off'`
 * (the fixture leaves it unset), which is a real, player-pickable option
 * meaning "we're not checking the dictionary"; under it, only the GEOMETRY
 * matters — one 4-connected mass — and that's exactly what the screenshot is
 * for. Hunting a real word from the hand would be solver work in service of a
 * detail nothing on this page is looking at.
 */
function buildBoard(tiles: string): string {
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
  const down = hand.splice(0, Math.min(5, hand.length))
  down.forEach((ch, i) => (cells[at(x0 + 2, y0 + 1 + i)] = ch))

  return cells.join('')
}

/**
 * MonkeyGrams (bananagrams) gallery states (docs/gallery-plan.md).
 *
 * Compete-only — there is no coop gametype, so no coop cells.
 *
 * No `won`: winning means peeling until the bunch is empty AND laying every
 * tile you hold into one legal mass, which is solver work, not fixture work.
 * The hole says so rather than a faked terminal claiming a board that never won.
 */
export const bananagramsGallery: GameGallery = {
  game: 'bananagrams',
  brand: 'MonkeyGrams',
  members: 2,
  cells: [
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'both players building' },
    { mode: 'compete', phase: 'lost', note: 'time ran out' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createBananagramsGame(club)
    const viewer = club.members[0]
    if (cell.phase === 'fresh') return { gametype, id, viewer }

    // Every player builds, not just the viewer: the peer strip's whole job is
    // showing rivals' unplaced counts ticking down, and it can only do that if
    // the rivals have actually placed something.
    for (const member of club.members as E2EMember[]) {
      const board = buildBoard(tilesOf(id, member.userId))
      const res = await asUser(member.session.access_token)
        .schema('bananagrams')
        .rpc('save_player_board', { target_game: id, board })
      if (res.error) throw new Error(`bananagrams.save_player_board: ${res.error.message}`)
    }

    if (cell.phase === 'lost') await timeOut(club, 'bananagrams', id)
    if (cell.phase === 'ended') await endGame(club, 'bananagrams', id)

    return { gametype, id, viewer }
  },
}
