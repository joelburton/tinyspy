// cs-unmet

import { useState } from 'react'
import { db as commonDb } from '../../db'
import { runRpc } from '../../lib/supabase/dbResult'
import { games } from '../../../games'
import { NormalModal } from '../floating-panels/NormalModal'
import { FailureLine } from '../feedback/FailureLine'
import { ModePill } from '../game/ModePill'
import actionRow from '../floating-panels/modalActions.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { CheckboxListField } from '../fields/CheckboxListField'
import { StandardForm } from '../fields/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../fields/formState'

type Props = {
  /** Club being edited. */
  clubHandle: string
  /** Club display name — shown in the panel title. */
  clubName: string
  /**
   * The club's currently-enrolled gametypes (the
   * `common.clubs_gametypes` set), as sourced by ClubPage. Seeds the
   * checkboxes; the dialog edits a local copy and only writes on Save.
   */
  allowedGametypes: Set<string>
  /** Save succeeded — hand the new enrolled set back so ClubPage can
   *  update its `allowedGametypes` (and thus the Start buttons)
   *  without a refetch. */
  onSaved: (next: Set<string>) => void
  /** User dismissed without saving (Cancel / Esc / X). */
  onCancel: () => void
}

/**
 * "Edit club" dialog. Today it holds a single setting — which
 * gametypes the club plays (the row set in `common.clubs_gametypes`)
 * — but it's framed as a general club-options panel so future
 * settings (rename, member management) slot in beside the games list.
 *
 * The games list is the full FE registry (`src/games.ts`), NOT
 * filtered by player count: per the product call, a solo club may
 * list a two-player game if its member wants it shown — they simply
 * won't be able to start it (the Start button stays disabled by the
 * manifest's `numberOfPlayers`). Server-side, `set_club_gametypes`
 * likewise applies no solo filter; that filter only shapes the
 * *default* enrollment at club creation.
 *
 * Lifecycle mirrors SetupGameModal: ClubPage conditionally renders
 * us — mounting opens, unmounting closes. We hold no "is open" state.
 */
/**
 * What the form holds, keyed by the name it is SENT AS — `gametypes` is
 * `common.set_club_gametypes`'s own parameter, so a validation naming that
 * column would land on this field with nothing to translate.
 */
type Values = { gametypes: Set<string> }

export function EditClubModal({
  clubHandle, clubName, allowedGametypes, onSaved, onCancel,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // One row per registered gametype. Sort by display name, then by
  // mode, so a coop/compete sibling pair sits together.
  const sorted = [...games].sort(
    (a, b) => a.name.localeCompare(b.name) || a.mode.localeCompare(b.mode),
  )

  async function onSubmit({ gametypes }: Values) {
    setBusy(true)
    setErrors({})
    const res = await runRpc(
      commonDb.rpc('set_club_gametypes', {
        target_club: clubHandle,
        gametypes: Array.from(gametypes),
      }),
    )
    if (res.type !== 'ok') {
      setBusy(false)
      // A fault has already raised the modal; the line is what remains once
      // that is dismissed. It says `_`, since the RPC has no validation of its
      // own — the only things it can refuse are the membership gate and an
      // unregistered gametype, neither of which is about one input.
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
      return
    }
    // Don't bother clearing `busy` — onSaved unmounts us.
    onSaved(gametypes)
  }

  return (
    <NormalModal
      title={`Edit ${clubName}`}
      onClose={onCancel}
      resizable={false}
      // Height is the content's: the number below is only the first-paint
      // seed, and `fitContent` grows past it. Before this, the height was a
      // fixed pixel count nobody derived (F23 → C).
      fitContent
      defaultSize={{ width: 440, height: 520 }}
    >
      <StandardForm
        initialValues={{ gametypes: new Set(allowedGametypes) } satisfies Values}
        onSubmit={onSubmit}
      >
        {({ values, set }) => (
          <>
            <CheckboxListField
              name="gametypes"
              label="Games played in this club"
              value={values.gametypes}
              onChange={(next) => set('gametypes', next)}
              error={errors.gametypes}
              disabled={busy}
              options={sorted.map((g) => ({
                value: g.gametype,
                label: (
                  <>
                    {g.name} <ModePill mode={g.mode} />
                  </>
                ),
                description: g.shortDescription,
              }))}
            />

            <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>
            <div className={actionRow.modalActions}>
              <CancelButton onClick={onCancel} disabled={busy} />
              <StandardButton
                name={busy ? 'Saving…' : 'Save'}
                type="submit"
                weight="primary"
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
