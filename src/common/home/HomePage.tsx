// cs-audited-homepage

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
 * The shell's `/` landing page.
 *
 * Pure shell content: who you are, the clubs you belong to
 * (including your own solo space), and the button that creates a
 * new one — a modal over this page, so the list stays behind it.
 *
 * Solo clubs (handle = `=<username>`) are listed alongside
 * regular clubs, marked by a "Solo" BADGE on the row (the
 * shared `.badge` — a one-word label saying what KIND of thing
 * this is), and always sorted to the top. The user's solo club is
 * the default landing spot for play-alone, and being a regular
 * row in the clubs list makes it discoverable without learning
 * a separate UI shape.
 *
 * Clubs RLS does the visibility filtering: the
 * `.from('clubs').select` below returns only the clubs the
 * caller is a member of. Solo clubs have only their owner as a
 * member, so the same query naturally surfaces each user's own
 * solo space without an `eq('created_by', …)` filter.
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
  // Is the create-club modal up? The dialog itself holds no such flag — it is
  // mounted or it isn't (the pattern ClubPage uses for its two modals).
  const [creating, setCreating] = useState(false)

  // Load every club the caller is a member of (incl. their solo club), IN
  // DISPLAY ORDER: solo clubs first, then newest-first within each group.
  // Postgres sorts false before true, so `is_solo` descending puts solo on
  // top. The page renders what it is handed — there is one array and one
  // order, and neither is re-derived here.
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
      // line (docs/envelopes.md). Record the failure so the muted line under
      // the list can say something true.
      if (result.type === 'not-ok') {
        setLoad('failed')
        return
      }
      setClubs(result.data)
      setLoad('loaded')
      // ZERO ROWS is a fault, and it's ours to raise, because it is a site
      // invariant the server has no opinion about: `common.claim_username`
      // materializes a solo club atomically with the profile, so a signed-in
      // user always has at least that one. An empty list means the solo club is
      // gone from the database — the account is broken, and the app has one way
      // to say broken (docs/ui.md → Faults: a blocking modal, not a pill).
      //
      // This is the general rule, not a special case: zero rows is a legitimate
      // protocol answer, so only the caller can know it's impossible here — and
      // whoever detects a condition writes its words.
      //
      // Fired on EVERY load, not once per mount. The list refetches on
      // realtime membership events, so a persistent outage will re-fire —
      // which is correct here: nothing about this state improves by being
      // mentioned once.
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
  // <SelectionList> — docs/ui.md → Selection lists.
  //
  // What stays here is the page's half: this page's TAB RING is exactly one
  // stop, the clubs list. Everything else — the header
  // menu, "+ New club" — is unreachable by Tab because it simply isn't in the
  // ring, not because anything was marked unfocusable. The ring is also the way
  // BACK: click any blank part of the page and the list blurs, and without it
  // there would be no key left that could return the keyboard. An open <Menu>
  // is unaffected — it stopPropagation()s its own keys, so Tab still closes it.
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
              is the uncommon path, hence the `quiet` tone.

              The `+` is a typed character, not a glyph: `icon` is available and
              deliberately unused, because a plus sign IS the label here. */}
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
            // Arrows work on arrival, without a first Tab — which is just as
            // well, since Tab only cycles this page's ring (useTabRing). An
            // empty list never takes focus, so this stays inert until the clubs
            // land.
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
      {/* Creating a club is a modal, not a page: the clubs list stays behind
          it, because the act is ADD TO THIS LIST. Mounting opens it and
          unmounting closes it — the modal holds no open/shut state of its own.
          On success we go into the new club, which is what you made it for. */}
      {creating && (
        <CreateClubModal
          onCreated={(handle) => navigate(clubPath(handle))}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  )
}
