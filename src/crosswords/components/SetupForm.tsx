import { useEffect, useMemo, useState } from 'react'
import type { SetupBodyProps } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { db } from '../db'
import type { CrosswordsSetup } from '../lib/setup'
import type { PuzzleMeta } from '../lib/types'
import styles from './SetupForm.module.css'

/** A library puzzle as the picker sees it — id + the non-spoiler meta. */
type LibraryPuzzle = { id: string; title: string; author: string; size: string }

/**
 * The crosswords setup form: pick a puzzle from the curated library. The
 * chosen `puzzle_id` is written into `setup`; `create_game` copies that
 * puzzle's grid + (shielded) solution into the game. (The NYT-by-date path
 * lands in stage 5.)
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as CrosswordsSetup
  const [puzzles, setPuzzles] = useState<LibraryPuzzle[] | null>(null)
  const [query, setQuery] = useState('')

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
      <p className="muted">Pick a puzzle from the library.</p>
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
  )
}
