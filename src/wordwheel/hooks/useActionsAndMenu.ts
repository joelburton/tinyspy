// cs-unmet

import { useEffect } from 'react'
import { useBindAction } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { memberById } from '@/common/members/memberList'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { buildWordSections } from '@/common/pdf/wordSections'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from '../db'
import { makeWordRows } from '../lib/wordRows'
import { printWordwheelPdf } from '../pdf/printWordwheelPdf'
import type { GActions, GGameData } from '../types'

/**
 * Every command wordwheel offers, bound once, and the menu that lists them.
 * The info column's action row places the actions, the menu lists them, and
 * their keys fire them — all reading the same action, so the surfaces cannot
 * drift. Stop, Concede and Restart are the shared trio; New game and Print
 * are this game's own.
 */
export function useActionsAndMenu({
  gd,
  localFeedbackSlot,
  goToFollowUpGame,
  menu,
}: {
  gd: GGameData
  // Where a refused command says so.
  localFeedbackSlot: FeedbackSlot
} & Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'>): { actions: GActions } {
  // The shared trio — Stop / Concede / Restart. wordwheel's own bit is which
  // `db` they call.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isGameEnded: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: in this game, a conceder.
    isPlayerEnded: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // New game — a FRESH game (new id, new board) with THIS game's setup, roster
  // and mode, in the same club, through the same edge function the manifest's
  // `startGameInClub` uses. Nothing is destroyed: the club's current-view flag
  // moves, leaving this game resumable from the club list. The creator jumps
  // in via `goToFollowUpGame`, peers arrive by invitation toast.
  async function createNewGame() {
    // A hand-picked board is a one-off, so the follow-up takes the random
    // path (doc.md → FE submissions); `create_game` strips the same two from
    // the saved club default.
    const freshSetup = { ...gd.setup, custom_center: undefined, custom_letters: undefined }
    const res = await runEdgeFn<CreatedGame>('wordwheel-build-board', {
      target_club: gd.club.handle,
      setup: freshSetup,
      player_user_ids: gd.players.map((p) => p.id),
      mode: gd.mode,
    })
    if (res.type === 'not-ok') {
      // No field to fix here, so whatever came back goes in the slot as it
      // reads, over the verdict, until its × is pressed — a fault whose modal
      // already fired centrally included, since the modal escalates rather than
      // replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
    } else {
      reportUnhandled('wordwheel-build-board', res)
    }
  }

  // New game — its `+`, its menu row and its ending button, from one action.
  // The registry asks NEW_GAME_CONFIRM mid-play and goes straight through once
  // the game has ended, where there is nothing to interrupt; the shared run's
  // single flight stops a second press building a second board.
  const actNewGame = useBindAction('act-new-game', {
    ended: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print the board — a snapshot at CLICK time (common/pdf/doc.md), the same
  // rows the on-screen list draws.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      const words = makeWordRows(gd).map((r) => ({
        word: r.word.toUpperCase(),
        pangram: r.isPangram ?? false,
        bonus: r.isBonus ?? false,
        found:
          r.kind === 'found'
            ? { points: r.points ?? 0, who: memberById(gd.players, r.userId)?.username ?? 'someone' }
            : null,
      }))
      printWordwheelPdf({
        brand: gd.brand,
        gameTitle: gd.title,
        date: new Date().toLocaleDateString(),
        // Coop's rank and totals are the TEAM's, so the header states them.
        // Compete's are per player — each section carries its own — so the
        // header states only the shared targets.
        summary: gd.compete
          ? `Target: ${gd.puzzle.reqdWordsScore} pts · ${gd.puzzle.nReqdWords} words`
          : `${gd.me.rankName} · Score ${gd.me.foundWordsScore} / ${gd.puzzle.reqdWordsScore} · Words ${gd.me.nFoundWords} / ${gd.puzzle.nReqdWords}`,
        outerLetters: gd.puzzle.outerLetters.split(''),
        centerLetter: gd.puzzle.centerLetter,
        mode: gd.mode,
        setupRows: gd.setupRows,
        // Coop prints one shared list; compete a section per player, plus a
        // trailing "Not found" at the end.
        sections: buildWordSections(
          words,
          gd.mode,
          gd.players.map((p) => ({ user_id: p.id, username: p.username })),
          gd.me.id,
        ),
      })
    },
  })

  // The FULL wordwheel menu. `buildGameMenu` supplies the framing (Help and
  // chat above, Back to club below); the middle is this game's own rows, each
  // one an action made above, so a row's words, glyph, key and availability
  // come from the action rather than being typed a second time here.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actStopGame],
        extra: [
          // The same two the ending's action row offers, reachable mid-game too.
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
