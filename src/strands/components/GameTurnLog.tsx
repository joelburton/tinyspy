import type { MouseEvent } from 'react'
import { TurnLog, TurnLogBar, type TurnOutcome } from '../../common/components/game/lists/TurnLog'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { memberById } from '../../common/lib/game/peers'
import { cls } from '../../common/lib/util/cls'
import type { Member } from '../../common/lib/games'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import type { GuessRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  guesses: GuessRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
}

/**
 * How each submission paints its outcome bar, in the shared four-value
 * vocabulary (`TurnOutcome`). The mapping is the point:
 *
 *   - **good** — a theme word or the spangram. The thing you came for.
 *   - **partial** — a valid non-theme word. Real progress (it moves the hint
 *     bar) but not the goal, which is exactly what `partial` means elsewhere.
 *   - **bad** — too short, not a word, already counted. All three are misfires.
 *
 * A duplicate lands on `bad` rather than `neutral` because it EARNED NOTHING:
 * being generous about it in the log would misreport the hint economy.
 */
const OUTCOME: Record<GuessRow['result'], TurnOutcome> = {
  spangram: 'good',
  theme: 'good',
  hint_word: 'partial',
  duplicate: 'bad',
  too_short: 'bad',
  invalid: 'bad',
}

/** The short body after the word, matching the own-move pill's wording so the
 *  log and the pill say the same thing about the same submission. */
const BODY: Record<GuessRow['result'], string> = {
  spangram: 'spangram',
  theme: 'theme',
  hint_word: 'valid word',
  duplicate: 'already found',
  too_short: 'too short',
  invalid: 'not a word',
}

/**
 * strands' turn log — one `<tr>` per submission in the shared `<TurnLog>`.
 *
 * **Rejects are logged too**, which is a deliberate ruling rather than an
 * accident of storage: the log is the team's shared record of what has been
 * tried, and hiding the misses would make it lie about the session. (The
 * structurally impossible paths — off-board, self-crossing — never reach the
 * table at all; those raise, because only a broken client can produce one.)
 *
 * **Coop shows everyone's rows.** Joel's ruling: a peer sees your word when you
 * submit it, so there is no per-player split to make here. The compete sibling
 * will need the mode-aware RLS arm the other compete games carry.
 *
 * No `#N` handle: strands has no turn-history viewer yet (see the plan's
 * after-the-POC list), so a row's ordinal is a plain muted number.
 */
export function GameTurnLog({ guesses, players, selfId, mode, isTerminal }: Props) {
  // The whose-turns dropdown, its default, the aggregate label, the row filter
  // and the honest empty line all come from the shared hook — every turn-log
  // game carries it, on one vocabulary.
  const who = useTurnLogPlayerPicker<GuessRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose words to show',
    emptyLabel: 'No words yet.',
  })
  const shown = who.filter(guesses)

  // Click-to-define. Only words the DICTIONARY accepted are looked up: a theme
  // word can be a phrase ("FATHERSDAY") and a reject isn't a word at all, so
  // offering the affordance there would promise a definition that can't exist.
  const { define, popover } = useDefinePopover()
  const definable = (g: GuessRow) => g.result === 'hint_word' || g.result === 'duplicate'

  return (
    <>
      <TurnLog
        heading="Words"
        headerAction={who.picker}
        empty={shown.length === 0}
        emptyText={who.emptyText}
        scrollKey={shown}
      >
        {shown.map((g, i) => (
          <tr key={g.id} className={turnLog.turnLogDivider}>
            <TurnLogBar outcome={OUTCOME[g.result]} />
            <td className={turnLog.meta}>#{i + 1}</td>
            <td className={turnLog.main}>
              <span
                className={cls(
                  styles.word,
                  g.result === 'spangram' && styles.spangram,
                  g.result === 'theme' && styles.theme,
                  definable(g) && styles.definable,
                )}
                {...(definable(g)
                  ? {
                    title: 'Click to define',
                    onClick: (e: MouseEvent<HTMLSpanElement>) =>
                      define(g.word.toLowerCase(), e.currentTarget),
                  }
                  : {})}
              >
                {g.word.toUpperCase()}
              </span>
              <span className={turnLog.meta}> — {BODY[g.result]}</span>
            </td>
            <TurnLogActor actor={memberById(players, g.user_id)} />
          </tr>
        ))}
      </TurnLog>
      {popover}
    </>
  )
}
