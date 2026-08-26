// cs-unmet

import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { SetupSection } from '../../common/components/setup/SetupSection'
import type { SetupBodyProps } from '../../common/lib/games'
import type { DeckKind } from '../lib/cards'
import { paletteOf, type Palette, type SetgameSetup } from '../lib/setup'

import '../theme.css'

/**
 * setgame's per-game setup form. Mode is locked at the gametype level
 * (coop/compete — picked by which Start button was clicked), so this body never
 * renders a mode radio.
 *
 * One real knob: which deck. Everything else about a setgame board follows from
 * it — twelve cards or nine, and the deal-three rule owns the rest — so there is
 * no board-size picker and no target to set.
 *
 * (`theme.css` is imported here as well as in PlayArea: the stylesheet is bundled
 * per lazy chunk, and the setup dialog is its own chunk. Without this the deck
 * preview's card colors are silently undefined.)
 */
export function SetupForm({ mode, players, value, onChange }: SetupBodyProps) {
  const s = value as SetgameSetup

  return (
    <>
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. */}
      <SetupCoopStyleSection
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coop_style: coopStyle, first_turn_user_id: firstTurnUserId })
        }
      />


      <SetupSection label={s.deck === 'junior' ? 'Deck: Junior' : 'Deck: Full'}>
        <RadioRow<DeckKind>
          help="The full deck is all four attributes, 81 cards, twelve face-up. Junior drops shading — every card is solid — leaving 27 cards dealt nine at a time. Fewer things to hold in your head, and a real starting point rather than a slower version of the same game."
          name="setgame-deck"
          value={s.deck}
          onChange={(deck) => onChange({ ...s, deck })}
          options={[
            { value: 'full', label: 'Full (81)' },
            { value: 'junior', label: 'Junior (27)' },
          ]}
        />
      </SetupSection>

      <SetupSection
        label={paletteOf(s) === 'colorblind' ? 'Colors: Colorblind-safe' : 'Colors: Traditional'}
      >
        <RadioRow<Palette>
          help="Traditional is Set's own red, green and purple. The colorblind-safe set swaps in blue, orange and magenta, which stay apart for red-green color blindness — worth knowing that two cards can differ ONLY by color here, so shape and shading can't rescue a pair you can't tell apart. It's one choice for the whole table."
          name="setgame-palette"
          value={paletteOf(s)}
          onChange={(palette) => onChange({ ...s, palette })}
          options={[
            { value: 'traditional', label: 'Traditional' },
            { value: 'colorblind', label: 'Colorblind-safe' },
          ]}
        />
      </SetupSection>

      <SetupTimerSection
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </>
  )
}
