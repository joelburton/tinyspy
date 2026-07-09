import { useEffect, useMemo, useRef, useState } from 'react'
import type { SetupBodyProps } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { db } from '../db'
import type { CrosswordsSetup } from '../lib/setup'
import { importCrosswordFile } from '../lib/importFile'
import type { PuzzleMeta } from '../lib/types'
import styles from './SetupForm.module.css'

/** A library puzzle as the picker sees it — id + the non-spoiler meta. */
type LibraryPuzzle = { id: string; title: string; author: string; size: string }

/** Today as YYYY-MM-DD (the NYT date input's default + max). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * The crosswords setup form: pick a puzzle from the curated library, OR an
 * NYT daily by date. The choice is written into `setup` (`source` +
 * `puzzle_id` / `date`); library → `create_game` RPC, NYT → the
 * `crosswords-import-nyt` edge function.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as CrosswordsSetup
  const [puzzles, setPuzzles] = useState<LibraryPuzzle[] | null>(null)
  const [query, setQuery] = useState('')
  // Upload tab state.
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Parse a dropped / chosen .puz / .ipuz file entirely client-side into the
  // inline board, storing it in `setup.board` (start passes it to create_game).
  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploadBusy(true)
    setUploadError(null)
    try {
      const board = await importCrosswordFile(file)
      onChange({ ...s, source: 'upload', board, filename: file.name })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that file.')
      // Clear any previously-parsed board so Start stays blocked.
      onChange({ ...s, source: 'upload', board: undefined, filename: file.name })
    } finally {
      setUploadBusy(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const { data } = await db
        .from('puzzles')
        .select('id, meta')
        .eq('source', 'library')
        .order('created_at', { ascending: false })
      if (!active || !data) return
      setPuzzles(
        data.map((row) => {
          const m = row.meta as unknown as PuzzleMeta
          return {
            id: row.id,
            title: m.title || 'Untitled',
            author: m.author || '',
            size: `${m.width}×${m.height}`,
          }
        }),
      )
    })()
    return () => {
      active = false
    }
  }, [])

  const source = s.source ?? 'library'

  const filtered = useMemo(() => {
    if (!puzzles) return null
    const q = query.trim().toLowerCase()
    if (!q) return puzzles
    return puzzles.filter(
      (p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q),
    )
  }, [puzzles, query])

  return (
    <div className={styles.setup}>
      <div className={styles.seg} role="group" aria-label="Puzzle source">
        <button
          type="button"
          className={cls(styles.segBtn, source === 'library' && styles.segOn)}
          aria-pressed={source === 'library'}
          // Drop any parsed upload board/filename when leaving the Upload tab so
          // a stale solution grid can't ride along in `setup` (belt-and-braces
          // with the unconditional strip in manifest + the create_game backstop).
          onClick={() => onChange({ ...s, source: 'library', board: undefined, filename: undefined })}
        >
          Library
        </button>
        <button
          type="button"
          className={cls(styles.segBtn, source === 'nyt' && styles.segOn)}
          aria-pressed={source === 'nyt'}
          onClick={() =>
            onChange({
              ...s,
              source: 'nyt',
              date: s.date || todayStr(),
              board: undefined,
              filename: undefined,
            })
          }
        >
          NYT by date
        </button>
        <button
          type="button"
          className={cls(styles.segBtn, source === 'upload' && styles.segOn)}
          aria-pressed={source === 'upload'}
          onClick={() => onChange({ ...s, source: 'upload' })}
        >
          Upload file
        </button>
      </div>

      {/* All three tab bodies stay MOUNTED, stacked in one grid cell, with the
          inactive ones visibility-hidden (see .tabStack): the block is always as
          tall as the tallest tab (the library's 8-row list), so switching tabs
          never resizes the dialog. Hidden = unfocusable + unclickable, and the
          library list keeps its scroll position across a tab round-trip. */}
      <div className={styles.tabStack}>
        <div className={cls(styles.tabBody, source !== 'upload' && styles.tabHidden)}>
          <p className="muted">Upload a .puz or .ipuz crossword file to play it.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".puz,.ipuz"
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
            {uploadBusy ? (
              <span className={styles.dropTitle}>Reading…</span>
            ) : s.board ? (
              <>
                <span className={styles.dropTitle}>
                  {s.board.meta.title || s.filename || 'Puzzle ready'}
                </span>
                <span className={styles.dropMeta}>
                  {s.board.meta.width}×{s.board.meta.height}
                  {s.board.meta.author ? ` · ${s.board.meta.author}` : ''} · click to replace
                </span>
              </>
            ) : (
              <>
                <span className={styles.dropTitle}>Drop a .puz / .ipuz file here</span>
                <span className={styles.dropMeta}>or click to choose one</span>
              </>
            )}
          </button>
          {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
        </div>

        <div className={cls(styles.tabBody, source !== 'nyt' && styles.tabHidden)}>
          <p className="muted">Import a New York Times daily crossword by date.</p>
          <input
            className={styles.search}
            type="date"
            max={todayStr()}
            value={s.date ?? ''}
            onChange={(e) => onChange({ ...s, date: e.target.value })}
          />
        </div>

        <div className={cls(styles.tabBody, source !== 'library' && styles.tabHidden)}>
          <input
            className={styles.search}
            type="text"
            placeholder="Filter by title or author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.list}>
            {filtered === null ? (
              <div className={styles.empty}>Loading puzzles…</div>
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                {puzzles && puzzles.length === 0
                  ? 'No puzzles in the library yet — run `npm run crosswords:import`.'
                  : 'No puzzles match that filter.'}
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cls(styles.item, s.puzzle_id === p.id && styles.selected)}
                  onClick={() => onChange({ ...s, puzzle_id: p.id })}
                >
                  <span className={styles.itemTitle}>
                    {p.title}
                    {p.author ? ` · ${p.author}` : ''}
                  </span>
                  <span className={styles.itemMeta}>{p.size}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
