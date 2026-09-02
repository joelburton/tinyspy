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
import { FORM_ERROR_KEYNAME } from '../../common/components/fields/formState'
import { runRpc } from '../../common/lib/supabase/dbResult'
import { showFaultModal } from '../../common/lib/fault/faultStore'
import { db } from '../db'
import type { PuzzleAnswer, StrandsValues } from '../lib/setup'

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
  brand, mode, members, selfId, numberOfPlayers, values, set: setValue, errors, setError,
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
        // The empty cases are the SERVER's to word now, and each lands under
        // the field that is the way out of it: PN416 (this archive is spent for
        // these players) and PN417 (no puzzle that day) both name `puzzle_id`,
        // so the message sits red under the puzzle field and stays there after
        // a modal is dismissed. A fault says `_` and takes the form's own line.
        // The section has no third state, so a refusal still returns null — it
        // just no longer passes for an empty archive.
        load={async (seenBy) => {
          const res = await runRpc<PuzzleAnswer>(
            db.rpc('next_puzzle_for_club', { seen_by: seenBy }),
          )
          if (res.type === 'not-ok') {
            setError(res.field ?? FORM_ERROR_KEYNAME, res.message)
            return null
          } else if (res.type === 'ok' && res.data.result === 'found') {
            // BOTH keys, because a previous failure could have used either —
            // this load answering at last is what clears whichever it was.
            setError('puzzle_id', null)
            setError(FORM_ERROR_KEYNAME, null)
            return res.data.puzzle
          } else {
            showFaultModal({ text: 'BUG: next_puzzle_for_club fell through to unhandled' })
            return null
          }
        }}
        loadByDate={async (date) => {
          const res = await runRpc<PuzzleAnswer>(db.rpc('puzzle_for_date', { target_date: date }))
          if (res.type === 'not-ok') {
            setError(res.field ?? FORM_ERROR_KEYNAME, res.message)
            return null
          } else if (res.type === 'ok' && res.data.result === 'found') {
            setError('puzzle_id', null)
            setError(FORM_ERROR_KEYNAME, null)
            return res.data.puzzle
          } else {
            showFaultModal({ text: 'BUG: puzzle_for_date fell through to unhandled' })
            return null
          }
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
          error={errors.band}
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
          error={errors.hint_cost}
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
          error={errors.min_word_length}
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
