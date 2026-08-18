import type { MouseEvent } from 'react'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { cls } from '../../common/lib/util/cls'
import { memberById } from '../../common/lib/game/peers'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { TurnLog, TurnLogBar } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import type { Member } from '../../common/lib/games'
import type { GuessRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  /** EVERY row the viewer can see — accepted AND rejected. This is the one
   *  place rejects are shown; the board and the scores take `validGuesses`. */
  guesses: GuessRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
}

/** What each rejected row says, in the log's terse voice. The pill that fired
 *  at submit time said more; this is the durable one-word record. */
const REJECT_LABEL: Record<NonNullable<GuessRow['reason']>, string> = {
  missing_base: 'no base',
  too_short: 'too short',
  not_a_word: 'not a word',
}

/**
 * wordiply's turn log — the answer to "who guessed what?", which coop can't get
 * any other way (the board shows five words with no attribution).
 *
 * **It logs rejects too**, which is what makes it worth having: the reject pill
 * is local, so without this three players independently try the same non-word
 * and nobody can see it happened. Cross-player memory is the part that can't be
 * done client-side. `wordiply.guesses` is the turn log — see its table header.
 *
 * Row anatomy, using the shared atoms:
 *   - **outcome bar** — `good` for an accepted guess; `bad` for a structural
 *     reject (a rules error, and in turn-by-turn coop it cost the caller their
 *     go); `partial` (amber) for a dictionary miss, which is a near-miss rather
 *     than a wrong move — the list may be at fault, or it was a typo.
 *   - **the word** — the row's headline, so it takes the slack-absorbing
 *     `turnLog.main` column. Definable only when it's a real word: looking up
 *     something the dictionary just rejected would be a dead end.
 *   - **length / reason** — an accepted guess shows its LENGTH (wordiply's one
 *     live readout; scores stay terminal-only). A reject shows why instead.
 *   - **who** — the actor's `<ActorTag>`, right-aligned so the discs line up.
 *
 * **No `#N` handle.** The seven history-viewer games make the number clickable
 * to replay the board at that turn; wordiply has no viewer and doesn't want one
 * — its board is five rows all visible at once, so "replay turn 3" would just be
 * "look at rows 1-3, which are already on your screen". Rejects also have no
 * `seq` (they occupy no board row), so there'd be nothing to number them with.
 */
export function GameTurnLog({ guesses, players, selfId, mode, isTerminal }: Props) {
  const who = useTurnLogPlayerPicker<GuessRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = who.filter(guesses)

  // Click-to-define (a common feature — see common/hooks/definitions/useDefinePopover).
  const { define, popover } = useDefinePopover()
  // Pointer-only, deliberately: NOT focusable, no `role="button"`. See
  // common/theme.css → `.definable` for why every definable word is like this.
  const defineProps = (word: string) => ({
    className: 'definable',
    title: 'Click to define',
    onClick: (e: MouseEvent<HTMLSpanElement>) => define(word.toLowerCase(), e.currentTarget),
  })

  return (
    <>
      <TurnLog
        heading="Guesses"
        headerAction={who.picker}
        empty={shown.length === 0}
        emptyText={who.emptyText}
        scrollKey={shown}
      >
        {shown.map((g) => (
          <tr key={g.id} className={turnLog.turnLogDivider}>
            <TurnLogBar
              outcome={g.valid ? 'won' : g.reason === 'not_a_word' ? 'near' : 'lost'}
            />
            <td className={turnLog.main}>
              {g.valid ? (
                <span {...defineProps(g.word)}>{g.word.toUpperCase()}</span>
              ) : (
                // Not definable: the word was just rejected as not-a-word (or
                // as breaking the rules), so a lookup would dead-end.
                <span className={styles.rejected}>{g.word.toUpperCase()}</span>
              )}
            </td>
            <td className={cls(turnLog.meta, styles.outcome)}>
              {g.valid ? g.length : REJECT_LABEL[g.reason ?? 'not_a_word']}
            </td>
            <TurnLogActor actor={memberById(players, g.user_id)} />
          </tr>
        ))}
      </TurnLog>
      {popover}
    </>
  )
}
