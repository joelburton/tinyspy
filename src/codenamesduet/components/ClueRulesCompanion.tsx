// cs-unmet

import { Companion } from '@/common/floating-panels/Companion'
import type { GSetup } from '../types'
import styles from './ClueRulesCompanion.module.css'

/**
 * The rules about giving a clue, in brief — opened by itself at the start of a
 * game for both players and from the info column's "Rules for clues" link
 * while a clue is being written (`useClueRules`). The lines a setup option
 * changes follow this game's setup. It closes by its ✕, like every companion.
 */
export function ClueRulesCompanion({
  setup,
  onClose,
}: {
  setup: GSetup
  onClose: () => void
}) {
  return (
    <Companion
      density="loose"
      persistKey="codenamesduet:clueRules:rect"
      title="Clue-giving rules"
      onClose={onClose}
      defaultSize={{ width: 440, height: 520 }}
      minWidth={280}
      minHeight={240}
    >
      <ul className={styles.rules}>
        <li>English only; <b>proper nouns OK</b></li>
        <li>About word <b>meaning</b> <small>(not sound or length)</small></li>
        <li>
          <b>Acronyms allowed</b> if normally a word
          <br/>
          <small>(any part treated as word: <s>CENTRAL</s> for CIA)</small>
        </li>
        {setup.strict_words && (
          <li><b>Non-hyphenated</b>; no punctuation/digits</li>
        )}
        {!setup.strict_words &&
            <li><b>Hyphenated words & digits OK</b></li>}
        <li>
          <b>Can't use any form</b> of visible word
          <br/>
          <small>(SCIENTIST: <s>SCIENTIFIC</s>, <s>NEUROSCIENCE</s>)</small>
        </li>
        <li>
          <b>Can't use any part</b> of visible word
          <br/>
          <small>(EARTHQUAKE: <s>QUAKING</s>, <s>EARTHENWARE</s>)</small>
        </li>
        <li>
          Can give <b>"zero clues"</b> like "<code>0 BIRD</code>"
          <br/>
          <small>(Can be clue to pick other animals)</small>
        </li>
      </ul>
    </Companion>
  )
}
