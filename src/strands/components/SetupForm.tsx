// cs-unmet

import { SetupCoopStyleSection } from '../../common/components/setup/SetupCoopStyleSection'
import { PlayersSection } from '../../common/components/setup/PlayersSection'
import { DictBandField } from '../../common/components/fields/DictBandField'
import { SelectField } from '../../common/components/fields/SelectField'
import { SetupTimerSection } from '../../common/components/setup/SetupTimerSection'
import { SetupNextPuzzleSection } from '../../common/components/setup/SetupNextPuzzleSection'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps, SetupSetter } from '../../common/lib/games'
import { db } from '../db'
import type { StrandsValues } from '../lib/setup'

/**
 * strands' setup form.
 *
 *   - **Puzzle** — a read-only line naming what Start will play, NOT a picker.
 *     The server chooses (`strands.next_puzzle_for_club`): the earliest puzzle
 *     none of the selected players has played, in any club. The date picker
 *     this replaced offered 884 identical-looking dates, and its besetting
 *     problem was starting one you'd already done — first patched by showing
 *     the clue under the input, then solved properly by removing the choice.
 *     The clue survives as the label on that line, which is the right place
 *     for it: it's how a person recognizes a strands puzzle.
 *   - **Hint dictionary** — the band a word must reach to earn a hint point.
 *   - **Words per hint** / **Shortest word**.
 *
 * Plus the shared SetupTimerSection and SetupCoopStyleSection.
 */
export function SetupForm({
  brand, mode, members, selfId, numberOfPlayers, values, set: setValue, errors,
}: SetupBodyProps) {
  const s = values as StrandsValues
  const set = setValue as SetupSetter<StrandsValues>
  // The checked subset of the roster, in `members` order — a control that
  // must name the ACTUAL players lists only who'll play, not the whole club.
  const players = members.filter((m) => s.player_user_ids.has(m.user_id))

  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        error={errors.player_user_ids}
        value={s.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />
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

      <SetupNextPuzzleSection
        errors={errors}
        brand={brand}
        seenBy={players.map((p) => p.user_id)}
        load={async (seenBy) => {
          const { data } = await db.rpc('next_puzzle_for_club', { seen_by: seenBy })
          // Both RPCs return 0 or 1 rows. Zero from this one means the archive
          // is spent for these players; zero from the by-date one means no
          // puzzle that day. SetupNextPuzzleSection renders each as its own state.
          return data?.[0] ?? null
        }}
        loadByDate={async (date) => {
          const { data } = await db.rpc('puzzle_for_date', { target_date: date })
          return data?.[0] ?? null
        }}
        // A chosen date rides in setup.puzzle_id; cleared, the key is dropped
        // entirely — its ABSENCE is what tells create_game to choose.
        onPick={(puzzleId) => set('puzzle_id', puzzleId)}
      />

      <SetupSection label={`Hint dictionary: ${difficultyValue(s.band)}`}>
        {/* The direction is counter-intuitive and worth saying out loud: this is
            the OPPOSITE of waffle's tier, where a higher band is a harder
            board. Here a wider dictionary means more words qualify, so hints
            arrive sooner. */}
        <DictBandField
          name="band"
          help={<>How obscure a word may be and still earn a hint. A wider dictionary makes the game <strong>easier</strong> — more words count, so hints come faster.</>}
          label="Hint dictionary"
          // '3+' — strands' hint words have no fixed length (min_word_length is
          // its own knob), so the field samples from the general word list.
          length="3+"
          minBand={1}
          maxBand={6}
          value={s.band}
          onChange={(band) => set('band', band)}
        />
      </SetupSection>

      <SetupSection label={`Words per hint: ${s.hint_cost}`}>
        <SelectField
          name="hint_cost"
          help="How many valid non-theme words buy one hint (3 is standard)."
          label="Words per hint"
          value={String(s.hint_cost)}
          onChange={(v) => set('hint_cost', Number(v))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </SelectField>
      </SetupSection>

      <SetupSection label={`Shortest word: ${s.min_word_length}`}>
        <SelectField
          name="min_word_length"
          help="The shortest word that can earn a hint. Theme words always count, however short."
          label="Shortest word"
          value={String(s.min_word_length)}
          onChange={(v) => set('min_word_length', Number(v))}
        >
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n} letters</option>
          ))}
        </SelectField>
      </SetupSection>

      <SetupTimerSection errors={errors} value={s.timer} onChange={(timer) => set('timer', timer)} />
    </>
  )
}
