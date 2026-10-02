// cs-unmet

import { PauseButton } from '../buttons/PauseButton'
import { formatTimerSeconds } from '../timer/timerLabel'
import { cls } from '../utils/cls'
import type { GamePause } from '../pause-suspend/pause'
import type { useCommonGame } from './useCommonGame'
import styles from './PauseAndClock.module.css'

type Props = {
  pause: GamePause
  timer: ReturnType<typeof useCommonGame>['timer']
  // The game has ended.
  ended: boolean
}

/**
 * The header's Pause button and game clock. The button goes once the game has
 * ended. A count-up clock stays after the end, showing how long it took; a
 * countdown goes. The clock is red whenever it isn't counting.
 */
export function PauseAndClock({ pause, timer, ended }: Props) {
  const timerKind = timer.mode.kind
  const showTimer = timerKind === 'countup' || (timerKind === 'countdown' && !ended)
  const isTimerStopped = pause.paused || ended
  return (
    <>
      {!ended && (
        <PauseButton
          paused={pause.paused}
          manual={pause.manuallyPausedBy !== null}
          onPause={pause.sendManualPause}
          onUnpause={pause.sendManualUnpause}
        />
      )}
      {showTimer && (
        <span className={cls(styles.timer, isTimerStopped && styles.timerStopped)}>
          {formatTimerSeconds(timer.displaySeconds)}
        </span>
      )}
    </>
  )
}
