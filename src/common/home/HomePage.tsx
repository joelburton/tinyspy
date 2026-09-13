// cs-blessed-homepage

import { useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { navigate } from '../routing/router'
import { clubPath } from '../routing/routes'
import { SelectionList } from '../lists/SelectionList'
import { cls } from '../utils/cls'
import { useTabRing } from '../keyboard/useTabRing'
import { db as commonDb } from '../supabase/db'
import { showFaultModal } from '../faults/faultStore'
import { diagnosticsLine } from '../supabase/dbLog'
import { readRows } from '../supabase/dbResult'
import { useProfile } from '../session/useProfile'
import { useRealtimeRefetch } from '../realtime/useRealtimeRefetch'
import { Dot } from '../members/Dot'
import { PuzpuzpuzWordmark } from '../branding/PuzpuzpuzWordmark'
import { PuzpuzpuzLogo } from '../branding/PuzpuzpuzLogo'
import { PageHeader } from '../page-header/PageHeader'
import { PageHeaderMenu } from '../page-header/PageHeaderMenu'
import { useAccountMenuSection } from '../account/useAccountMenuSection'
import { StandardButton } from '../buttons/StandardButton'
import { CreateClubModal } from '../club/CreateClubModal'
import styles from './HomePage.module.css'

type ClubListEntry = {
  handle: string
  name: string
  is_solo: boolean
}

type Props = {
  session: Session
}

/**
 * The shell's `/` landing page: the clubs you belong to, and the button that
 * adds one. Why it is shaped this way — the one-stop tab ring, the three empty
 * states, the zero-rows fault — is `doc.md`'s Intro to area.
 *
 * `session` — its user id scopes the realtime subscription. The clubs read
 * itself sends no id: RLS filters it to the caller's memberships.
 */
export function HomePage({ session }: Props) {
  const profile = useProfile()
  const username = profile?.username ?? null
  const [clubs, setClubs] = useState<ClubListEntry[]>([])
  // Three states, because an empty list means something different in each and
  // only one of them is a normal moment. `loading` is the moment before the
  // first fetch answers; `failed` is a fetch that errored; `loaded` is an
  // answer we believe.
  const [load, setLoad] = useState<'loading' | 'loaded' | 'failed'>('loading')
  // Is the create-club modal up?
  const [creating, setCreating] = useState(false)

  // Load every club the caller is a member of (incl. their solo club), IN
  // DISPLAY ORDER: solo clubs first, then newest-first within each group.
  //
  // Subscribed to MY clubs_members rows so the list stays live: when a
  // friend accepts an invite and I add them — or when I'm added to /
  // removed from a club — the INSERT/DELETE on my membership refetches
  // the list, no manual page refresh. (The removal DELETE reaches me via
  // the `user_id = auth.uid()` arm of clubs_members_select; see that
  // policy.) SUBSCRIBED-refetch also heals any events missed offline.
  useRealtimeRefetch({
    tables: {
      schema: 'common',
      table: 'clubs_members',
      filter: `user_id=eq.${session.user.id}`,
    },
    channelPrefix: 'home-clubs',
    id: session.user.id,
    load: async ({ mounted }) => {
      const result = await readRows(
        commonDb
          .from('clubs')
          .select('handle, name, is_solo')
          .order('is_solo', { ascending: false })
          .order('created_at', { ascending: false }),
      )
      if (!mounted()) return
      // Nothing to do here: `readRows` raised the modal and wrote the `[db]`
      // line (docs/envelopes.md). Record the failure so the no-rows line in
      // the frame can say something true.
      if (result.type === 'not-ok') {
        setLoad('failed')
        return
      }
      setClubs(result.data)
      setLoad('loaded')
      // ZERO ROWS is a fault, and the page's own to raise: the server answered
      // a well-formed query correctly, and "every account has a solo club" is
      // the app's invariant, not the query's (doc.md → Intro to area). Fired on every
      // load, not once per mount — a refetch that finds the same breakage
      // should say so again.
      if (result.data.length === 0) {
        showFaultModal({
          text: "Something's wrong with your account — you should always have at least your own solo club.",
          diagnostics: diagnosticsLine('FAULT', {
            call: 'GET /rest/v1/clubs',
            severity: 'fault',
            status: 200,
            detail: 'rows=0; every profile has a solo club',
          }),
        })
      }
    },
  })

  // ─── Keyboard navigation ─────────────────────────────────────────────────
  // The cursor, the ring, Enter, and focus-on-arrival all live in
  // <SelectionList> — docs/ui.md → Selection lists. The page's half is its TAB
  // RING: exactly one stop, the clubs list, so the header menu and "+ New club"
  // are out of it by omission, not because anything was marked unfocusable.
  const clubsRef = useRef<HTMLDivElement>(null)
  useTabRing([clubsRef])

  const accountSection = useAccountMenuSection()

  return (
    <div className="pageHeaderAndMainArea">
      {/* A sibling of the card, not a child, so it aligns to the PAGE and not
          to the card's padding. The strip itself is page-header's. */}
      <PageHeader>
        <PageHeaderMenu
          logo={<PuzpuzpuzLogo />}
          sections={[accountSection]}
          label="Main menu"
        />
      </PageHeader>
      <div className={cls('card', 'pageMain', 'pageMain-fills', styles.card)}>
        <PuzpuzpuzWordmark />
        {/* The identity disc (docs/ui.md → Player identity), name first and
            greeting second so the identity is where the eye lands. */}
        <h1 className={styles.greeting}>
          {username ? (
            <>
              <Dot color={profile?.color} className={styles.greetingDot} />
              {/* A non-breaking space, not a CSS margin: the disc sits IN this
                  line of type, so the gap it wants is the font's word space. */}
              &nbsp;{username} — welcome!
            </>
          ) : (
            'Welcome!'
          )}
        </h1>

        <section className={styles.clubsSection}>
          {/* The shared `.heading-with-controls` (docs/ui.md). Creating a club
              is the uncommon path, hence the `quiet` tone. */}
          <header className="heading-with-controls">
            <h3>Your clubs</h3>
            <StandardButton
              show="label"
              label="+ New club"
              weight="secondary"
              tone="quiet"
              small
              onClick={() => setCreating(true)}
            />
          </header>
          <SelectionList
            ref={clubsRef}
            items={clubs}
            rowKey={(c) => c.handle}
            label="Your clubs"
            // Arrows work on arrival, without a first Tab
            autoFocus
            onActivate={(c) => navigate(clubPath(c.handle))}
            // No-rows states go inside the frame (docs/ui.md → Selection
            // lists). A blank rather than a claim while the answer is in
            // flight: the line's one job is to be true.
            empty={
              load === 'failed'
                ? "Your clubs couldn't be loaded."
                : load === 'loaded'
                  ? 'No clubs found for your account.'
                  : '\u00a0'
            }
            renderRow={(c) => (
              <>
                <span className={styles.clubName}>{c.name}</span>
                {c.is_solo && <span className={cls('badge', styles.soloBadge)}>Solo</span>}
              </>
            )}
          />
        </section>
      </div>
      {/* A modal. On success we go into the new club. */}
      {creating && (
        <CreateClubModal
          onCreated={(handle) => navigate(clubPath(handle))}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  )
}
