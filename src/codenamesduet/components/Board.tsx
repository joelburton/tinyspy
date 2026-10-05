// cs-blessed-codenamesduet

import { useEffect } from 'react'
import { cls } from '@/common/utils/cls'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { useMark } from '@/common/board-marks/useMark'
import { ATTENTION_FADE_MS, VERDICT_SHAKE_MS } from '@/common/board-marks/feedbackTiming'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import type { GKey, GPlayer, GTile } from '../types'
import { BOARD_SHAPE } from '../lib/boardShape'
import { positionAt } from '@/common/board-cursor/boardPosition'
import type { Cell } from '@/common/board-cursor/stepCell'
import shared from '@/common/game-page/playArea.module.css'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './Board.module.css'

/** Empty position set — a stable reference so nothing shakes by default. */
const NO_TILES: ReadonlySet<number> = new Set()

/** What a tile shows, as one comparable string: its `as` and who it points at. */
const revealKey = (t: GTile) =>
  t.revealed === null ? '-' : `${t.revealed.as}${[...t.revealed.arrows].map((p) => p.id).sort().join('+')}`

/**
 * GKey ('G'|'N'|'A') → the keycard-square color class. The squares always
 * use the *unrevealed* (soft) palette — they show what a key card SAYS about a
 * cell, independent of what's been guessed. Style rules live in
 * Board.module.css; this map is the one place translating the data alphabet
 * to presentation classes.
 */
const KEY_SQUARE: Record<GKey, 'keyAgent' | 'keyNeutral' | 'keyAssassin'> = {
  G: 'keyAgent',
  N: 'keyNeutral',
  A: 'keyAssassin',
}

type Props = {
  // The 25 tiles — the live board or a viewed turn's (PlayArea picks).
  tiles: GTile[]
  // Whose key is mine, and whose is my partner's.
  me: GPlayer
  partner: GPlayer
  // My partner's key-card square is drawn: the game has ended and I asked.
  showsPartnerKey: boolean
  // The board takes my guess right now (BoardCol's `isInteractive`). A past
  // turn open on top of it makes the tiles inert too.
  isInteractive: boolean
  // The position whose guess is in flight — dimmed until the reply — or null.
  // BoardCol's, which dispatches the guess.
  inFlightPos: number | null
  // A click on a clickable tile. BoardCol owns `submit_guess`; this component
  // only reports the position.
  onGuess: (position: number) => void
  // The keyboard's selection cursor — the cell to ring — or null when it is
  // not drawn (see `useBoardSelectionCursor`).
  cursor: Cell | null
  // The word the keyboard has picked, waiting for Enter — its position, drawn
  // with the picked border — or null.
  picked: number | null
  // A past turn's board is open: `tiles` is then its board, the frame rings
  // the board, and clicks fall through to the viewer's own exit.
  isViewingHistory: boolean
  // The tiles the viewed turn decided — ringed in the history blue ("added
  // this turn"). Empty when live.
  litTileIds: ReadonlySet<string>
  // My partner holds the move: the board dims, unless it takes input.
  isWaitingForTurn: boolean
  // True for a beat as the move becomes mine: the board's frame flashes.
  myTurnJustStarted: boolean
  // Guesses the server has recorded — the CAUSE the attention flash reads. A
  // restart deletes them, so it drops rather than advances.
  moveCount: number
  // The ending's outcome, for the game-over frame's color; null while playing.
  endingOutcome: EndOutcome | null
}

/**
 * The 5×5 codenamesduet board — presentational. It owns the per-tile render
 * alone: the result fill, the key-card and triangle overlays, the click gate,
 * and the shared board marks (plans/tile-feedback.md) — the keyboard's pick and
 * cursor ring, the in-flight dim, the attention flash and the shake on a tile,
 * the turn dim and flash and the
 * game-over frame on the board. A click calls `onGuess`; BoardCol dispatches
 * the guess, and the reveal arrives in the next blob and the tile re-renders
 * in its result color.
 */
export function Board({
  tiles,
  me,
  partner,
  showsPartnerKey,
  isInteractive,
  inFlightPos,
  onGuess,
  cursor,
  picked,
  isViewingHistory,
  litTileIds,
  isWaitingForTurn,
  myTurnJustStarted,
  moveCount,
  endingOutcome,
}: Props) {
  // I am guessing on this board right now: it takes my guess, and it is the
  // live board rather than a past turn.
  const isGuessing = isInteractive && !isViewingHistory
  // ATTENTION — the tiles a guess just turned over, mine included: the answer
  // arrives in the tile I am watching, and a partner's lands anywhere. Gated on
  // the guess log, not on the board differing, so a restart, the history
  // viewer and the partner's key being shown never flash. See
  // `useMoveAttention`.
  const flashing = useMoveAttention({
    content: tiles,
    contentKey: tiles.map(revealKey).join(','),
    moveCount,
    quiet: isViewingHistory,
    changed: (before, now) =>
      new Set(now.filter((t, i) => revealKey(t) !== revealKey(before[i] ?? t)).map((t) => Number(t.id))),
  })

  // NO — the head-shake on a tile that came back a bystander or the assassin,
  // once the flash has handed the tile its color back. An agent never shakes.
  const [shakeMark, shakeWrong] = useMark<{ positions: ReadonlySet<number> }>(VERDICT_SHAKE_MS)
  const shaking = shakeMark?.value.positions ?? NO_TILES
  // Keyed on the positions rather than the set: `tiles` is a fresh array every
  // reload, and an effect depending on it would cancel its own timer.
  const wrongKey = [...flashing]
    .filter((p) => tiles[p]?.revealed?.as !== 'G')
    .sort((a, b) => a - b)
    .join(',')
  useEffect(function shakeAfterFlash() {
    if (wrongKey === '') return
    const timer = setTimeout(
      () => shakeWrong({ positions: new Set(wrongKey.split(',').map(Number)) }),
      ATTENTION_FADE_MS,
    )
    return () => clearTimeout(timer)
  }, [wrongKey, shakeWrong])

  // The tiles are the shared `.tile` / `.tileWord` chrome; the key-card and
  // triangle overlays are layered on through `.overlayTile`, which
  // makes the tile their positioning context.
  return (
    // data-board: the e2e handle for the layout-stability test, which measures
    // this element's height across the below-board states.
    <div className={cls(shared.boardSeal, styles.board)} data-board>
      {/* While a past turn is open the shared `.historyFrame` rings the board and
          makes it click-through (pointer-events: none), so a click on it reaches
          the viewer's own document-level exit. */}
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          isViewingHistory && history.historyFrame,
          isWaitingForTurn && !isInteractive && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          makeEndingFrameClasses(endingOutcome, isViewingHistory),
        )}
      >
        {tiles.map((t) => {
          const position = Number(t.id)
          const myKey = t.puzzleTile.key[me.id]!
          const partnerKey = showsPartnerKey ? t.puzzleTile.key[partner.id] ?? null : null

          // The bystander arrows: a triangle toward each player who turned the
          // tile over. Mine locks the tile for ME; my partner's does not — the
          // word may be my agent in the other direction (the Duet rule). The
          // builder decides who the arrows point at; the board draws them.
          const arrowToMe = t.revealed?.arrows.has(me) ?? false
          const arrowToPartner = t.revealed?.arrows.has(partner) ?? false

          // The tile background is what it SHOWS, the same for both players:
          //   green  — an agent was contacted
          //   red    — the assassin was hit
          //   tan    — someone turned it over as a bystander (who → the arrows)
          //   white  — nobody has guessed it
          const bgCls =
            t.revealed?.as === 'G' ? styles.bgAgent
            : t.revealed?.as === 'A' ? styles.bgAssassin
            : t.revealed?.as === 'N' ? styles.bgNeutral
            : styles.bgWhite

          // Clickable while I am guessing and the builder says I may guess it.
          const clickable = isGuessing && t.guessable
          const isInFlight = inFlightPos === position

          return (
            <button
              key={t.id}
              type="button"
              className={cls(
                shared.tileFace,
                shared.tile,
                styles.overlayTile,
                bgCls,
                // The keyboard's pick, waiting for Enter, and its cursor.
                picked === position && shared.picked,
                cursor !== null && positionAt(cursor.x, cursor.y, BOARD_SHAPE.numCols) === position && shared.selectionCursor,
                isInFlight && shared.dimInFlight,
                flashing.has(position) && shared.attentionFlash,
                shaking.has(position) && shared.verdictShake,
                // Turn-history: this tile was decided on the turn being viewed.
                litTileIds.has(t.id) && styles.historyTile,
              )}
              disabled={!clickable || isInFlight}
              onClick={() => clickable && onGuess(position)}
            >
              {/* My partner's key-card square — top-right, once the game is
                  over and I have asked to see it. */}
              {partnerKey !== null && (
                <span
                  className={cls(styles.keySquare, styles.keyPeer, styles[KEY_SQUARE[partnerKey]])}
                  aria-hidden
                />
              )}
              {/* My partner turned this over as a bystander — a triangle above
                  the word, pointing up toward them. */}
              {arrowToPartner && (
                <span className={cls(styles.triangle, styles.triPeer)} aria-hidden />
              )}
              {/* --len drives the shared .tileWord auto-fit font heuristic. */}
              <span
                className={shared.tileWord}
                style={{ ['--len' as string]: t.puzzleTile.word.length }}
              >
                {t.puzzleTile.word}
              </span>
              {/* I turned this over as a bystander — a triangle below the word,
                  pointing down toward me. */}
              {arrowToMe && (
                <span className={cls(styles.triangle, styles.triMine)} aria-hidden />
              )}
              {/* My key-card square — bottom-left. Hidden while I am the one
                  guessing (my own key says nothing about my partner's clue);
                  shown the rest of the time — cluing, waiting, game over. */}
              {!isGuessing && (
                <span
                  className={cls(styles.keySquare, styles.keyMine, styles[KEY_SQUARE[myKey]])}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
