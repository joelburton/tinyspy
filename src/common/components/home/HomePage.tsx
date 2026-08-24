// cs-partial

import { useCallback, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link } from '../../lib/routing/Link'
import { navigate } from '../../lib/routing/router'
import { SelectionList } from '../lists/SelectionList'
import { cls } from '../../lib/util/cls'
import { useTabToLists } from '../../hooks/input/useTabToLists'
import { db as commonDb } from '../../db'
import { faultMessage } from '../../lib/game/serverError'
import { presentFault } from '../../lib/fault/faultStore'
import { logStamp } from '../../lib/supabase/realtimeDiag'
import { useProfile } from '../../hooks/session/useProfile'
import { useRealtimeRefetch } from '../../hooks/realtime/useRealtimeRefetch'
import { Dot } from '../text/Dot'
import { PuzpuzpuzWordmark } from '../branding/PuzpuzpuzWordmark'
import { PuzpuzpuzLogo } from '../branding/PuzpuzpuzLogo'
import { Menu, type MenuHandle } from '../panels/Menu'
import { PageHeader } from '../chrome/PageHeader'
import { MenuTrigger } from '../panels/MenuTrigger'
import { useAccountMenuSection } from '../../hooks/account/useAccountMenuSection'
import { useAppShortcuts } from '../../hooks/input/useAppShortcuts'
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
 * (including your own solo space), and a path to create a new
 * one.
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
      const { data, error } = await commonDb
        .from('clubs')
        .select('handle, name, is_solo')
        .order('is_solo', { ascending: false })
        .order('created_at', { ascending: false })
      if (!mounted()) return
      // Both arms below are FAULTS, not empty states, and the reason is a site
      // invariant: `common.claim_username` materializes a solo club atomically
      // with the profile, so a signed-in user always has at least that one. No
      // clubs therefore means the load failed or the solo club is gone from the
      // database — their account is broken either way, and the app has one way
      // to say broken (docs/ui.md → Faults: a blocking modal, not a pill).
      //
      // Fired on EVERY load, not once per mount (Joel, 2026-08-22). The list
      // refetches on realtime membership events, so a persistent outage will
      // re-fire — which is correct here: nothing about this state improves by
      // being mentioned once.
      if (error) {
        const msg = faultMessage(error, 'clubs')
        presentFault({ text: msg.text, diagnostics: msg.diagnostics })
        setLoad('failed')
        return
      }
      setClubs(data ?? [])
      setLoad('loaded')
      if ((data ?? []).length === 0) {
        presentFault({
          text: "Something's wrong with your account — you should always have at least your own solo club.",
          diagnostics: `clubs — key=no-clubs detail="loaded 0 clubs; every profile has a solo club" — ${logStamp()}`,
        })
      }
    },
  })

  // ─── Keyboard navigation ─────────────────────────────────────────────────
  // The cursor, the ring, Enter, and focus-on-arrival all live in
  // <SelectionList> — see plans/selection-lists.md.
  //
  // What stays here is the page's half: where Tab goes. Native Tab only led
  // away from the keyboard story — onto the header menu and then out into the
  // browser's URL bar — so it is caught and pointed at the one list instead.
  // That is also the way BACK: click any blank part of the page and the list
  // blurs, and without this there would be no key left that could return the
  // keyboard to it. The "+ New club" link stays keyboard-unreachable from here,
  // which is the same trade-off swallowing Tab made. An open <Menu> is
  // unaffected — it stopPropagation()s its own keys, so Tab still closes it.
  const clubsRef = useRef<HTMLDivElement>(null)
  useTabToLists([clubsRef])

  const accountSection = useAccountMenuSection(session)

  // `?` opens the menu and `~` opens word-lookup, as on every other real page.
  // `chat: false` — chat is club-scoped and no panel is mounted here, so binding
  // `/` would swallow the key and show nothing (see the hook).
  const menuRef = useRef<MenuHandle>(null)
  const lookupDialog = useAppShortcuts(
    useCallback(() => menuRef.current?.open(), []),
    { chat: false },
  )

  return (
    <div className="pageHeaderAndMainArea">
      {/* PAGE chrome, not card content — the same strip ClubPage and GamePage
          carry: square site logo hard against the page's top-left, thin rule
          beneath, the card below it. A sibling of the card rather than a child,
          so it aligns to the PAGE and not to the card's 2rem padding. */}
      <PageHeader>
        <Menu
          ref={menuRef}
          trigger={
            <MenuTrigger>
              <PuzpuzpuzLogo />
            </MenuTrigger>
          }
          sections={[accountSection]}
          triggerLabel="Main menu"
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
              Nothing about it is special, so it has no class of its
              own: quiet + outline + small, and `.button` covers the
              rest whether it's a <button> or a link. */}
          <header className="heading-with-controls">
            <h3>Your clubs</h3>
            <Link to="/c/new" className={cls('button', 'secondary', 'button-small')}>
              + New club
            </Link>
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
      {/* The "~" word-lookup dialog (owned by useAppShortcuts). Null when shut. */}
      {lookupDialog}
    </div>
  )
}
