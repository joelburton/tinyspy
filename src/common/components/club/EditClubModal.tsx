// cs-unmet

import { formFailureText } from '../../lib/game/serverError'
import { useState } from 'react'
import { db as commonDb } from '../../db'
import { games } from '../../../games'
import { FloatingPanel } from '../floating-panels/FloatingPanel'
import { ModePill } from '../game/ModePill'
import actionRow from '../floating-panels/modalActions.module.css'
import styles from './EditClubModal.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { CheckboxField } from '../fields/CheckboxField'

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
export function EditClubModal({
  clubHandle, clubName, allowedGametypes, onSaved, onCancel,
}: Props) {
  // Local working copy of the enrolled set — toggled by the
  // checkboxes, committed only on Save. Lazy-init from the prop;
  // the parent remounts us per open, so a stale seed isn't a concern.
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(allowedGametypes),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One row per registered gametype. Sort by display name, then by
  // mode, so a coop/compete sibling pair sits together.
  const sorted = [...games].sort(
    (a, b) => a.name.localeCompare(b.name) || a.mode.localeCompare(b.mode),
  )

  function toggle(gametype: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(gametype)) next.delete(gametype)
      else next.add(gametype)
      return next
    })
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await commonDb.rpc('set_club_gametypes', {
      target_club: clubHandle,
      gametypes: Array.from(checked),
    })
    if (rpcError) {
      setBusy(false)
      // Split by surface rule: the club-name rules' keys show their ERROR_COPY
      // sentences on the form's line; a fault pops the modal.
      setError(formFailureText(rpcError, 'club'))
      return
    }
    // Don't bother clearing `busy` — onSaved unmounts us.
    onSaved(checked)
  }

  return (
    <FloatingPanel
      family="modal-normal"
      title={`Edit ${clubName}`}
      onClose={onCancel}
      resizable={false}
      // Height is the content's: the number below is only the first-paint
      // seed, and `fitContent` grows past it. Before this, the height was a
      // fixed pixel count nobody derived (F23 → C).
      fitContent
      defaultSize={{ width: 440, height: 520 }}
    >
      <fieldset className={styles.games}>
        <legend className={styles.gamesLegend}>Games played in this club</legend>
        {sorted.map((g) => (
          <CheckboxField
            key={g.gametype}
            name={g.gametype}
            checked={checked.has(g.gametype)}
            onChange={() => toggle(g.gametype)}
            disabled={busy}
            className={styles.gameRow}
          >
            <span className={styles.gameText}>
              <span className={styles.gameName}>
                {g.name} <ModePill mode={g.mode} />
              </span>
              <span className={styles.gameDesc}>{g.shortDescription}</span>
            </span>
          </CheckboxField>
        ))}
      </fieldset>

      {error && <p className="error">{error}</p>}
      <div className={actionRow.modalActions}>
        <CancelButton onClick={onCancel} disabled={busy} />
        <StandardButton
          name={busy ? 'Saving…' : 'Save'}
          weight="primary"
          onClick={handleSave}
          disabled={busy}
          autoFocus
        />
      </div>
    </FloatingPanel>
  )
}
