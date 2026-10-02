// cs-unmet

import { useEffect } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { buildPsychicnumPrintModel } from '../pdf/model'
import { printPsychicnumPdf } from '../pdf/printPsychicnumPdf'
import type { TileWord } from '../lib/tileResults'
import type { GameData } from './useGame'

/**
 * What `request_hint` answers. TWO `ok`s: `hint` carries the row's text whether
 * or not there was a clue to give, so `result` is the only thing that tells a
 * real clue from "this word has none".
 */
type HintAnswer = {
  result: 'hint' | 'no-hint'
  hint: string
}

/** What `request_spoiler` answers: one `ok`, carrying the secret handed over. */
type SpoilerAnswer = {
  result: 'spoiler'
  word: TileWord
}

/**
 * Every command psychicnum offers, bound. The info column's action row places
 * them; the menu lists them; each one's key, glyph and availability come from
 * the action, so the surfaces cannot drift.
 */
export type PsychicnumActions = {
  // Each key is spelled as its action's id (`act-hint` → `actHint`), so a grep
  // for either finds every trace of the action (src/guards/actionIds.test.ts).
  //
  // Ask for a clue. Grayed rather than gone when you can't ask — the glyph is
  // worth teaching either way.
  actHint: Action
  // Mid-game cheat: hand over one unfound secret word (the amber bare-eye
  // glyph). Logs to the event log like a hint does.
  actSpoiler: Action
  // Show the three secrets at game-over (their tiles go green) — or hide them
  // again. A local display toggle shared with the menu twin; nothing is
  // written, no peer affected. It carries its own two faces, so a surface
  // places one button either way.
  actReveal: Action
  // Hunt the SAME board + secrets again from scratch.
  actRestart: Action
  // Start a fresh follow-up game — same setup + players, a new board + secrets.
  // Disables itself while the create is in flight, so a slow network reads as
  // "working" rather than "nothing happened".
  actNewGame: Action
  // Drop out of a race; the others keep going. Hidden outside one.
  actConcede: Action
  // The whole table stops, with no result. Hidden in a race that doesn't
  // offer it — so the pair above can be placed unconditionally.
  actStopGame: Action
  // Print the board and the log; the menu's alone, with no twin in the row.
  actPrintBoard: Action
  // Leave for the club page — the shell's own, off `PlayAreaLoaderProps.menu`,
  // carried here so a surface that places the row has every action in one
  // object.
  actBackToClub: Action
}

/**
 * Bind every psychicnum command and publish the game's menu from them. Hands
 * back the `actions`, for the info column's action row, and `secretsShown`,
 * the reveal's local state, which the board reads to turn the secrets green.
 *
 * An action is what the button, the menu row and the key all read, so none of
 * them can drift from another — and `pending` grays every surface of one for
 * the length of its run, which is why no handler here carries an in-flight
 * flag of its own. None of them is a `useCallback`: `useBindAction` reads its
 * options through a ref it refreshes every render, and the action's
 * identity turns on `pending` alone.
 *
 * **The menu reads as the info column's action row does, divider for
 * divider.** The two are views of the same actions, so a player who learned
 * the row finds the menu in the same order (docs/playarea.md). Print is the one
 * row with no twin in the row, and sits after them.
 */
export function useActionsAndMenu({
  gd,
  myId,
  localFeedbackSlot,
  clubHandle,
  goToFollowUpGame,
  menu,
  brand,
}: {
  gd: GameData
  myId: string
  // Where a refused command says so.
  localFeedbackSlot: FeedbackSlot
  clubHandle: string
  brand: string
} & Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'>): {
  actions: PsychicnumActions
  secretsShown: boolean
} {
  // The shared trio — Stop / Concede / Restart. psychicnum's own bit is which
  // `db` they call; a restart needs nothing else from this game, because the
  // page unmounts the whole play surface when the run changes
  // (common/game-page/doc.md). The turn-history view, a lingering result and
  // the revealed secrets all go with it, so the same three are hunted blind
  // again.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.gameId,
    isTerminal: gd.isGameEnded,
    mode: gd.mode,
    isLocallyTerminal: gd.standing.isPlayerEnded,
    localFeedbackSlot,
  })

  // Hint (a clue) and spoiler (the answer word itself) both land in the event
  // log; coop teammates get a header message. Nothing to do with the return
  // value here — those rows arrive with the next reload. "Reveal" on this page
  // means one thing only: the whole solution at game-over, which is local FE
  // state and no RPC at all.
  async function getHint() {
    const res = await runRpc<HintAnswer>(db.rpc('request_hint', { p_game_id: gd.gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hint') {
      // Nothing to show: the clue arrives as a `kind = 'hint'` row and lands in
      // the event log, where it stays. A pill would say the same thing twice
      // and then vanish.
      return
    } else if (res.type === 'ok' && res.data.result === 'no-hint') {
      return
    } else {
      reportUnhandled('request_hint', res)
      return
    }
  }

  async function getSpoiler() {
    const res = await runRpc<SpoilerAnswer>(db.rpc('request_spoiler', { p_game_id: gd.gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'spoiler') {
      // Same as the hint: the word arrives as a `kind = 'spoiler'` row and the
      // event log is where it belongs — a spoiler you asked for should stay
      // readable, not flash past.
      return
    } else {
      reportUnhandled('request_spoiler', res)
      return
    }
  }

  // The hint and the spoiler. Grayed rather than dropped when you can't ask:
  // the menu row is what NAMES those glyphs (docs/ui.md → the menu is the
  // legend), so a disabled row still teaches the lightbulb and the bare eye.
  const actHint = useBindAction('act-hint', {
    // Three states, not two: GONE once the game is over (there is no guess left
    // to nudge), gray while the game is live and you are out of guesses, live
    // otherwise. The in-flight beat is `pending`'s to gray, not this one's.
    describe: () => (gd.isGameEnded ? 'hidden' : gd.standing.isStillPlaying ? 'active' : 'disabled'),
    run: getHint,
  })
  const actSpoiler = useBindAction('act-spoiler', {
    // Same three states as the hint above.
    describe: () => (gd.isGameEnded ? 'hidden' : gd.standing.isStillPlaying ? 'active' : 'disabled'),
    run: getSpoiler,
  })

  // The ending's secrets reveal. The three secrets are NOT shown just because
  // the game ended: `replay_board` hunts the SAME board and the SAME three
  // secrets again (see its RPC comment), so auto-revealing on a loss would leave
  // Restart with nothing to find.
  //
  // The ask is LOCAL and reversible (useSolutionReveal): mine alone, so a
  // teammate can go on eyeing the board for the three while I look, and the
  // same control hides them again. The secrets themselves are on every client
  // once the game has ended, so this is purely which tiles go green.
  //
  // `impliedBy: hasSolved` is the exception: finding all three IS the win
  // here, and a found secret's tile is already green — so a solver is looking
  // at the answer key and showing it adds nothing. MY three, not the game's
  // verdict: compete's loser found fewer.
  const {
    revealed: secretsShown,
    toggle: toggleSecrets,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.standing.hasSolved })

  // Show the three secrets, or hide them again — nothing is written and no
  // peer is affected. Both faces come from `describeReveal`, which is where the
  // rule for every game's reveal lives.
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON until EVERYONE is done, so
      // a player who dropped out cannot spoil a race that is still running. The
      // menu row and the Help list keep it all game, grayed, because they NAME
      // the glyph (docs/ui.md → the menu is the legend).
      if (gd.standing.isStillPlaying && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'solution', revealed: secretsShown, impliedBySolve, isTerminal: gd.isGameEnded })
    },
    run: toggleSecrets,
  })

  // New game — a FRESH game (new id, a new random board + secrets) with THIS
  // game's setup + players + mode, in the same club. psychicnum's create_game
  // samples its board inline, so this is a direct RPC — no edge function.
  // Non-destructive (common._create_game un-currents this game into the club
  // list), so no confirm; the creator jumps in via `goToFollowUpGame`, peers
  // arrive via the game-invitation toast.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: gd.setup,
        p_player_user_ids: gd.players.map((player) => player.id),
        p_mode: gd.mode,
      }),
    )
    if (res.type === 'not-ok') {
      // Shown even for a fault whose modal has already fired: a modal escalates
      // rather than replaces, so the board must not go silent when it is
      // dismissed. See docs/envelopes.md.
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
  // The registry asks NEW_GAME_CONFIRM mid-play (an accidental `+` should not
  // read as "I just lost my game" — the text says shelved, not ended) and goes
  // straight through once the game has ended, and the shared run's single
  // flight is what stops a second press dealing a second game.
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.isGameEnded,
    // Reachable all game from the menu and `+` — NEW_GAME_CONFIRM is written
    // for that ("will be shelved, not lost", "Keep playing"). A BUTTON only at
    // the end, where "deal another" is what you came to the row for.
    describe: (asker) => (asker === 'button' && !gd.isGameEnded ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time (RLS already
  // scoped the events to what I may see), so it works mid-game or at the end —
  // and so the menu needn't rebuild when the board changes.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      // The board/turn/score judgment (whose marks belong on whose board — one
      // merged track in coop, one PER PLAYER at a compete game's end) lives in
      // the pure builder; see pdf/model.ts.
      printPsychicnumPdf(
        buildPsychicnumPrintModel({
          brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          mode: gd.mode,
          isGameEnded: gd.isGameEnded,
          words: gd.board.words,
          events: gd.events,
          requiredSecretsCount: gd.readout.requiredSecretsCount,
          players: gd.players,
          myId,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL psychicnum game menu. `buildGameMenu` supplies the framing (Help +
  // chat above, Back to club below); the middle is this game's own rows, each
  // one an action made above — so a row's words, glyph, key and availability
  // come from the action rather than being typed here a second time. The
  // effect re-runs only when the SHAPE changes, which is why every dep is a
  // stable value.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that
        // isn't its own, so this list is the same in coop and compete.
        exits: [actConcede, actStopGame],
        extra: [
          // The menu twins of the info column's hint and spoiler buttons.
          { items: [actHint, actSpoiler] },
          {
            items: [
              // The menu twin of the ending row's boxed-eye button — the same
              // action, so a player who has scrolled past the row reaches the
              // identical toggle, wearing the identical face.
              actReveal,
              // The same pair the ending's action row offers, reachable mid-game too.
              actRestart,
              actNewGame,
            ],
          },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actStopGame, actHint, actSpoiler, actReveal, actRestart, actNewGame, actPrintBoard])

  return {
    actions: {
      actHint,
      actSpoiler,
      actReveal,
      actRestart,
      actNewGame,
      actConcede,
      actStopGame,
      actPrintBoard,
      actBackToClub: menu.actBackToClub,
    },
    secretsShown,
  }
}
