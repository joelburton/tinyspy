// cs-unmet

import { DictBandField } from '../../common/components/fields/DictBandField'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { SetupSection } from '../../common/components/setup/SetupSection'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { cleanBase, type WordiplyValues } from '../lib/setup'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { ManualBoardField } from '../../common/components/fields/ManualBoardField'

/**
 * wordiply's per-game setup form. Mode is locked at the gametype level
 * (coop/compete — picked by which Start button the player clicked), so this
 * body never renders a mode radio.
 *
 * It's deliberately minimal: a mode paragraph, one dictionary-difficulty
 * band (the base is a letter-combination, not a word, so there's no base
 * difficulty; and wordiply isn't a race-to-rank, so no target-rank picker),
 * and the shared `<SetupTimerSection>`.
 *
 * Controlled component: state lives in the wrapping `SetupGameModal`; this
 * body renders `value` and signals via `onChange`.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue,
}: SetupBodyProps) {
  const s = values as WordiplyValues
  const set = setValue as SetupSetter<WordiplyValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  // The custom-starter section's summary carries its own value, so a closed
  // section still shows what's set (SetupSection's contract).
  const customBase = s.custom_base ?? ''
  const customBaseLabel = customBase
    ? `Starter: ${customBase.toUpperCase()}`
    : 'Starter (optional)'

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        value={s.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. */}
      <SetupCoopStyleSection
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          { set('coop_style', coopStyle); set('first_turn_user_id', firstTurnUserId) }
        }
      />

      <SetupSection label={`Dictionary: ${difficultyValue(s.difficulty)}`}>
        <DictBandField
          name="difficulty"
          length={null}
          minBand={1}
          maxBand={6}
          value={s.difficulty}
          onChange={(difficulty) => set('difficulty', difficulty)}
        />
      </SetupSection>

      {/* Optional custom starter, behind a disclosure whose summary shows the
          chosen letters (e.g. "Starter: MOTH") or "(optional)" when blank.
          Blank → a random starter (the normal path); fill it to play exactly
          these letters — which is how you send a friend a challenge.

          Start is gated on `customBaseError` (via the manifest's validate), but
          only on SHAPE: whether the letters yield a board is the edge
          function's call, so an unusable starter fails at Start with the
          server's reason — the same deal boggle's constraints get. Cleared
          input stores `undefined` so the edge function sees it as absent →
          random. */}
      <SetupSection label={customBaseLabel}>
        <ManualBoardField
          help="Leave blank for a random starter, or set your own: 2–4 letters that every guess must contain. Very short starters usually match too many words to make a puzzle."
          name="custom_base"
          value={customBase}
          onChange={(raw) => set('custom_base', cleanBase(raw) || undefined)}
          placeholder="MOTH"
          chars={4}
          maxLength={4}
        />
      </SetupSection>

      <SetupTimerSection value={s.timer} onChange={(timer) => set('timer', timer)} />
    </>
  )
}
