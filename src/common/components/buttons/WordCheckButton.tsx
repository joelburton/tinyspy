import { IconWordCheck } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Check-my-own-work button — asks the server whether the board in front of you
 * satisfies the rules it would be judged by anyway, and paints the cells that
 * don't. bananagrams' "Check words" is the first user.
 *
 * **`info` tone, not the amber of Hint / Spoiler**, and the distinction is the
 * point: those hand over something you didn't have (a clue, an answer). This
 * hands over nothing — every letter it flags is already on your screen, and the
 * rule it applies is one you could apply yourself with a dictionary and a
 * minute. It's verification, so it reads as a neutral utility (the blue of
 * Restart / New game), not as help you might feel funny about taking.
 *
 * That's also why it's always available, regardless of a game's word-checking
 * setup: the setup option governs when the SERVER enforces words, not whether
 * you may ask about your own board.
 */
export function WordCheckButton({ label = 'Check words', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconWordCheck} label={label} tone="info" {...rest} />
}
