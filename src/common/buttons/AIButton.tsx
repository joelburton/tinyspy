// cs-audited-buttons

import { IconAI } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * "Use AI" button — invokes an AI-powered helper (e.g. codenamesduet's Claude
 * clue suggester, which runs through its edge function). The **sparkles** glyph is
 * the near-universal "AI / magic" idiom, and it wears `HintButton`'s dark
 * amber — the shared "help you asked for, neither good nor bad" color.
 *
 * A SEPARATE component from `HintButton` on purpose: asking an AI is a distinct
 * action from asking for a built-in hint (a clue the game already knows), so they
 * get distinct glyphs + labels even though they share a color. Default label
 * "AI".
 */
export function AIButton({ label = 'AI', icon = IconAI, tone = 'caution', ...rest }: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
