// cs-blessed-codenamesduet

import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { TOTAL_AGENTS } from '../lib/agents'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useHistoryView } from '../hooks/useHistoryView'
import { useShowPartnerMessages } from '../hooks/useShowPartnerMessages'
import { CodenamesduetAISuggestCompanion } from './CodenamesduetAISuggestCompanion'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // codenamesduet-specific color tokens (lazy-loaded with this chunk)
import type { GGameData, GSuggestState } from '../types'

/**
 * The manifest's component: builds `gd` from the blob the page was handed and
 * draws the surface.
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const { gd } = useGame(ctx)
  return (
    <PlayArea
      gd={gd}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
    />
  )
}

type PlayAreaProps = Pick<PlayAreaLoaderProps, 'globalFeedbackSlot' | 'goToFollowUpGame' | 'menu'> & {
  gd: GGameData
}

/**
 * codenamesduet's play surface — the coordinator. It holds no board and draws
 * no control of its own: `BoardCol` renders the 5×5 board with the below-board
 * slot (the clue strip, or the local slot's pill), and `InfoCol` the readout,
 * the banners, the action row, the disclosures and the event log. This
 * component decides what each column is handed: the live board or a viewed
 * turn's, the slots, the actions. Every move is judged by the server, and the
 * columns own their RPCs — `BoardCol` the guess, `ClueStrip` the clue and the
 * pass.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it.
 *
 * **The end of a game is in-page** (docs/ui.md → Terminal results): the
 * below-board slot carries the ending's `pillText` and the action row its
 * `infoColText`, both until the player leaves. A win — only a win — also pops
 * `<CelebrationBlockingModal>` at the moment the last agent is contacted.
 */
function PlayArea({
  gd,
  globalFeedbackSlot,
  goToFollowUpGame,
  menu,
}: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────

  // The board is worked by clicks, so the page itself has nowhere for Tab to go
  // and an empty ring keeps it from walking out to the browser. While a clue is
  // being given, the clue form's own ring is innermost and Tab is its (ClueStrip).
  useTabRing([])

  // Mobile (docs/mobile.md → The info-sheet recipe): below the breakpoint the info
  // column is an off-canvas <InfoSheet>, reached from the header. The clue
  // field raises the OS keyboard, and the giver needs the board's key colors
  // while composing, so the board keeps its size and the page scrolls.
  const infoSheet = useInfoSheet()

  // The win's celebration — at the MOMENT the pair contacts the 15th agent, on
  // both clients at once, and never on mount, so an already-won game opens
  // quietly (`useCelebration`). Duet is a team of two, so my win is the team's.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // The AI clue-suggestion dialog's state — held here, not in the clue form, so
  // its panel renders at the layout's level (see the render). The form drives
  // it through `onSuggestionChange`.
  const [clueSuggestion, setClueSuggestion] = useState<GSuggestState | null>(null)
  console.log('[ClueHint] PlayArea render — clueSuggestion:', clueSuggestion)

  // ─── The local slot, and what stands in it ─────────────

  // The below-board slot, for messages about ME. Born here because BOTH columns
  // show into it — BoardCol's guess and clue strip (a refused guess / clue /
  // pass) and InfoCol's Stop — and while it holds anything the pill takes the
  // clue strip's place.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The ending's message, for the pill and the info column. Duet is a team of
  // two, so the game's ending is both players' and there is none of a
  // player's own.
  const gameEndingMessage = useGetGameEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage,
    playerEndingMessage: null,
  })

  // ─── What my PARTNER is doing, in the header slot ──────
  useShowPartnerMessages(gd, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Opening an event-log #N replays that turn's board.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them.
  const { actions, partnerKeyShown } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        // The board to draw: a viewed turn's, or the live one.
        tiles={historyView.tiles ?? gd.team.board.tiles}
        historyView={historyView}
        partnerKeyShown={partnerKeyShown}
        endingOutcome={gameEndingMessage?.outcome ?? null}
        localFeedbackSlot={localFeedbackSlot}
        onSuggestionChange={setClueSuggestion}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          endingMessage={gameEndingMessage}
          actions={actions}
          historyView={historyView}
        />
      </InfoSheet>

      {/* The AI clue-suggestion dialog — a child of `.layout`, like the other
          dialogs: react-rnd positions from the static flow position, and deep
          in the flex-column board column a panel lands below the viewport. */}
      {clueSuggestion && (
        <CodenamesduetAISuggestCompanion
          state={clueSuggestion}
          onClose={() => setClueSuggestion(null)}
        />
      )}

      {/* The win's celebration — the one modal this game shows at the end; the
          verdict itself is in-page. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={`All ${TOTAL_AGENTS} agents contacted.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
