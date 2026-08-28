// cs-unmet

import { useRef, useState } from 'react'
import { BlockingModal } from '../../../common/components/floating-panels/BlockingModal'
import { CancelButton } from '../../../common/components/buttons/CancelButton'
import { cls } from '../../../common/lib/util/cls'
import { importCrosswordFile } from '../../lib/importFile'
import type { ImportedBoard } from '../../lib/importFile'
import styles from './pickers.module.css'
import '../../theme.css'

type Props = {
  /** Chosen — the parsed board and the file it came from. */
  onPick: (chosen: { board: ImportedBoard; filename: string }) => void
  onClose: () => void
}

/**
 * **Play a .puz or .ipuz file** (plans/areas/forms.md → F50
 * `puzzle-source-picks-in-a-dialog`).
 *
 * The file is read HERE, on drop, entirely client-side — not at Start. So this
 * is the one picker whose refusal needs no server and no round trip: the parse
 * either produced a board or it did not, and you find out standing in front of
 * the drop target that caused it.
 *
 * That is also why a successful parse can close immediately. There is nothing
 * left to confirm — by the time the dialog would ask "use this one?", the whole
 * grid is already in hand, and the summary the setup form shows names the
 * puzzle AND the file precisely because both are known at that moment.
 *
 * A failed parse keeps the modal open with its reason, which is the only way
 * this picker stays put: everything else here either closes or cancels.
 */
export function UploadPickerBlockingModal({ onPick, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const board = await importCrosswordFile(file)
      onPick({ board, filename: file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BlockingModal title="Upload" onClose={onClose} actions={<CancelButton onClick={onClose} />}>
      <div className={styles.body}>
        <p className={styles.lead}>Upload a .puz or .ipuz crossword file to play it.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".puz,.ipuz"
          aria-label="Crossword file"
          className={styles.fileInput}
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            // Allow re-selecting the same file (onChange won't fire otherwise).
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className={cls(styles.dropzone, dragOver && styles.dropOver)}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void handleFile(e.dataTransfer.files?.[0])
          }}
        >
          {busy ? (
            <span className={styles.dropTitle}>Reading…</span>
          ) : (
            <>
              <span className={styles.dropTitle}>Drop a .puz / .ipuz file here</span>
              <span className={styles.dropMeta}>or click to choose one</span>
            </>
          )}
        </button>
        {error && <p className={styles.uploadError}>{error}</p>}
      </div>
    </BlockingModal>
  )
}
