import { IconExchange } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Swap-tiles button — return some rack tiles to the bag and draw replacements
 * (scrabble's exchange). The two-way-arrows glyph at **`info`** tone (the accent
 * color, "no valence — just a different action"): swapping isn't good or bad and
 * isn't the primary move, so it reads as a distinct secondary commit alongside
 * the primary Submit. Default label **"Swap"**.
 *
 * It IS a turn-committing action (it costs the turn in compete + counts as a
 * scoreless turn), which is why it sits on the commit side of scrabble's action
 * row next to Submit — but Submit stays the filled-accent primary, so Swap takes
 * the lighter outline+tone weight.
 */
export function ExchangeButton({ label = 'Swap', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconExchange} label={label} tone="info" {...rest} />
}
