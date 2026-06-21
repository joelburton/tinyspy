import { useState } from 'react'
import { db as commonDb } from '../db'
import { games } from '../../games'
import { FloatingPanel } from './FloatingPanel'
import styles from './EditClubDialog.module.css'

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
 * Lifecycle mirrors SetupGameDialog: ClubPage conditionally renders
 * us — mounting opens, unmounting closes. We hold no "is open" state.
 */
export function EditClubDialog({
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
      setError(rpcError.message)
      return
    }
    // Don't bother clearing `busy` — onSaved unmounts us.
    onSaved(checked)
  }

  return (
    <FloatingPanel
      title={`Edit ${clubName}`}
      onClose={onCancel}
      backdrop
      resizable={false}
      defaultSize={{ width: 440, height: 520 }}
      minWidth={320}
      minHeight={300}
    >
      <fieldset className={styles.games}>
        <legend className={styles.gamesLegend}>Games played in this club</legend>
        {sorted.map((g) => (
          <label key={g.gametype} className={styles.gameRow}>
            <input
              type="checkbox"
              checked={checked.has(g.gametype)}
              onChange={() => toggle(g.gametype)}
              disabled={busy}
            />
            <span className={styles.gameText}>
              <span className={styles.gameName}>
                {g.name}
                <span className={styles.gameMode}> ({g.mode})</span>
              </span>
              <span className={styles.gameDesc}>{g.shortDescription}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && <p className="error">{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={busy} autoFocus>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </FloatingPanel>
  )
}
