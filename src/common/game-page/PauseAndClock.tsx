// cs-unmet

import { PauseButton } from '../buttons/PauseButton'
import { formatTimerSeconds } from '../timer/timerLabel'
import { cls } from '../utils/cls'
import type { CommonGame } from './useCommonGame'
import styles from './PauseAndClock.module.css'

/**
 * The header's Pause button and game clock. The button goes once the game has
 * ended. A count-up clock stays after the end, showing how long it took; a
 * countdown goes. The clock is red whenever it isn't counting.
 */
export function PauseAndClock({ cg }: { cg: CommonGame }) {
  const timerKind = cg.timer.mode.kind
  const showTimer = timerKind === 'countup' || (timerKind === 'countdown' && !cg.isGameEnded)
  const isTimerStopped = cg.pause.paused || cg.isGameEnded
  return (
    <>
      {!cg.isGameEnded && (
        <PauseButton
          paused={cg.pause.paused}
          manual={cg.pause.manuallyPausedBy !== null}
          onPause={cg.pause.sendManualPause}
          onUnpause={cg.pause.sendManualUnpause}
        />
      )}
      {showTimer && (
        <span className={cls(styles.timer, isTimerStopped && styles.timerStopped)}>
          {formatTimerSeconds(cg.timer.displaySeconds)}
        </span>
      )}
    </>
  )
}
