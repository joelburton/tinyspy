import { execFileSync } from 'node:child_process'
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
 * Create N fresh confirmed users, each with a claimed username (which also
 * materializes their solo club `=<username>`). Names are suffixed per-run so
 * repeated runs don't collide on the global username uniqueness.
 */
async function createMembers(names: string[]): Promise<E2EMember[]> {
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

  return members
}

/**
 * Create N users and a friend club containing all of them. (`create_club`
 * requires ≥2 members — for a single-player game use `createSoloClub`.)
 */
export async function createClubWithMembers(names: string[]): Promise<E2EClub> {
  const members = await createMembers(names)

  // The first member creates the club with everyone in it. Name it after the
  // creator's (per-run-unique) username so the derived club handle doesn't
  // collide across test runs.
  const creator = members[0]
  const club = await asUser(creator.session.access_token)
    .schema('common')
    .rpc('create_club', {
      club_name: `E2E ${creator.username}`,
      member_usernames: members.map((m) => m.username),
    })
  if (club.error || !club.data) throw new Error(`create_club: ${club.error?.message}`)

  return { handle: club.data as string, members }
}

/**
 * Create one user and return their auto-created solo club (`=<username>`).
 * The cleanest fixture for single-player game tests — claim_username already
 * registers every gametype on the solo club, so it can start any game.
 */
export async function createSoloClub(name: string): Promise<E2EClub> {
  const [member] = await createMembers([name])
  return { handle: `=${member.username}`, members: [member] }
}

/**
 * Create a confirmed, signed-in user who has NOT claimed a username — so
 * there's no `common.profiles` row. Loading the app with this session is the
 * legitimate "fresh sign-in, needs to pick a handle" state that should route
 * to ClaimHandleScreen. (createMembers always claims; this is the deliberate
 * un-claimed variant.) Returns just the session — that's all the browser
 * needs to inject.
 */
export async function createUnclaimedUser(name: string): Promise<{ session: Session }> {
  const suffix = Date.now().toString(36).slice(-6)
  const username = `e2e${name}${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 30)
  const email = `${username}@e2e.test`
  const password = 'e2e-password-1234'

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`createUser(${username}): ${created.error.message}`)

  const signedIn = await createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  }).auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(`signIn(${username}): ${signedIn.error?.message}`)
  }
  return { session: signedIn.data.session }
}

/**
 * Delete a user from auth.users (cascades to their profile + solo club).
 * Simulates a `db:reset` or admin-delete that happens while a still-validly-
 * signed JWT lingers in a browser's localStorage — the "stale session" state.
 */
export async function deleteUser(userId: string): Promise<void> {
  const res = await admin.auth.admin.deleteUser(userId)
  if (res.error) throw new Error(`deleteUser(${userId}): ${res.error.message}`)
}

/**
 * Return a copy of a session that supabase-js will treat as EXPIRED on load
 * (past `expires_at`), so the app boots into the token-REFRESH path rather
 * than using the access token directly. Paired with `deleteUser`, this
 * exercises the refresh-fails-because-the-user-is-gone path — the one whose
 * error doesn't carry a clean 4xx status and used to strand the user.
 */
export function expireSession(session: Session): Session {
  return { ...session, expires_at: 1, expires_in: 0 }
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

/**
 * Start a monkeygram game in the club, with all members as players.
 * Returns the id + gametype for building the `/g/monkeygram/<id>` URL.
 */
export async function createMonkeygramGame(
  club: E2EClub,
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('monkeygram')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { hand_size: 15, timer: { kind: 'none' } },
      player_user_ids: playerUserIds,
    })
  if (res.error) throw new Error(`monkeygram.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: 'monkeygram' }
}

/** Read `member`'s own dealt tiles (the letters they hold). RLS scopes the
 *  select to their own player_boards row. Useful when a test needs to place a
 *  player's REAL tiles (the FE derives the hand by letter, so placing arbitrary
 *  letters wouldn't empty it). */
export async function getMonkeygramTiles(
  member: E2EMember,
  gameId: string,
): Promise<string> {
  const res = await asUser(member.session.access_token)
    .schema('monkeygram')
    .from('player_boards')
    .select('tiles')
    .eq('game_id', gameId)
    .single()
  if (res.error || !res.data) throw new Error(`get tiles: ${res.error?.message}`)
  return res.data.tiles as string
}

/** Save `member`'s monkeygram board placement (a 625-char grid). Drives their
 *  public progress count: unplaced = held tiles − filled cells. */
export async function saveMonkeygramBoard(
  member: E2EMember,
  gameId: string,
  board: string,
): Promise<void> {
  const res = await asUser(member.session.access_token)
    .schema('monkeygram')
    .rpc('save_player_board', { target_game: gameId, board })
  if (res.error) throw new Error(`save_player_board: ${res.error.message}`)
}

/** Empty a monkeygram game's bunch so the next peel can't refill the table —
 *  the way to drive a winning peel in a test without draining tile-by-tile.
 *  `monkeygram.pool` is hidden from PostgREST roles (it's a secret column), so
 *  we reach it the same way the import scripts do: psql as the local superuser.
 *  Test-only — no prod grant required. */
export function drainMonkeygramPool(gameId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error(`bad game id: ${gameId}`)
  execFileSync(
    'psql',
    [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `update monkeygram.games set pool = '' where id = '${gameId}';`,
    ],
    { stdio: 'pipe' },
  )
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
