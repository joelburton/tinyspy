import { asUser, createSetgameGame, type E2EClub } from '../../helpers/fixtures'
import { boardOf, claim, findSetOn, playOut } from '../../helpers/setgame'
import { endGame } from '../endGame'
import type { Cell, GameGallery } from '../types'

/**
 * setgame's gallery states (docs/testing.md → The screenshot gallery).
 *
 * Unlike every other game here, **the board is different on every run** — a
 * setgame board is a shuffle, with no fixture to pin it. Two runs of the sheet
 * are therefore not pixel-comparable for this game; what they compare is the
 * LAYOUT, which is the same question the sheet is really asking. Pinning a deck
 * would mean writing rows behind the RPCs' back, which the gallery's one rule
 * forbids and which would photograph a board no deal could produce.
 *
 * The terminal cells play the whole deck out — about 25 real claims. It is the
 * only way to reach the natural end, since setgame has no setup knob that
 * shortens a game the way wordle's guess budget or letterboxed's word cap do.
 * No browser is involved, so it costs a second.
 */
async function timeOut(club: E2EClub, gameId: string): Promise<void> {
  const res = await asUser(club.members[0].session.access_token)
    .schema('setgame')
    .rpc('submit_timeout', { target_game: gameId })
  if (res.error) throw new Error(`setgame.submit_timeout: ${res.error.message}`)
}

export const setgameGallery: GameGallery = {
  game: 'setgame',
  brand: 'HareTrigger',
  members: 2,
  cells: [
    { mode: 'coop', phase: 'fresh' },
    { mode: 'coop', phase: 'mid', note: 'a few sets taken' },
    { mode: 'coop', phase: 'won', note: 'deck cleared' },
    { mode: 'coop', phase: 'lost', note: 'timed out' },
    { mode: 'coop', phase: 'ended', note: 'stopped by agreement' },
    { mode: 'compete', phase: 'fresh' },
    { mode: 'compete', phase: 'mid', note: 'a few sets each' },
    { mode: 'compete', phase: 'won', note: 'most sets when the deck ran dry' },
    { mode: 'compete', phase: 'lost', note: 'time up, nobody scored' },
    { mode: 'compete', phase: 'ended', note: 'stopped by agreement' },
  ],

  async build(club: E2EClub, cell: Cell) {
    const { id, gametype } = await createSetgameGame(club, cell.mode)
    const viewer = club.members[0]
    const actors = cell.mode === 'compete' ? club.members : [viewer]

    if (cell.phase === 'mid' || cell.phase === 'lost' || cell.phase === 'ended') {
      // A handful of claims, so the counts and the last-set panel have
      // something in them. Compete alternates, so the opponent strip shows a
      // real race rather than one player at zero.
      const rounds = cell.phase === 'lost' && cell.mode === 'compete' ? 0 : 3
      for (let n = 0; n < rounds; n++) {
        const live = findSetOn(await boardOf(viewer, id))
        if (live) await claim(actors[n % actors.length], id, live)
      }
    }

    if (cell.phase === 'won') await playOut(club, id, actors)

    // Both losses are the CLOCK, which is setgame's own defeat: coop ran out
    // with sets still on the table, and compete ran out with nobody having
    // scored. (A compete timeout WITH a scorer crowns the leader — "rank the
    // standings" — so the loss cell has to leave the board untouched.)
    if (cell.phase === 'lost') await timeOut(club, id)

    if (cell.phase === 'ended') await endGame(club, 'setgame', id)

    return { gametype, id, viewer }
  },
}
