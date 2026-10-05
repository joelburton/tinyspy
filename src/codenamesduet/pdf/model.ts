// cs-blessed-codenamesduet

import type { PrintHeader } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { TOTAL_AGENTS } from '../lib/agents'
import { cluesOf, guessesOf, isSuddenDeathTurn } from '../lib/events'
import type { GGameData, GGuessEvent, GKey, GTile } from '../types'

/** A word's role on a key card. Renders as ✓ / – / ✗. */
export type KeyRole = 'agent' | 'neutral' | 'assassin'

/** One printed board tile. */
export type PrintTile = {
  word: string
  // What was REVEALED here — null while the word is untouched. A `KeyRole`,
  // which is this game's key-card vocabulary and not the app's outcome one: a
  // bystander is neither a good move nor a bad one, it is a bystander.
  revealed: KeyRole | null
  // My key. Always present: the print exists to be thought about.
  mine: KeyRole
  // The partner's key — once the game has ended only, null during play.
  peer: KeyRole | null
  // I burned this as a bystander (locked to me, still open to my partner).
  burnedByMe: boolean
  // My partner burned it (still open to ME — the Duet asymmetry).
  burnedByPeer: boolean
}

/** What the renderer draws: the frame's header, the 25 tiles, and the clue log. */
export type CodenamesduetPrintModel = PrintHeader & {
  // 25 tiles in board order (row-major, 5×5).
  tiles: PrintTile[]
  // True once both keys print — drives the legend and the second inset.
  showsBothKeys: boolean
  turns: TurnRow[]
}

const ROLE_OF: Record<GKey, KeyRole> = { G: 'agent', N: 'neutral', A: 'assassin' }

/** What a tile shows, as a role: the same for both players (`GTile.revealed`). */
function revealedOf(tile: GTile): KeyRole | null {
  return tile.revealed === null ? null : ROLE_OF[tile.revealed.as]
}

/**
 * Build the codenamesduet print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer.
 *
 * codenamesduet stacks THREE independent facts on one tile, and paper has to
 * keep them apart without leaning on color (a mono printer flattens the whole
 * palette to one gray):
 *
 *   1. **what happened** — the word was contacted as an agent, hit the
 *      assassin, or someone burned it as a bystander. Global, public.
 *   2. **my key** — what the word is on MY card. The thing I give clues from.
 *   3. **the peer's key** — secret until the game ends, then the other half of
 *      the story.
 *
 * Each becomes a `KeyRole` ('agent' | 'neutral' | 'assassin'), which the renderer
 * draws as ✓ / – / ✗ plus a color. Shape carries it; color is the bonus.
 *
 * The bystander TRIANGLES survive too (who burned a word — me or my partner),
 * because a partner-burned word is still mine to guess while one I burned is
 * locked to me. That asymmetry is exactly what you want when planning a clue on
 * paper, so it isn't decoration.
 */
export function buildCodenamesduetPrintModel(o: {
  date: string
  // The game as the page holds it: my partner's key is already null on every
  // tile until the game has ended (the seat rule, `makeGameData`).
  gd: GGameData
  // I asked to see my partner's key — which only a finished game offers — so a
  // print of an unrevealed game carries no peer column.
  partnerKeyShown: boolean
}): CodenamesduetPrintModel {
  const { gd } = o
  // The partner's key is a SECRET while the game is live — `gd` holds it as
  // null until then — and post-game it's held back until someone presses
  // Reveal. This ended check is the second lock: a printer that asked for the
  // key regardless would be one refactor away from putting the answer on paper
  // mid-game.
  const showsPartnerKey = gd.ended && o.partnerKeyShown

  const tiles: PrintTile[] = gd.team.board.tiles.map((t) => {
    const partnerKey = showsPartnerKey ? t.puzzleTile.key[gd.partner.id] : null
    return {
      word: t.puzzleTile.word,
      revealed: revealedOf(t),
      mine: ROLE_OF[t.puzzleTile.key[gd.me.id]!],
      peer: partnerKey ? ROLE_OF[partnerKey] : null,
      // Who burned it decides who it's still open to, so the two flags aren't
      // interchangeable — see the triangles note above. They are the board's
      // arrows: a bystander points at whoever turned it over.
      burnedByMe: t.revealed?.arrows.has(gd.me) ?? false,
      burnedByPeer: t.revealed?.arrows.has(gd.partner) ?? false,
    }
  })

  const clues = cluesOf(gd.events)
  const guesses = guessesOf(gd.events, gd.puzzle.tilesById)

  // One row per TURN: the clue, then the words it actually produced. That's how
  // the game reads — a clue is only meaningful through what it got.
  const byTurn = new Map<number, GGuessEvent[]>()
  for (const g of guesses) {
    const rows = byTurn.get(g.turnNum) ?? []
    rows.push(g)
    byTurn.set(g.turnNum, rows)
  }
  // Both lists arrive in the order things happened, and keep it.
  const turns: TurnRow[] = clues
    .map((c) => {
      const got = (byTurn.get(c.turnNum) ?? [])
        .map((g) => g.word.toUpperCase())
      return {
        seq: c.turnNum,
        who: c.by.username,
        // The clue leads; it's the part that can't be reconstructed from the
        // board, and drawEventLog truncates the tail.
        //
        // The separator is '»' (U+00BB), not '→' (U+2192): jsPDF's core fonts
        // are WinAnsi, which HAS the guillemet but not the arrow (U+2192
        // prints as `!'`). It's the closest real character to an arrow the
        // encoding offers.
        text: `${c.clueWord.toUpperCase()} ${c.clueCount}${got.length ? ` » ${got.join(', ')}` : ''}`,
      }
    })

  // Sudden death has no clue, and each guess there is a turn of its own, made
  // by either player — so each prints as its own row, under its guesser.
  for (const g of guesses) {
    if (!isSuddenDeathTurn(g.turnNum, gd.team.maxTurns)) continue
    turns.push({
      seq: g.turnNum,
      who: g.by.username,
      text: `SUDDEN DEATH » ${g.word.toUpperCase()}`,
    })
  }

  return {
    brand: gd.brand,
    gameTitle: gd.title,
    date: o.date,
    // What the on-screen `StateLine` says, from the same data: turns used, or
    // sudden death once the budget is gone — still, after such a game ends.
    summary:
      `${gd.team.nFoundAgents}/${TOTAL_AGENTS} agents contacted · ` +
      (gd.team.suddenDeath ? 'sudden death' : `${gd.team.nTurnsUsed}/${gd.team.maxTurns} turns spent`),
    setupRows: gd.setupRows,
    mode: gd.mode,
    tiles,
    showsBothKeys: showsPartnerKey,
    turns,
  }
}
