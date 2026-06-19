import { createClient, type Session } from '@supabase/supabase-js'

/**
 * Backend fixtures for the e2e smoke tests: create real users, claim
 * usernames, build a club, optionally seed a game — all through the
 * local Supabase admin API + the same RPCs the app uses. Returns each
 * user's Session so the browser can be signed in via session injection
 * (see ./session.ts), sidestepping the magic-link UI.
 *
 * Keys are the well-known LOCAL dev defaults (same ones the import
 * scripts hardcode) — never used against a hosted project.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** A Supabase client acting as a specific signed-in user (for RPCs). */
function asUser(accessToken: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  })
}

export type E2EMember = { username: string; userId: string; session: Session }
export type E2EClub = { handle: string; members: E2EMember[] }

/**
 * Create N fresh confirmed users (each with a claimed username) and a
 * club containing them. Names are suffixed per-run so repeated runs
 * don't collide on the global username/club uniqueness.
 */
export async function createClubWithMembers(names: string[]): Promise<E2EClub> {
  const suffix = Date.now().toString(36).slice(-6)
  const members: E2EMember[] = []

  for (const name of names) {
    const username = `e2e${name}${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 30)
    const email = `${username}@e2e.test`
    const password = 'e2e-password-1234'

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (created.error) throw new Error(`createUser(${username}): ${created.error.message}`)

    const signedIn = await createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`signIn(${username}): ${signedIn.error?.message}`)
    }
    const session = signedIn.data.session

    const claimed = await asUser(session.access_token)
      .schema('common')
      .rpc('claim_username', { desired: username })
    if (claimed.error) throw new Error(`claim_username(${username}): ${claimed.error.message}`)

    members.push({ username, userId: session.user.id, session })
  }

  // The first member creates the club with everyone in it.
  const creator = members[0]
  const club = await asUser(creator.session.access_token)
    .schema('common')
    .rpc('create_club', {
      club_name: `E2E ${suffix}`,
      member_usernames: members.map((m) => m.username),
    })
  if (club.error || !club.data) throw new Error(`create_club: ${club.error?.message}`)

  return { handle: club.data as string, members }
}

/**
 * Start a psychicnum game (the minimal gametype) in the club, with all
 * members as players. `create_game` sets `is_current_view = true`.
 * Whether it's "abandoned" (the heal case) or actively viewed (the
 * pause case) is up to the test — it depends only on whether a browser
 * navigates to the game's GamePage. Returns the id + the gametype
 * (for building the `/g/<gametype>/<id>` URL).
 */
export async function createGame(
  club: E2EClub,
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('psychicnum')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { guesses: 7, timer: { kind: 'none' } },
      player_user_ids: club.members.map((m) => m.userId),
      mode: 'coop',
    })
  if (res.error) throw new Error(`psychicnum.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: 'psychicnum_coop' }
}

/** Send a club chat message as `from`. The realtime INSERT reaches
 *  every connected client — which is what the unread-badge test
 *  exercises. */
export async function sendMessage(
  club: E2EClub,
  from: E2EMember,
  content: string,
): Promise<void> {
  const res = await asUser(from.session.access_token)
    .schema('common')
    .rpc('send_message', { target_club: club.handle, content })
  if (res.error) throw new Error(`send_message: ${res.error.message}`)
}
