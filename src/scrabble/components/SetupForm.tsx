// cs-unmet

import { DictBandField } from '../../common/components/fields/DictBandField'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { SelectField } from '../../common/components/fields/SelectField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { AI_BAND, AI_LEVELS, AI_LEVEL_LABEL, type AiLevel, type ScrabbleValues } from '../lib/setup'

/**
 * scrabble's setup form. Shared by both modes:
 *   - two dictionary bands (all six offered each) — separate ceilings for
 *     2-letter and 3+-letter words (the bananagrams split). Uniquely for
 *     scrabble these ARE the acceptance bar, so a lower band makes a stricter
 *     game (docs/games/scrabble.md §3.3);
 *   - the timer;
 *   - **AI opponents (compete only)** — 0–3 AI seats at one skill level. The
 *     band requirement is shown inline; the dialog's `validate` (see manifest)
 *     blocks Start if the dictionary is too narrow for the chosen level or the
 *     head-count doesn't fit. We deliberately don't auto-raise the dictionary —
 *     the player does it, so the change is never a surprise
 *     (docs/scrabble-ai-strength.md).
 * Controlled component; state lives in the SetupGameModal wrapper.
 */
export function SetupForm({
  mode, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as ScrabbleValues
  const set = setValue as SetupSetter<ScrabbleValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  // Disclosure summary carries the current bands so the section reads without
  // opening (the boggle/spellingbee pattern — 2-letter band first, then 3+).
  const dictLabel = `Dictionaries: ${difficultyValue(s.dict_2)} / ${difficultyValue(s.dict_3plus)}`
  const aiLabel =
    s.ai_count === 0
      ? 'AI opponents: none'
      : `AI opponents: ${s.ai_count} × ${AI_LEVEL_LABEL[s.ai_level]}`
  const aiBandName = difficultyValue(AI_BAND[s.ai_level])

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        value={s.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />
      {/* Coop pacing — free-for-all (default) vs turn-by-turn — first, right
          below the dialog's player picker. Self-gates to nothing for
          compete / solo. */}
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
      <SetupSection label={dictLabel}>
        <DictBandField
          name="dict_2"
          label="2-letter words"
          length={2}
          minBand={1}
          maxBand={6}
          value={s.dict_2}
          onChange={(dict_2) => set('dict_2', dict_2)}
        />
        <DictBandField
          name="dict_3plus"
          label="Longer words (3+)"
          length="3+"
          minBand={1}
          maxBand={6}
          value={s.dict_3plus}
          onChange={(dict_3plus) => set('dict_3plus', dict_3plus)}
        />
      </SetupSection>

      {/* AI opponents — compete only (coop is one shared rack, no per-seat AI). */}
      {/* The help stays the SECTION's: it reports the COMBINED choice — count and
          level together — and then reaches out of this section entirely, to the
          dictionaries above. No single field owns either half. */}
      {mode === 'compete' && (
        <SetupSection
          label={aiLabel}
          help={
            s.ai_count > 0 ? (
              <>
                {s.player_user_ids.size} human + {s.ai_count} AI. A {AI_LEVEL_LABEL[s.ai_level]} AI plays
                from the “{aiBandName}” dictionary, so both dictionaries above must be at least
                that wide.
              </>
            ) : undefined
          }
        >
          <RadioRow<number>
            name="ai_count"
            prefix="Add AI players:"
            options={[
              { value: 0, label: 'None' },
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
            value={s.ai_count}
            onChange={(ai_count) => set('ai_count', ai_count)}
          />
          {s.ai_count > 0 && (
            <SelectField
              name="ai_level"
              label="Skill"
              value={s.ai_level}
              onChange={(v) => set('ai_level', v as AiLevel)}
            >
              {AI_LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {AI_LEVEL_LABEL[lv]}
                </option>
              ))}
            </SelectField>
          )}
        </SetupSection>
      )}

      <SetupTimerSection errors={errors} value={s.timer} onChange={(timer) => set('timer', timer)} />
    </>
  )
}
