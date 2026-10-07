// cs-blessed-club-page

import { useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { gametypes } from '@/gametypes'
import { NormalModal } from '../floating-panels/NormalModal'
import { FailureLine } from '../forms/FailureLine'
import { ModeBadge } from './ModeBadge'
import buttonRow from '../floating-panels/modalButtons.module.css'
import { FormSubmitButton } from '../buttons/FormSubmitButton'
import { CancelButton } from '../buttons/CancelButton'
import { CheckboxField } from '../fields/CheckboxField'
import { Field } from '../fields/Field'
import { NumberField } from '../fields/NumberField'
import { StandardForm } from '../forms/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../forms/formState'
import { reportUnhandled } from '../supabase/dbEnvelope'
import type { GametypeSettings } from './useClubGametypes'
import styles from './EditClubModal.module.css'

type Props = {
  // Club being edited.
  clubHandle: string
  // Club display name — shown in the panel title.
  clubName: string
  // Every registered gametype's settings for this club (the
  // `common.clubs_gametypes` rows), as sourced by ClubPage. Seeds the form;
  // the dialog edits a local copy and only writes on Save.
  settings: Map<string, GametypeSettings>
  // Save succeeded — hand the new settings back so ClubPage can update its
  // start list without a refetch.
  onSaved: (next: Map<string, GametypeSettings>) => void
  // User dismissed without saving (Cancel / Esc / X).
  onCancel: () => void
}

/**
 * What the form holds. The listing is one set, keyed `gametypes` — the group
 * every row's checkbox is named under (`gametypes.<gametype>`); the caps are
 * keyed by gametype, each box named `max_daily_games.<gametype>`, which is the
 * column `set_club_gametypes` names when it refuses one, so the sentence lands
 * under the box that wrote the value. A blank cap is `NaN`, the number field's
 * honest "no number here", and is sent as null: no limit.
 */
type Values = { gametypes: Set<string>; maxDailyGames: Record<string, number> }

/** What `common.set_club_gametypes` puts in `data`. It sends no message —
 *  the dialog closes and says nothing — so `result` is the whole of what the
 *  answer says, and the only thing a branch can assert about it. */
type SetGametypesAnswer = { result: 'saved' }

/** A cap as it is sent: the number, or null for a blank box. */
function capOrNull(cap: number | undefined): number | null {
  return cap !== undefined && Number.isFinite(cap) ? cap : null
}

/** The set with one gametype listed or unlisted. */
function withListing(listed: Set<string>, gametype: string, isListed: boolean): Set<string> {
  const next = new Set(listed)
  if (isListed) next.add(gametype)
  else next.delete(gametype)
  return next
}

/**
 * "Edit club" dialog: which gametypes the club lists, and each one's daily
 * cap — the `common.clubs_gametypes` rows, in a panel shaped to take more.
 *
 * The games list is the full FE registry (`src/gametypes.ts`), NOT
 * filtered by player count: per the product call, a solo club may
 * list a two-player game if its member wants it shown — they simply
 * won't be able to start it (the start row stays dimmed by the
 * manifest's `numberOfPlayers`). Server-side, `set_club_gametypes`
 * likewise applies no solo filter; that filter only shapes the
 * *default* enrollment at club creation.
 *
 * The cap is paw protection's (docs/common-schema.md → Paw protection):
 * blank is no limit, 0 lists the game and lets nobody start it. The server
 * checks the number; the form only carries its sentence back to the box.
 *
 * Lifecycle mirrors SetupGameModal: ClubPage conditionally renders
 * us — mounting opens, unmounting closes. We hold no "is open" state. The
 * club's `can_edit_settings` is checked before this is mounted at all — the
 * Edit club action hides — and the RPC refuses behind it.
 */
export function EditClubModal({
  clubHandle, clubName, settings, onSaved, onCancel,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // One row per registered gametype, in the same order the club page's start
  // list uses: alphabetical by brand, and coop before compete inside the tie a
  // sibling pair makes (both export the same `name`). Spelled out rather than
  // left to `mode.localeCompare`, which sorts compete first and swapped each
  // pair against the list this dialog opens from.
  const sorted = [...gametypes].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      (a.mode === b.mode ? 0 : a.mode === 'coop' ? -1 : 1),
  )

  // A gametype the club has no row for — a registry ahead of the database —
  // starts unlisted with no cap, which is what its row would say.
  const initialValues: Values = {
    gametypes: new Set(sorted.filter((g) => settings.get(g.gametype)?.isEnabled).map((g) => g.gametype)),
    maxDailyGames: Object.fromEntries(
      sorted.map((g) => [g.gametype, settings.get(g.gametype)?.maxDailyGames ?? NaN]),
    ),
  }

  async function onSubmit(values: Values) {
    setBusy(true)
    setErrors({})
    // The whole table goes, one entry per registered gametype — the server
    // updates each row and deletes none.
    const next = new Map<string, GametypeSettings>(
      sorted.map((g) => [
        g.gametype,
        { isEnabled: values.gametypes.has(g.gametype), maxDailyGames: capOrNull(values.maxDailyGames[g.gametype]) },
      ]),
    )
    const res = await runRpc<SetGametypesAnswer>(
      commonDb.rpc('set_club_gametypes', {
        p_club_handle: clubHandle,
        p_settings: [...next].map(([gametype, s]) => ({
          gametype,
          is_enabled: s.isEnabled,
          max_daily_games: s.maxDailyGames,
        })),
      }),
    )
    if (res.type === 'not-ok') {
      setBusy(false)
      // A fault has already raised the modal; the line is what remains once
      // that is dismissed. A refused cap names its box; the membership gate,
      // the locked settings and an unregistered gametype name no input and
      // land on the form's own line.
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
      return
    } else if (res.type === 'ok' && res.data.result === 'saved') {
      // Don't bother clearing `busy` — onSaved unmounts us.
      onSaved(next)
      return
    } else {
      // Clears `busy` as well as screaming: nothing unmounts this dialog on an
      // answer it didn't handle, so leaving the flag set would strand Save
      // disabled with no way back but Cancel.
      setBusy(false)
      reportUnhandled('set_club_gametypes', res)
      return
    }
  }

  return (
    <NormalModal
      title={`Edit ${clubName}`}
      onClose={onCancel}
      resizable={false}
      // Height is the content's: the number below is only the first-paint
      // seed, and `fitContent` grows past it.
      fitContent
      defaultSize={{ width: 520, height: 560 }}
    >
      <StandardForm initialValues={initialValues} onSubmit={onSubmit}>
        {({ values, set }) => (
          <>
            <Field
              name="gametypes"
              label="Games played in this club"
              help="A listed game can be started. Its cap is how many games of it can be started each day: blank is no limit, 0 lists it but lets nobody start it."
              error={errors.gametypes}
              group
              className={styles.games}
            >
              <div className={styles.columnHeads}>
                <span>Game</span>
                <span>Per day</span>
              </div>
              {sorted.map((g) => (
                <div key={g.gametype} className={styles.gameRow}>
                  <CheckboxField
                    name={`gametypes.${g.gametype}`}
                    value={values.gametypes.has(g.gametype)}
                    onChange={(isListed) => set('gametypes', withListing(values.gametypes, g.gametype, isListed))}
                    disabled={busy}
                    className={styles.listing}
                  >
                    <span className={styles.gameText}>
                      <span className={styles.gameName}>
                        {g.name} <ModeBadge mode={g.mode} />
                      </span>
                      <span className={styles.gameDescription}>{g.shortDescription}</span>
                    </span>
                  </CheckboxField>
                  <NumberField
                    name={`max_daily_games.${g.gametype}`}
                    chars={2}
                    min={0}
                    value={values.maxDailyGames[g.gametype] ?? NaN}
                    onChange={(cap) => set('maxDailyGames', { ...values.maxDailyGames, [g.gametype]: cap })}
                    error={errors[`max_daily_games.${g.gametype}`]}
                    disabled={busy}
                  />
                </div>
              ))}
            </Field>

            <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>
            <div className={buttonRow.modalButtons}>
              <CancelButton show="label" onClick={onCancel} disabled={busy} />
              <FormSubmitButton
                show="label"
                label={busy ? 'Saving…' : 'Save'}
                disabled={busy}
                autoFocus
              />
            </div>
          </>
        )}
      </StandardForm>
    </NormalModal>
  )
}
