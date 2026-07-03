import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
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
      .rpc('claim_username', { desired: username, chosen_color: 'blue' })
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
      // psychicnum's setup validation requires word_count (5..20) and
      // difficulty (1..6) alongside guesses + timer — a complete, valid setup.
      // timer stays `none` on purpose: a countdown could flip the game to
      // 'lost' mid-test and make presence/heal assertions flaky.
      setup: { guesses: 7, word_count: 10, difficulty: 3, timer: { kind: 'none' } },
      player_user_ids: club.members.map((m) => m.userId),
      mode: 'coop',
    })
  if (res.error) throw new Error(`psychicnum.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: 'psychicnum_coop' }
}

/**
 * Start a bananagrams game in the club, with all members as players.
 * Returns the id + gametype for building the `/g/bananagrams/<id>` URL.
 */
export async function createBananagramsGame(
  club: E2EClub,
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('bananagrams')
    .rpc('create_game', {
      target_club: club.handle,
      // bag_size is required by bananagrams.create_game (full 144-tile bag; the
      // win test drains the pool directly rather than relying on a small bag).
      setup: { hand_size: 15, bag_size: 144, timer: { kind: 'none' } },
      player_user_ids: playerUserIds,
    })
  if (res.error) throw new Error(`bananagrams.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: 'bananagrams' }
}

/**
 * Start a boggle game in the club. Bypasses the board-generating edge function
 * (verified separately) and calls `boggle.create_game` directly with a fixed
 * board whose single required word, "cat", traces along the top row — so an
 * e2e can type a known-good word and watch it land. Returns id + gametype.
 */
export async function createBoggleGame(
  club: E2EClub,
  mode: 'coop' | 'compete' = 'coop',
  playerUserIds: string[] = club.members.map((m) => m.userId),
  boardStr = 'CATRXXXXXXXXXXXX',
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('boggle')
    .rpc('create_game', {
      target_club: club.handle,
      setup: {
        timer: { kind: 'none' },
        dice_set: '4',
        band: 3,
        legal_band: 5,
        min_word_length: 3,
        scoring_ladder: 'basic',
      },
      player_user_ids: playerUserIds,
      mode,
      board: {
        board: boardStr,
        n: 4,
        required_words: [{ word: 'cat', points: 1 }],
        required_words_count: 1,
        required_words_score: 1,
      },
    })
  if (res.error) throw new Error(`boggle.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: `boggle_${mode}` }
}

/**
 * Start a spellingbee game (coop by default) on a fixed synthetic board:
 * outer `cabdfg` + center `e`, 30 required words (the create_game ≥30 gate) plus
 * one bonus word (`bcdfge`) so the play loop can exercise required + bonus + a
 * pangram. Mirrors the pgTAP fixture. Returns id + gametype for the URL.
 */
export async function createSpellingbeeGame(
  club: E2EClub,
  mode: 'coop' | 'compete' = 'coop',
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const reqWords = [
    'bead', 'beef', 'face', 'fade', 'cage', 'cafe', 'deaf', 'aged', 'bade', 'feed',
    'edge', 'abed', 'gabe', 'babe', 'dade', 'abef', 'abeg', 'abce', 'acef', 'aceg',
    'adef', 'adeg', 'afeg', 'bcef', 'bceg', 'bdef', 'bdeg', 'bfeg', 'faced', 'abcdefg',
  ]
  const score = (w: string) => (w.length === 7 ? 17 : w.length === 4 ? 1 : w.length)
  const required = reqWords.map((w) => ({ word: w, points: score(w), is_pangram: w.length === 7 }))
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('spellingbee')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { timer: { kind: 'none' }, required: 3, legal: 5 },
      player_user_ids: playerUserIds,
      mode,
      board: {
        outer_letters: 'cabdfg',
        center_letter: 'e',
        required_words_score: required.reduce((s, r) => s + r.points, 0),
        required_words_count: required.length,
        required_words: required,
        bonus_words: [{ word: 'bcdfge', points: 6, is_pangram: false }],
      },
    })
  if (res.error) throw new Error(`spellingbee.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: `spellingbee_${mode}` }
}

/** Start a wordle game (coop by default). Returns id + gametype for the URL. */
export async function createWordleGame(
  club: E2EClub,
  mode: 'coop' | 'compete' = 'coop',
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('wordle')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { max_guesses: 6, answer_source: 0, legal_guess: 4, timer: { kind: 'none' } },
      player_user_ids: playerUserIds,
      mode,
    })
  if (res.error) throw new Error(`wordle.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: `wordle_${mode}` }
}

/** Start a scrabble game (coop by default). Returns id + gametype for the URL. */
export async function createScrabbleGame(
  club: E2EClub,
  mode: 'coop' | 'compete' = 'coop',
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('scrabble')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { timer: { kind: 'none' } },
      player_user_ids: playerUserIds,
      mode,
    })
  if (res.error) throw new Error(`scrabble.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: `scrabble_${mode}` }
}

/** Pin a scrabble game's COOP shared rack to a known set, so a test can type a
 *  deterministic, dictionary-valid word (create_game draws a random rack). Reaches
 *  the base table directly via psql (superuser), the same test-only pattern as
 *  drainBananagramsPool — no prod grant required. Tiles are single uppercase letters
 *  (or '?' for a blank); validated to keep the interpolation safe. */
export function setScrabbleRack(gameId: string, rack: string[]): void {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error(`bad game id: ${gameId}`)
  if (!rack.every((t) => /^[A-Z?]$/.test(t))) throw new Error(`bad rack: ${rack}`)
  execFileSync(
    'psql',
    [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `update scrabble.games set shared_rack = '{${rack.join(',')}}' where id = '${gameId}';`,
    ],
    { stdio: 'pipe' },
  )
}

/**
 * Start a connections game (coop by default). connections.create_game references
 * a puzzle by id, so we first insert a deterministic fixture puzzle — 4 categories
 * × 4 tiles, mirroring the pgTAP `connections_puzzle` helper. The insert uses the
 * admin (service-role) client because connections.puzzles has no INSERT grant to
 * `authenticated`. `source_id` is randomized per call so repeated runs (no
 * db:reset between) don't collide on its UNIQUE constraint; `nyt_date` is left
 * null (NULLs are distinct under UNIQUE) to stay clear of real imported dates.
 * Returns id + gametype for `/g/connections_<mode>/<id>`.
 */
export async function createConnectionsGame(
  club: E2EClub,
  mode: 'coop' | 'compete' = 'coop',
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const puzzle = await admin
    .schema('connections')
    .from('puzzles')
    .insert({
      source_id: `E2E-${randomUUID().slice(0, 8)}`,
      nyt_date: null,
      categories: [
        { rank: 0, name: 'Words starting with A', tiles: ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'] },
        { rank: 1, name: 'Words starting with B', tiles: ['BANANA', 'BIRCH', 'BREAD', 'BRICK'] },
        { rank: 2, name: 'Words starting with C', tiles: ['CASTLE', 'CIRCLE', 'CLOUD', 'CROWN'] },
        { rank: 3, name: 'Words starting with D', tiles: ['DAGGER', 'DELTA', 'DIAMOND', 'DRAGON'] },
      ],
    })
    .select('id')
    .single()
  if (puzzle.error || !puzzle.data) throw new Error(`insert puzzle: ${puzzle.error?.message}`)

  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('connections')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { puzzleId: puzzle.data.id, timer: { kind: 'none' } },
      player_user_ids: playerUserIds,
      mode,
    })
  if (res.error) throw new Error(`connections.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: `connections_${mode}` }
}

/**
 * Start a waffle game (coop by default) on a fixed, deterministic board passed
 * straight to create_game (bypassing the waffle-build-board edge function). The
 * board is the pgTAP `waffle_board` fixture: solved `abcdef.g.hijklmn.o.pqrstu`
 * with the scramble one swap away (cells 0/1). Returns id + gametype.
 */
export async function createWaffleGame(
  club: E2EClub,
  mode: 'coop' | 'compete' = 'coop',
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('waffle')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { difficulty: 2, extra_swaps: 5, timer: { kind: 'none' } },
      player_user_ids: playerUserIds,
      mode,
      board: {
        solution: 'abcdef.g.hijklmn.o.pqrstu',
        scramble: 'bacdef.g.hijklmn.o.pqrstu',
        par_swaps: 1,
      },
    })
  if (res.error) throw new Error(`waffle.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: `waffle_${mode}` }
}

/**
 * Start a stackdown game (coop by default). stackdown.create_game claims a random
 * board from the `stackdown.boards` library (populated by the offline import), so
 * we only guarantee the library is non-empty: seed the pgTAP fixture board
 * (EAGLE/TABLE/PLANS/APPLE/JUICE/LEMON) if it's empty. The stackdown schema isn't
 * exposed to PostgREST (its tables are reached only via SECURITY DEFINER RPCs), so
 * like `drainBananagramsPool` we go through psql as the local superuser — an
 * atomic insert-if-empty that leaves any imported boards untouched. Any valid
 * board yields the same 9×9 arena geometry, which is all the layout harness
 * measures. Returns id + gametype.
 */
export async function createStackdownGame(
  club: E2EClub,
  mode: 'coop' | 'compete' = 'coop',
  playerUserIds: string[] = club.members.map((m) => m.userId),
): Promise<{ id: string; gametype: string }> {
  const tiles = [
    { id: 0, z: 0, y: 0, x: 2, letter: 'E' }, { id: 1, z: 0, y: 0, x: 6, letter: 'A' },
    { id: 2, z: 1, y: 1, x: 3, letter: 'L' }, { id: 3, z: 1, y: 1, x: 5, letter: 'N' },
    { id: 4, z: 0, y: 2, x: 0, letter: 'C' }, { id: 5, z: 2, y: 2, x: 2, letter: 'B' },
    { id: 6, z: 2, y: 2, x: 4, letter: 'T' }, { id: 7, z: 2, y: 2, x: 6, letter: 'P' },
    { id: 8, z: 0, y: 2, x: 8, letter: 'S' }, { id: 9, z: 1, y: 3, x: 1, letter: 'E' },
    { id: 10, z: 3, y: 3, x: 3, letter: 'E' }, { id: 11, z: 3, y: 3, x: 5, letter: 'A' },
    { id: 12, z: 1, y: 3, x: 7, letter: 'L' }, { id: 13, z: 0, y: 4, x: 0, letter: 'N' },
    { id: 14, z: 2, y: 4, x: 2, letter: 'L' }, { id: 15, z: 2, y: 4, x: 6, letter: 'G' },
    { id: 16, z: 0, y: 4, x: 8, letter: 'A' }, { id: 17, z: 1, y: 5, x: 1, letter: 'L' },
    { id: 18, z: 3, y: 5, x: 3, letter: 'P' }, { id: 19, z: 3, y: 5, x: 5, letter: 'E' },
    { id: 20, z: 1, y: 5, x: 7, letter: 'A' }, { id: 21, z: 0, y: 6, x: 0, letter: 'E' },
    { id: 22, z: 2, y: 6, x: 2, letter: 'U' }, { id: 23, z: 2, y: 6, x: 4, letter: 'J' },
    { id: 24, z: 2, y: 6, x: 6, letter: 'L' }, { id: 25, z: 0, y: 6, x: 8, letter: 'P' },
    { id: 26, z: 1, y: 7, x: 3, letter: 'I' }, { id: 27, z: 1, y: 7, x: 5, letter: 'M' },
    { id: 28, z: 0, y: 8, x: 2, letter: 'E' }, { id: 29, z: 0, y: 8, x: 6, letter: 'O' },
  ]
  const seedSql =
    `insert into stackdown.boards (tiles, words) ` +
    `select '${JSON.stringify(tiles)}'::jsonb, ` +
    `array['eagle','table','plans','apple','juice','lemon']::text[] ` +
    `where not exists (select 1 from stackdown.boards);`
  execFileSync(
    'psql',
    ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-v', 'ON_ERROR_STOP=1', '-c', seedSql],
    { stdio: 'pipe' },
  )

  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('stackdown')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { timer: { kind: 'none' } },
      player_user_ids: playerUserIds,
      mode,
    })
  if (res.error) throw new Error(`stackdown.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: `stackdown_${mode}` }
}

/**
 * Start a codenamesduet game in the club (exactly 2 players — it's a fixed-seat
 * game). `firstClueGiverUserId` is seated as A (opens the game); the other
 * member is B. Returns id + gametype for `/g/codenamesduet/<id>`.
 */
export async function createCodenamesduetGame(
  club: E2EClub,
  firstClueGiverUserId: string = club.members[0].userId,
): Promise<{ id: string; gametype: string }> {
  const creator = club.members[0]
  const res = await asUser(creator.session.access_token)
    .schema('codenamesduet')
    .rpc('create_game', {
      target_club: club.handle,
      setup: { turns: 9, firstClueGiverUserId, timer: { kind: 'none' } },
      player_user_ids: club.members.map((m) => m.userId),
    })
  if (res.error) throw new Error(`codenamesduet.create_game: ${res.error.message}`)
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { id: (row as { id: string }).id, gametype: 'codenamesduet' }
}

/** Read `member`'s own dealt tiles (the letters they hold). RLS scopes the
 *  select to their own player_boards row. Useful when a test needs to place a
 *  player's REAL tiles (the FE derives the hand by letter, so placing arbitrary
 *  letters wouldn't empty it). */
export async function getBananagramsTiles(
  member: E2EMember,
  gameId: string,
): Promise<string> {
  const res = await asUser(member.session.access_token)
    .schema('bananagrams')
    .from('player_boards')
    .select('tiles')
    .eq('game_id', gameId)
    .single()
  if (res.error || !res.data) throw new Error(`get tiles: ${res.error?.message}`)
  return res.data.tiles as string
}

/** Save `member`'s bananagrams board placement (a 625-char grid). Drives their
 *  public progress count: unplaced = held tiles − filled cells. */
export async function saveBananagramsBoard(
  member: E2EMember,
  gameId: string,
  board: string,
): Promise<void> {
  const res = await asUser(member.session.access_token)
    .schema('bananagrams')
    .rpc('save_player_board', { target_game: gameId, board })
  if (res.error) throw new Error(`save_player_board: ${res.error.message}`)
}

/** Empty a bananagrams game's bunch so the next peel can't refill the table —
 *  the way to drive a winning peel in a test without draining tile-by-tile.
 *  `bananagrams.pool` is hidden from PostgREST roles (it's a secret column), so
 *  we reach it the same way the import scripts do: psql as the local superuser.
 *  Test-only — no prod grant required. */
export function drainBananagramsPool(gameId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error(`bad game id: ${gameId}`)
  execFileSync(
    'psql',
    [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `update bananagrams.games set pool = '' where id = '${gameId}';`,
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
