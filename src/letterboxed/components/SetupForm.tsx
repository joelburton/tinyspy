// cs-unmet

import { useState } from 'react'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { DictBandField } from '../../common/components/fields/DictBandField'
import { SelectField } from '../../common/components/fields/SelectField'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { PAR } from '../lib/board'
import { cleanSides, formatSides } from '../lib/customBoard'
import type { LetterboxedValues } from '../lib/setup'
import { ManualBoardField } from '../../common/components/fields/ManualBoardField'
import { SIDE_SIZE } from '../lib/board'

/**
 * letterboxed's per-game setup form. Mode is locked at the gametype level
 * (coop/compete — picked by which Start button the player clicked), so this
 * body never renders a mode radio.
 *
 * Two knobs, and they pull in OPPOSITE directions, which the copy has to make
 * plain: a lower word limit is harder, while a higher dictionary band is
 * EASIER (more legal words means more escape routes off an awkward tail).
 *
 * Controlled component: state lives in the wrapping `SetupGameModal`; this
 * body renders `value` and signals via `onChange`.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as LetterboxedValues
  const set = setValue as SetupSetter<LetterboxedValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  // WHAT YOU TYPED, kept separately from what gets stored. The field shows your
  // text verbatim — dashes, dots, spaces and all — because you should be able
  // to paste "ABC-DEF-GHI-JKL" and still see a board rather than a run of
  // twelve letters. `custom_sides` on the setup holds the NORMALIZED twelve
  // (`cleanSides`), the shape the other games store and the shape the server
  // cross-checks against `board.sides`.
  //
  // Local state rather than deriving from `s.custom_sides`, because the two
  // genuinely differ: normalizing is lossy about separators, so the field could
  // not be reconstructed from the stored value. It initializes from the setup
  // once, which is right — `custom_sides` is stripped from the club default
  // (create_game), so a reopened dialog starts blank by design.
  const [typedSides, setTypedSides] = useState(s.custom_sides ?? '')

  // The section's summary carries its own value, so a closed section still
  // shows what's set (SetupSection's contract). CANONICAL, not the raw text:
  // the summary is the board as the app writes it everywhere else, and a
  // half-typed board summarises honestly ("Board: ABC-DE").
  const customSides = s.custom_sides ?? ''
  const customSidesLabel = customSides
    ? `Board: ${formatSides(customSides)}`
    : 'Board (optional)'

  const wordLimitLabel =
    s.extra_words === 0 ? `par — ${PAR} exactly` : `par + ${s.extra_words}`

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        value={s.player_user_ids}
        error={errors.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. Turn-by-turn suits this
          game unusually well: the chain hands off on its own. */}
      <SetupCoopStyleSection
        errors={errors}
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          { set('coop_style', coopStyle); set('first_turn_user_id', firstTurnUserId) }
        }
      />


      {/* Difficulty is expressed against PAR, not as a bare word count: every
          board is solvable in two, so "5 words" means nothing on its own while
          "par + 3" says exactly how much room you are giving yourself. */}
      <SetupSection label={`Word limit: ${wordLimitLabel}`}>
        <SelectField
          name="extra_words"
          error={errors.extra_words}
          help={<>Every board can be solved in {PAR}.</>}
        value={s.extra_words}
        onChange={(v) => set('extra_words', Number(v))}
      >
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n === 0
              ? `Par — ${PAR} words exactly`
              : `Par + ${n} — up to ${PAR + n} words${n === 5 ? ' (relaxed)' : ''}`}
          </option>
        ))}
        </SelectField>
      </SetupSection>

      <SetupSection label={`Dictionary: ${difficultyValue(s.legal_band)}`}>
        {/* Higher = easier here, unlike most games' difficulty bands. */}
        <DictBandField
          name="legal_band"
          error={errors.legal_band}
          help="A higher band accepts more words."
          length={null}
          minBand={1}
          maxBand={6}
          value={s.legal_band}
          onChange={(legal_band) => set('legal_band', legal_band)}
        />
      </SetupSection>

      {/* Optional custom board, behind a disclosure whose summary shows the
          board as it's written everywhere else ("Board: ABC-DEF-GHI-JKL") or
          "(optional)" when blank. Blank → a rolled board (the normal path);
          fill it to play exactly this one — which is how you send a friend a
          board you liked, read straight off its info column or its printout.

          Last before the timer because it's the rare knob: the two difficulty
          fields above are the ones every game touches.

          Start is gated on `customSidesError` (via the manifest's validate),
          but only on SHAPE — twelve distinct letters. Whether those letters
          are a board we can prove solvable in two is the edge function's call
          (it needs the seed table), so an unprovable board fails at Start with
          the server's reason. Cleared input stores `undefined` so the edge
          function sees it as absent → roll. */}
      <SetupSection label={customSidesLabel}>
        <ManualBoardField
          help="Leave blank to roll a random board, or type one: all twelve letters, clockwise from the top-left corner. Separators are ignored, so paste it however you have it written."
          name="custom_sides"
          error={errors.custom_sides}
          value={typedSides}
          onChange={(raw) => {
            setTypedSides(raw)
            set('custom_sides', cleanSides(raw) || undefined)
          }}
          placeholder="ABC-DEF-GHI-JKL"
          chars={15}
          // Four sides of three, exactly what `formatSides` prints in the
          // recap and the summary — so the thing you type and the thing you
          // read back are the same string.
          groups={[SIDE_SIZE, SIDE_SIZE, SIDE_SIZE, SIDE_SIZE]}
        />
      </SetupSection>

      <SetupTimerSection errors={errors} value={s.timer} onChange={(timer) => set('timer', timer)} />
    </>
  )
}
