// cs-unmet

import { useEffect, useState } from 'react'
import { db as commonDb } from '@/common/supabase/db'
import { readRows } from '@/common/supabase/dbResult'
import type { Member } from '@/common/members/member'

/**
 * The bot accounts, in the order `scrabble.create_game` seats them: by
 * username, so a game with N AI players seats the first N. The setup form
 * names them before the game exists, for its first-player menu.
 *
 * Empty until the read lands, and empty if it fails (a fault, whose modal
 * `readRows` has already raised): the menu then offers only the people.
 */
export function useAiAccounts(): Member[] {
  const [accounts, setAccounts] = useState<Member[]>([])

  useEffect(function loadAiAccounts() {
    let mounted = true
    void (async () => {
      const res = await readRows(
        commonDb.from('profiles').select('user_id, username, color')
          .eq('ai_member', true).order('username'),
      )
      if (!mounted || res.type === 'not-ok') return
      setAccounts(res.data.map((p) => ({ id: p.user_id, username: p.username, color: p.color })))
    })()
    return () => {
      mounted = false
    }
  }, [])

  return accounts
}
