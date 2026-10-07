// cs-unmet

import { useEffect, type RefObject } from 'react'
import { useBindAction } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { boardLetters, boardToGrid } from '../lib/board'
import { boardWords } from '../lib/words'
import { printBananagramsPdf, type BananagramsTrack } from '../pdf/printBananagramsPdf'
import type { GActions } from '../reactTypes'
import type { GGameData } from '../types'

/**
 * Bind every bananagrams command the info column places and publish the game's
 * menu from them. Hands back the `actions`, for the action row.
 *
 * An action is what the button, the menu row and the key all read, so none of
 * them can drift from another — and `pending` grays every surface of one for
 * the length of its run, which is why no handler here carries an in-flight
 * flag of its own.
 */
export function useActionsAndMenu({
  gd,
  myBoardRef,
  localFeedbackSlot,
  goToFollowUpGame,
  menu,
}: {
  gd: GGameData
  // My board as it is on screen, which the server's copy trails between saves;
  // the print reads it at click time.
  myBoardRef: RefObject<string>
  // Where a refused command says so.
  localFeedbackSlot: FeedbackSlot
} & Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'>): {
  actions: GActions
} {
  // The shared trio — Stop / Concede / Restart. A race's exits: Concede, whose
  // question also offers stopping the whole table, and Stop once a Concede is
  // spent (useStandardGameActions says why the two live behind one button).
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isGameEnded: gd.ended,
    mode: 'compete',
    // Out of the race while the game goes on: in this game, only by conceding.
    isPlayerEnded:!gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // New game — a fresh deal with this game's setup and players. The full
  // roster, conceded players included: conceding leaves THIS race, not the
  // group.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: gd.club.handle,
        p_setup: gd.setup,
        p_player_user_ids: gd.players.map((p) => p.id),
      }),
    )
    if (res.type === 'not-ok') {
      // Shown even for a fault whose modal has already fired: a modal escalates
      // rather than replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its ending button, from one action.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game
  // rather than ending it) and goes straight through once the game has ended.
  const actNewGame = useBindAction('act-new-game', {
    ended: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended
      ? 'hidden'
      : 'active'),
    run: createNewGame,
  })

  /** One printed column from a board string: its grid, its words, its tally. */
  function makeTrack(who: string, letters: string): BananagramsTrack {
    const words = Array.from(new Set(boardWords(letters))).sort()
    const nPlaced = boardLetters(letters).length
    return {
      who,
      board: boardToGrid(letters),
      words,
      result:
        `${nPlaced} tile${nPlaced === 1 ? '' : 's'} placed · ` +
        `${words.length} word${words.length === 1 ? '' : 's'}`,
    }
  }

  // Print — a column per player, built at CLICK time (common/pdf/doc.md). My
  // column reads the live board; the others' boards are in `gd` once the game
  // has ended, so mid-game this prints my column alone.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      const mine = makeTrack(`${gd.me.username} (you)`, myBoardRef.current)
      const others = gd.players
        .filter((p) => p !== gd.me && p.board !== null)
        .map((p) => makeTrack(p.username, p.board!.letters))
        // Roster order, so two printouts of the same game agree.
        .sort((a, b) => a.who.localeCompare(b.who))
      printBananagramsPdf({
        brand: gd.brand,
        gameTitle: gd.title,
        date: new Date().toLocaleDateString(),
        // The header counts MY board; each column carries its own tally, since
        // a race has no one number for the table.
        summary: mine.result,
        mode: 'compete',
        setupRows: gd.setupRows,
        tracks: [mine, ...others],
      })
    },
  })

  // The FULL bananagrams menu. `buildGameMenu` supplies the framing (Help and
  // chat above, Back to club below); the middle is this game's own rows, each
  // one an action made above, so a row's words, glyph, key and availability
  // come from the action rather than being typed a second time here.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        exits: [actConcede, actStopGame],
        extra: [
          { items: [actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actStopGame, actRestart, actNewGame, actPrintBoard])

  return {
    actions: {
      actRestart,
      actNewGame,
      actConcede,
      actStopGame,
      actPrintBoard,
      actBackToClub: menu.actBackToClub,
    },
  }
}
