// cs-unmet

import { IconAI } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * "Use AI" button — invokes an AI-powered helper (e.g. codenamesduet's Claude
 * clue suggester, which runs through its edge function). The **sparkles** glyph is
 * the near-universal "AI / magic" idiom, and the **`warning`** tone (dark amber)
 * is the shared "helper / important, not good-or-bad" color it shares with
 * `HintButton`.
 *
 * A SEPARATE component from `HintButton` on purpose: asking an AI is a distinct
 * action from asking for a built-in hint (a clue the game already knows), so they
 * get distinct glyphs + labels even though they share the amber tone. Default
 * label "AI".
 */
export function AIButton({ name = 'AI', icon = IconAI, tone = 'caution', ...rest }: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} tone={tone} {...rest} />
}
