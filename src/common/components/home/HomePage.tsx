// cs-unmet

import { useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { navigate } from '../../lib/routing/router'
import { SelectionList } from '../lists/SelectionList'
import { cls } from '../../lib/util/cls'
import { useTabRing } from '../../hooks/input/useTabRing'
import { db as commonDb } from '../../db'
import { showFaultModal } from '../../lib/fault/faultStore'
import { diagnosticsLine } from '../../lib/supabase/dbLog'
import { readRows } from '../../lib/supabase/dbResult'
import { useProfile } from '../../hooks/session/useProfile'
import { useRealtimeRefetch } from '../../hooks/realtime/useRealtimeRefetch'
import { Dot } from '../text/Dot'
import { PuzpuzpuzWordmark } from '../branding/PuzpuzpuzWordmark'
import { PuzpuzpuzLogo } from '../branding/PuzpuzpuzLogo'
import { PageHeader } from '../page-header/PageHeader'
import { PageHeaderMenu } from '../page-header/PageHeaderMenu'
import { useAccountMenuSection } from '../../hooks/account/useAccountMenuSection'
import { useAppShortcuts } from '../../hooks/input/useAppShortcuts'
import { StandardButton } from '../buttons/StandardButton'
import { CreateClubModal } from '../club/CreateClubModal'
import styles from './HomePage.module.css'

type ClubListEntry = {
  handle: string
  name: string
  /** Generated column on `common.clubs` — the `=` handle prefix, decided by
   *  the database (docs/common.md → Solo clubs). The page never tests the
   *  prefix itself: knowing what a solo handle looks like is the DB's job. */
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
  const profile = useProfile(session)
  const username = profile?.username ?? null
  const [clubs, setClubs] = useState<ClubListEntry[]>([])
  // Three states, because an empty list means something different in each and
  // only one of them is a normal moment. `loading` is the moment before the
  // first fetch answers; `failed` is a fetch that errored; `loaded` is an
  // answer we believe. Rendering an empty list without knowing which of these
  // we are in is what let this page tell people they had joined no clubs.
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
      // A FAILED LOAD needs nothing here. The fault modal is already on screen
      // and the `[db]` line is already written — `readRows` did both before this
      // resumed (plans/error-system.md). What is left is the bail-out: record
      // that the load failed so the muted line under the list can say something
      // true. No classifying, no wording, no showFaultModal.
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
      // Fired on EVERY load, not once per mount (Joel, 2026-08-22). The list
      // refetches on realtime membership events, so a persistent outage will
      // re-fire — which is correct here: nothing about this state improves by
      // being mentioned once.
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
  // stop, the clubs list (plans/tab-rings.md). Everything else — the header
  // menu, "+ New club" — is unreachable by Tab because it simply isn't in the
  // ring, not because anything was marked unfocusable. The ring is also the way
  // BACK: click any blank part of the page and the list blurs, and without it
  // there would be no key left that could return the keyboard. An open <Menu>
  // is unaffected — it stopPropagation()s its own keys, so Tab still closes it.
  const clubsRef = useRef<HTMLDivElement>(null)
  useTabRing([clubsRef])

  const accountSection = useAccountMenuSection(session)

  // `?` opens the menu and `~` opens word-lookup, as on every other real page.
  // `chat: false` — chat is club-scoped and no panel is mounted here, so binding
  // `/` would swallow the key and show nothing (see the hook).
  const lookupDialog = useAppShortcuts({ chat: false })

  return (
    <div className="pageHeaderAndMainArea">
      {/* PAGE chrome, not card content — the same strip ClubPage and GamePage
          carry: square site logo hard against the page's top-left, thin rule
          beneath, the card below it. A sibling of the card rather than a child,
          so it aligns to the PAGE and not to the card's 2rem padding. */}
      <PageHeader>
        <PageHeaderMenu
          logo={<PuzpuzpuzLogo />}
          sections={[accountSection]}
          label="Main menu"
        />
      </PageHeader>
      <div className={cls('card', 'pageMain', 'pageMain-fills', styles.card)}>
        <PuzpuzpuzWordmark />
        {/* Greeting leads with the identity DISC in the user's own profile
            color — the app-wide "this color is you" marker (docs/ui.md →
            "Player identity = a colored disc"). Home is where that's worth
            re-stating: it's the last thing you see before entering a club,
            and inside a game the disc is how you find yourself on the board.
            Hence the name first and the greeting second: "● joel — welcome!"
            puts the identity where the eye lands. */}
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
          {/* The shared `.heading-with-controls` (common/patterns/heading.css):
              the heading, and on the right the control that acts on what's
              below it — here the action that ADDS to the list. Creating a new club is
              the uncommon path (most users land here, click into an
              existing club, go play) — which is the `quiet` tone, and
              the outline treatment says it isn't the obvious action.

              The `+` is a typed character, not a glyph: `icon` is available and
              deliberately unused, because a plus sign IS the label here. */}
          <header className="heading-with-controls">
            <h3>Your clubs</h3>
            <StandardButton
              name="New club"
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
            // well, since Tab does nothing on this page (useSwallowTab). An
            // empty list never takes focus, so this stays inert until the clubs
            // land.
            autoFocus
            onActivate={(c) => navigate(`/c/${c.handle}`)}
            // All three no-rows states go INSIDE the frame, which is drawn
            // whether or not there is anything in it (docs/ui.md → Selection
            // lists). The failure line is what the page is left saying behind
            // the fault modal that carries the real news, and its only job is
            // to be TRUE — hence a blank rather than a claim while the answer
            // is still in flight.
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
      {/* Creating a club is a modal, not a page (F36): the clubs list stays
          behind it, because the act is ADD TO THIS LIST. Mounting opens it and
          unmounting closes it — the modal holds no open/shut state of its own.
          On success we go into the new club, which is what you made it for. */}
      {creating && (
        <CreateClubModal
          onCreated={(handle) => navigate(`/c/${handle}`)}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* The "~" word-lookup dialog (owned by useAppShortcuts). Null when shut. */}
      {lookupDialog}
    </div>
  )
}
