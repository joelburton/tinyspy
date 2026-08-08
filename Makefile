# ════════════════════════════════════════════════════════════════
# puzpuzpuz — build, data, and deploy targets
# ════════════════════════════════════════════════════════════════
# `gmake help` lists everything. The durable docs are docs/cheatsheet.md
# (commands) and docs/supabase.md#schema-vs-code (the model).
#
# WHAT THIS IS FOR: npm scripts can't express a dependency — the old
# `npm run deploy` was an all-or-nothing chain that reached production
# with none of these guards, and it's retired; this file is the only
# deploy entry point. It owns EDGES and ENVIRONMENT; every recipe shells
# out to the npm script or deploy step that already exists. Nothing is
# reimplemented here.
#
# THE DEV LOOP IS STILL npm. `npm run dev` / `npm test` / `npm run lint`
# are what you type fifty times a day and what the docs reference. Make
# is for the things npm can't say: "generate the boards first if they're
# missing", "rebuild everything downstream of the word list", "push only
# the functions".
#
# ENV=local or ENV=prod, REQUIRED — there is no default. Anything that talks
# to a database refuses without it, and every writing target echoes its
# resolved target first.
#
# TROUBLESHOOTING. The supabase CLI's errors end with "Try rerunning the
# command with --debug", which does NOT work here: `gmake … --debug` hands the
# flag to make, whose --debug means something else entirely. The two knobs:
#   DEBUG=1            → passes --debug to the supabase CLI (its own verbose
#                        HTTP/API trace, which is what that hint meant)
#   gmake --trace …    → make's side: prints each recipe line with the target
#                        and the prerequisite that triggered it. This is the
#                        one for "why did that rebuild / why didn't it"
#   gmake -n …         → print without running (safe: see the -n note below)
#
# `gmake -n <target>` is a real dry run here, and staying that way takes
# care: GNU Make executes a recipe that mentions $(MAKE) even under -n, and
# .ONESHELL makes that the WHOLE recipe. So composite targets contain
# nothing but sub-makes and echoes, and anything that actually writes lives
# in its own target reached BY a sub-make (which inherits -n and only
# prints). See deploy-func-% and project-db-destroy.

# ── GNU Make 4+ required ────────────────────────────────────────
# macOS ships 3.81 (2006), which has no .ONESHELL. That matters here
# rather than being a nicety: every hosted target sources
# supabase/deploy/env.sh, and without .ONESHELL each recipe LINE gets
# its own shell, so the sourced environment evaporates before the next
# line runs. Fail loudly instead of misbehaving quietly.
ifneq ($(firstword $(sort $(MAKE_VERSION) 4.0)),4.0)
$(error GNU Make 4.0+ required — this is $(MAKE_VERSION). macOS ships 3.81; \
use `gmake` (brew install make))
endif

.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
SHELL := /bin/bash
.DEFAULT_GOAL := help

# Serial, ALWAYS. The safety story here is prerequisite ORDER — `deploy`
# lists _require-prod first so the refusal fires before db-schema can wipe
# anything — and prerequisite order only exists in serial make. Under -j8,
# `gmake deploy ENV=local` really ran `supabase db reset` and `supabase link`
# before the refusal landed (proven with PATH shims; audit-make.sh check 5
# now guards it). Nothing in this file wants parallelism anyway — every
# chain is a pipeline, not a fan-out.
.NOTPARALLEL:

# ── environment ─────────────────────────────────────────────────
# NO DEFAULT, deliberately. `gmake deploy` once meant ENV=local, which wiped
# the local database via db-schema and then pushed to production anyway — the
# worst of both, from a command that named neither. A default is a guess about
# which database you meant, and there is no safe guess.
#
# Only targets that TALK to a database demand it (they all go through
# $(PRELUDE), which refuses when ENV is unset). `help`, `dev-*`, `test-*`,
# `_audit` and the local-pinned artefact builders don't care and don't ask.
ENV ?=
LOCAL_DB_URL := postgresql://postgres:postgres@127.0.0.1:54322/postgres

ifeq ($(ENV),)
  # Not a $(error): that fires at PARSE time and would break `gmake help` and
  # every ENV-free target. Refusing inside the recipe means only the targets
  # that actually need ENV are the ones that insist on it.
  PRELUDE := echo "REFUSED: pass ENV=local or ENV=prod — there is no default" >&2; exit 1
else ifeq ($(ENV),local)
  # Plain export: the local stack needs no secrets and no discovery.
  PRELUDE := export SUPABASE_DB_URL=$(LOCAL_DB_URL)
else ifeq ($(ENV),prod)
  # The sourced prelude does secrets, project discovery, key fetch and
  # the connection string (see supabase/deploy/env.sh) — and then ANNOUNCES
  # the project + masked database it resolved, so every prod target says
  # where it's pointed before doing anything. That announcement is policy
  # (see the header), and putting it in the prelude means no individual
  # target can forget it.
  PRELUDE := . supabase/deploy/env.sh; require_project; derive_db_url; fetch_api_keys; announce_target
else
  $(error ENV must be `local` or `prod` (got `$(ENV)`))
endif

# DEBUG=1 threads `--debug` into the supabase CLI. Worth knowing because the
# CLI's own error text says "Try rerunning the command with --debug" — advice
# that does NOT work here: `gmake … --debug` hands the flag to make, which has
# its own unrelated meaning for it. See the header for make-side tracing.
SUPA_FLAGS := $(if $(DEBUG),--debug,)

# Where the word list actually lives — read LIVE from the gamelist
# working copy, never vendored into this repo (import-words.ts). This is
# the one prerequisite that sits outside the checkout, which is exactly
# why the DAG is worth having: `words` and everything downstream of it
# rebuild when that file changes.
WORDS_TSV ?= $(HOME)/src/gamelist/output/words.tsv

# `wildcard` yields empty when the file isn't there. Depending on the
# EXPANSION rather than the path means make never claims it can build a
# file it has no rule for ("No rule to make target ..."); instead the
# target runs and import-words.ts prints the real, actionable error.
WORDS_SRC := $(wildcard $(WORDS_TSV))

STACKDOWN_JSONL := supabase/data/stackdown-boards.jsonl
STRANDS_JSONL   := supabase/data/strands-puzzles.jsonl
BOGGLE_TRIE     := supabase/functions/boggle-build-board/wordlist.ts
SCRABBLE_TRIE   := supabase/functions/scrabble-suggest-move/wordlist.ts

# Board generation knobs (gmake g-stackdown-genpuzzles COUNT=50 BAND=2)
COUNT ?= 10
BAND  ?= 1
SEED  ?= $(shell date +%s)

# ── stamps ──────────────────────────────────────────────────────
# A database table has no mtime, so it can't join a dependency graph on
# its own. A stamp file stands in for one: touched after a successful
# load, with the real inputs as its prerequisites.
#
# HONEST LIMITS, because a build system that lies is worse than a slow
# one: a stamp records what WE last did, not what the database holds.
# Someone else's `db:reset`, a colleague's import, a restored snapshot —
# all make it lie. Escape hatches: `gmake -B <target>` forces, and
# `gmake _stamps-clean` forgets everything. Per-ENV, because "loaded to
# local" says nothing about prod. The failure mode is a needless
# re-import (a couple of minutes), never corruption — which is the only
# reason stamps are acceptable here at all.
# With no ENV this is `.make/_no_env`, whose pattern rule below refuses with
# the same message as everything else. Without the sentinel, $(STAMPS) would be
# a bare `.make/` and a stamp target would fail with make's own
# "No rule to make target '.make//words.stamp'" — technically safe (it stops)
# but it tells you nothing about what you did wrong.
ifeq ($(ENV),)
  STAMPS := .make/_no_env
else
  STAMPS := .make/$(ENV)
endif

.make/local .make/prod:
	@mkdir -p $@

# Shorter stem wins in GNU make, so this beats the generic `.make/%/…` rules.
.make/_no_env/%.stamp:
	@echo "REFUSED: pass ENV=local or ENV=prod — there is no default" >&2
	exit 1

# ════════════════════════════════════════════════════════════════
# Data + assets
# ════════════════════════════════════════════════════════════════

.PHONY: all-words
all-words: $(STAMPS)/words.stamp ## import common.words — the list every word game reads

# A PATTERN rule over the env, not a rule for $(ENV) — the stamp's PATH names
# the database it describes, so the recipe derives its connection from `$*`
# rather than from ENV. That's what makes `.make/local/words.stamp` buildable
# during a PROD deploy, which it has to be: the trie bundles are pinned to
# local, so `gmake deploy ENV=prod` on a checkout that never ran a local
# import used to die with "No rule to make target '.make/local/words.stamp'".
.make/%/words.stamp: $(WORDS_SRC) | .make/%
	@if [ "$*" = "local" ]; then
	  export SUPABASE_DB_URL=$(LOCAL_DB_URL)
	elif [ "$*" = "prod" ]; then
	  . supabase/deploy/env.sh; require_project; derive_db_url; announce_target
	else
	  # Fail CLOSED. With no ENV, $(STAMPS) is `.make/` and $* comes out
	  # empty — an `else` that meant "prod" would have made a bare
	  # `gmake all-words` import 283k rows into production.
	  echo "REFUSED: unknown stamp env '$*' — pass ENV=local or ENV=prod" >&2; exit 1
	fi
	echo "── all-words → $*"
	npm run _words:import
	touch $@
	echo
	echo "  NOTE: the committed stackdown boards were built against the OLD"
	echo "  word list. They are not broken — still solvable, still real words —"
	echo "  but they may hold words this list would no longer choose."
	echo "  Run \`gmake g-stackdown-audit\` to see the size of it; rebuilding is"
	echo "  slow and often not worth it. Your call."

# Same pattern-over-env shape as the words stamp above, for the same reason.
.PHONY: g-spellingbee-pangrams
g-spellingbee-pangrams: $(STAMPS)/spellingbee-pangrams.stamp ## rebuild the spellingbee board-seed pool
.make/%/spellingbee-pangrams.stamp: .make/%/words.stamp
	@if [ "$*" = "local" ]; then export SUPABASE_DB_URL=$(LOCAL_DB_URL)
	elif [ "$*" = "prod" ]; then . supabase/deploy/env.sh; require_project; derive_db_url; announce_target
	else echo "REFUSED: unknown stamp env '$*'" >&2; exit 1; fi
	npm run _spellingbee:import
	touch $@

.PHONY: g-wordwheel-pangrams
g-wordwheel-pangrams: $(STAMPS)/wordwheel-pangrams.stamp ## rebuild the wordwheel board-seed pool
.make/%/wordwheel-pangrams.stamp: .make/%/words.stamp
	@if [ "$*" = "local" ]; then export SUPABASE_DB_URL=$(LOCAL_DB_URL)
	elif [ "$*" = "prod" ]; then . supabase/deploy/env.sh; require_project; derive_db_url; announce_target
	else echo "REFUSED: unknown stamp env '$*'" >&2; exit 1; fi
	npm run _wordwheel:import
	touch $@

.PHONY: all-pangrams
all-pangrams: g-spellingbee-pangrams g-wordwheel-pangrams ## both seed pools

# letterboxed's pool is seeds, not pangrams — chained word PAIRS whose letters
# union to exactly twelve — so it stands outside all-pangrams and hangs off
# db-data directly. Same words.stamp prerequisite: it reads common.words.
.PHONY: g-letterboxed-seeds
g-letterboxed-seeds: $(STAMPS)/letterboxed-seeds.stamp ## rebuild the letterboxed board-seed pool
.make/%/letterboxed-seeds.stamp: .make/%/words.stamp
	@if [ "$*" = "local" ]; then export SUPABASE_DB_URL=$(LOCAL_DB_URL)
	elif [ "$*" = "prod" ]; then . supabase/deploy/env.sh; require_project; derive_db_url; announce_target
	else echo "REFUSED: unknown stamp env '$*'" >&2; exit 1; fi
	npm run _letterboxed:import
	touch $@

# The two edge-function dictionaries. Real files, but derived from a
# DATABASE — so the stamp, not the .ts, is the prerequisite. They're
# gitignored build artifacts, and their functions won't compile without
# them, which is why `deploy-funcs` depends on them.
#
# ALWAYS BUILT FROM LOCAL, whatever ENV says — note the hardcoded
# .make/local stamp and the pinned URL. The bundles are derived from the
# canonical dictionary (words.tsv → local common.words), and during a
# fresh project-bootstrap the hosted common.words isn't loaded until step 8,
# several steps after the functions deploy. Depending on the per-ENV
# stamp would make `gmake deploy-funcs ENV=prod` try to import 283k words
# INTO PROD first, which is neither wanted nor implied.
.PHONY: g-boggle-trie
g-boggle-trie: $(BOGGLE_TRIE) ## bundle boggle's solver dictionary (from LOCAL common.words)
$(BOGGLE_TRIE): .make/local/words.stamp
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run _boggle:wordlist

.PHONY: g-scrabble-trie
g-scrabble-trie: $(SCRABBLE_TRIE) ## bundle the scrabble AI's dictionary (from LOCAL common.words)
$(SCRABBLE_TRIE): .make/local/words.stamp
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run _scrabble:wordlist

.PHONY: all-tries
all-tries: g-boggle-trie g-scrabble-trie ## both edge-function word bundles

# g-stackdown-genpuzzles APPENDS (it adds COUNT boards and dedups by word-set;
# it does not rebuild), so it must never be a timestamp-driven rule —
# that would grow the library every time the generator was touched. It's
# .PHONY and explicit. The FILE rule below has no prerequisites, so make
# builds it only when it's actually missing, which is the
# generate-if-absent behaviour `g-stackdown-puzzles` wants.
# Reads the lexicon LOCALLY and writes a local file, whatever ENV says —
# same pinning as the tries, and for the same reason: depending on the
# per-ENV stamp would make `ENV=prod` import 283k words into prod first,
# to build something that never leaves this machine.
.PHONY: g-stackdown-genpuzzles
g-stackdown-genpuzzles: .make/local/words.stamp ## generate COUNT=n BAND=b boards (APPENDS to the library)
	@echo "── generating $(COUNT) band-$(BAND) board(s), seed $(SEED) (appending)"
	SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run _stackdown:gen -- $(COUNT) $(SEED) $(BAND)

$(STACKDOWN_JSONL):
	@echo "── $(STACKDOWN_JSONL) is missing (fresh clone?) — generating a starter set"
	$(MAKE) g-stackdown-genpuzzles COUNT=25 BAND=1
	$(MAKE) g-stackdown-genpuzzles COUNT=25 BAND=2

.PHONY: g-stackdown-puzzles
g-stackdown-puzzles: $(STACKDOWN_JSONL) ## delete + reload stackdown.boards (generates the library iff missing)
	@$(PRELUDE)
	echo "── stackdown.boards → $(ENV)"
	npm run _stackdown:import

.PHONY: g-stackdown-audit
g-stackdown-audit: ## report boards holding words the CURRENT dictionary wouldn't choose
	@$(PRELUDE)
	npx tsx supabase/scripts/audit-stackdown-boards.ts || \
	  echo "(informational — those boards still play fine; rebuilding is your call)"

.PHONY: g-connections-puzzles
g-connections-puzzles: ## import the NYT Connections archive (remote source, incremental)
	@$(PRELUDE)
	echo "── connections.puzzles → $(ENV)"
	npm run _connections:import

.PHONY: g-crosswords-puzzles
g-crosswords-puzzles: ## import supabase/data/crosswords/*.puz|.ipuz
	@$(PRELUDE)
	echo "── crosswords.puzzles → $(ENV)"
	npm run _crosswords:import

# strands is the one library sourced from a THIRD-PARTY endpoint we don't own,
# so fetching is split from importing. `gmake db` is routine and frequent, and
# folding the fetch into it fired ~900 requests at nytimes.com every reset —
# rude, and a good way to get blocked. So the archive lives on disk, imports
# read it, and the network step is explicit, incremental and rare. Same shape as
# stackdown's generate-then-import split; no ENV / PRELUDE, because fetching
# touches no database.
.PHONY: g-strands-fetch
g-strands-fetch: ## fetch NEW NYT Strands puzzles into the local archive (network; incremental)
	@echo "── NYT Strands → $(STRANDS_JSONL)"
	npm run _strands:fetch

# Fetch only when the archive is genuinely absent (a fresh clone). No
# prerequisites, so make never re-fetches on a whim — the same
# build-it-iff-missing shape as $(STACKDOWN_JSONL).
$(STRANDS_JSONL):
	@echo "── $(STRANDS_JSONL) is missing (fresh clone?) — fetching the archive"
	$(MAKE) g-strands-fetch

.PHONY: g-strands-puzzles
g-strands-puzzles: $(STRANDS_JSONL) ## load strands.puzzles from the local archive (NO network)
	@$(PRELUDE)
	echo "── strands.puzzles → $(ENV)"
	npm run _strands:import

.PHONY: db-data
db-data: all-words all-pangrams g-letterboxed-seeds g-stackdown-puzzles g-connections-puzzles g-crosswords-puzzles g-strands-puzzles ## load every table's DATA (no schema, no code)

# ════════════════════════════════════════════════════════════════
# Schema + code   (docs/supabase.md → Schema vs code)
# ════════════════════════════════════════════════════════════════

.PHONY: db-schema
db-schema: ## apply the SHAPE half — migrations (local: reset; prod: push)
	@$(PRELUDE)
ifeq ($(ENV),local)
	# `db reset` DROPS the database, so every stamp claiming a table is
	# loaded became a lie the instant it ran. Forget them FIRST — otherwise
	# `db-reset` skips the word import it just destroyed and leaves
	# common.words empty, with nothing to indicate it. This is the one place
	# the stamps' weakness is guaranteed rather than hypothetical, so it's
	# handled at the source instead of being left to the operator.
	rm -f $(STAMPS)/*.stamp
	supabase $(SUPA_FLAGS) db reset
	# `db reset` RESTARTS the containers, and the CLI returns before PostgREST
	# is answering again. Everything that talks to Postgres directly is fine —
	# but the connections importer goes through the REST API, and it failed
	# with "Could not query the database for the schema cache" when it landed
	# in that window. A target that restarts the stack owes its callers a
	# stack that works, so wait here rather than making each consumer retry.
	printf '   waiting for PostgREST'
	for i in $$(seq 1 60); do
	  code=$$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/rest/v1/ || echo 000)
	  # Any HTTP answer means it's up — 401 (no apikey) counts.
	  if [ "$$code" != "000" ]; then echo " ok ($$code)"; break; fi
	  printf '.'; sleep 1
	  if [ $$i = 60 ]; then echo " TIMED OUT after 60s" >&2; exit 1; fi
	done
else
	# (No project ref in this echo: PROJECT_REF is a SHELL variable, and a
	# make-style reference to it here expands to empty — which once made this
	# line announce nothing. The prod prelude announces the resolved
	# project + database instead.)
	echo "── db push"
	# `db push` ships only migration VERSIONS the remote hasn't recorded.
	# While baselines are edited in place (the alpha habit), an edit to an
	# already-applied file is invisible to it: the push reports "up to date"
	# and ships nothing. Say so — "deploy succeeded" must not be read as
	# "my schema change is live".
	push_log=$$(mktemp)
	supabase $(SUPA_FLAGS) db push --linked <<< y 2>&1 | tee "$$push_log"
	if grep -qi "up to date" "$$push_log"; then
	  echo
	  echo "  NOTE: no new migration versions were pushed. If your schema change"
	  echo "  was an EDIT to an already-applied baseline, it did NOT ship — shape"
	  echo "  edits reach prod only as a new migration, or via project-bootstrap"
	  echo "  MIGRATIONS=destroy."
	fi
	rm -f "$$push_log"
endif

.PHONY: db-sql
db-sql: ## re-apply the CODE half — supabase/sql/*.sql (functions, views, policies, grants)
	@$(PRELUDE)
ifeq ($(ENV),local)
	npm run _sql:apply
else
	npm run _sql:apply -- --require-url
endif

# The STRUCTURE only — every table and function, and nothing in them. Named
# for exactly what it runs, because the honest description of the result is
# "an empty database": no word list, no puzzle libraries, no boards. Wanted on
# its own mainly by `deploy`, which ships definitions and leaves data alone.
.PHONY: db-schema-sql
db-schema-sql: db-schema db-sql ## structure only: migrations, then supabase/sql/ (NO data)

# A database you can actually play on. `db` used to mean structure-only, which
# read as "the database is ready" while common.words sat empty and every word
# game failed at create_game. If it's called db, it should be usable.
.PHONY: db
db: db-schema-sql db-data ## a WORKING database: structure + every table's data

# Pinned to LOCAL rather than merely documented as local-only: seeding the
# dev personas into a real database would be a mess to unpick, and an
# exported SUPABASE_DB_URL in the caller's shell is all it would take.
.PHONY: db-seed
db-seed: ## local only: the dev personas + clubs (seed.dev.sql)
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run _seed

# db-seed's counterpart for a REAL person: one account, ahead of their first
# sign-in, so a friend arrives to a handle + solo club instead of the claim
# screen. Unlike db-seed it takes ENV, because provisioning into the hosted
# project is the entire point — and unlike seed.dev.sql it fabricates no auth
# rows, driving the Admin API and the real claim_username RPC instead.
#
# HANDLE, not USERNAME: make imports the environment as variables, and
# USERNAME is set by default in some shells — which would silently supply a
# wrong-but-plausible default for the one field that can't be changed later.
# A name the environment might already own is a trap, so it doesn't get used.
#
# The same trap caught COLOR for real: npm exports COLOR ('0'/'1', its own
# colour-support flag) into every script it runs, so the value handed to
# `npm run` was overwritten before the script read it. The flag you type is
# still COLOR=… — it's passed along under PLAYER_COLOR, which npm doesn't own.
#
# The values are single-quoted into the child's environment rather than
# interpolated into a command line, so an address with a `+` or a shell
# metacharacter can't be mangled or re-parsed.
.PHONY: db-add-user
db-add-user: ## create a player account ahead of their first sign-in (EMAIL, HANDLE, COLOR, DRY=1)
	@$(PRELUDE)
	echo "── add user → $(ENV)"
	EMAIL='$(EMAIL)' HANDLE='$(HANDLE)' PLAYER_COLOR='$(COLOR)' DRY='$(DRY)' npm run --silent _user:add

# An interactive shell on whichever database ENV names — the thing you reach
# for when a target did something surprising. SQL="..." runs one statement and
# exits instead. The prod prelude announces the target first: `gmake db-psql
# ENV=prod` is a prompt on the friends' real data, and which one you're typing
# into should never be a guess.
.PHONY: db-psql
db-psql: ## psql on ENV's database — SQL="select 1" to run one statement
	@$(PRELUDE)
	echo "── psql → $(ENV)"
	psql "$$SUPABASE_DB_URL" $(if $(SQL),-c "$(SQL)",)

# ── backups ─────────────────────────────────────────────────────
# pg_dump of the IRREPLACEABLE data: auth accounts + every app schema's rows.
# The structure rebuilds from git (migrations + supabase/sql/) and the bulk
# seed/dictionary tables rebuild from db-data or migration replay, so their
# DATA is excluded — a backup stays at friend-data size (KBs, not the
# 283k-row word list), which is what makes "snapshot before every prod
# write" frictionless. project-db-destroy depends on db-backup, so a wipe
# always leaves one behind.
#
# Custom format (-Fc): compressed, and pg_restore can later pull out one
# table or schema instead of replaying the whole file.
#
# The schema list is a psql-style pattern (anchored alternation), not one
# -n per name: a brand-new project has no game schemas yet, and pg_dump
# ERRORS on a -n that matches nothing — auth always exists, so the
# alternation always matches at least once.
BACKUP_SCHEMAS := auth|common|codenamesduet|psychicnum|connections|spellingbee|wordwheel|bananagrams|waffle|wordle|stackdown|scrabble|boggle|crosswords|wordiply|strands|letterboxed
# Excluded because something else already provides the rows, with the SAME
# KEYS (that caveat has teeth — see the boards/puzzles note below):
#   migrations reseed:  common.gametypes, codenamesduet.word_pool (static
#                       handles, so FKs from restored rows still land)
#   importers reload:   common.words, both pangram pools (value-copied at
#                       game creation; nothing FKs into them)
# Plus the auth EPHEMERA: sessions, refresh tokens, MFA, audit log — a
# restore that forces re-login is correct, and auth.schema_migrations would
# collide with the target's own history. Accounts = users + identities,
# which stay in.
#
# NOT excluded, deliberately:
#   stackdown.boards, connections.puzzles, crosswords.puzzles — game rows
#     FK into them by id, and the importers assign FRESH ids on reload, so
#     "rebuildable" does not preserve identity. Small anyway (~2.5k rows).
#   common.clubs_gametypes — its migration insert is a backfill over
#     existing clubs (a no-op on a fresh database); the real rows are
#     per-club state worth keeping.
BACKUP_EXCLUDE := common.gametypes codenamesduet.word_pool common.words \
  spellingbee.pangrams wordwheel.pangrams letterboxed.seeds \
  auth.(sessions|refresh_tokens|mfa_*|flow_state|one_time_tokens|saml_*|sso_*|audit_log_entries|schema_migrations|instances)

.PHONY: db-backup
db-backup: ## pg_dump ENV's irreplaceable data → backups/<env>-<time>.dump
	@$(PRELUDE)
	# pg_dump refuses to read a server newer than itself; check up front and
	# name both versions rather than letting its error name only one.
	client=$$(pg_dump --version | grep -oE '[0-9]+' | head -1)
	server=$$(psql -X -Atc 'show server_version_num' "$$SUPABASE_DB_URL" | cut -c1-2)
	if [ "$$client" -lt "$$server" ]; then
	  echo "REFUSED: pg_dump is v$$client but the server is v$$server —" >&2
	  echo "         upgrade the client (brew upgrade libpq); it must be >= the server" >&2
	  exit 1
	fi
	mkdir -p backups
	out="backups/$(ENV)-$$(date +%Y%m%d-%H%M%S).dump"
	# Write to .partial and rename only on success: a failed pg_dump must
	# not leave behind a truncated file that looks like a usable backup.
	pg_dump -Fc --no-owner \
	  --schema '($(BACKUP_SCHEMAS))' \
	  $(foreach t,$(BACKUP_EXCLUDE),--exclude-table-data '$(t)') \
	  --file "$$out.partial" "$$SUPABASE_DB_URL" \
	  || { rm -f "$$out.partial"; exit 1; }
	mv "$$out.partial" "$$out"
	echo "── wrote $$out ($$(du -h "$$out" | cut -f1))"

.PHONY: db-restore
db-restore: ## pg_restore DUMP=backups/<file>.dump (data only) into ENV's database
	@$(PRELUDE)
	[[ -n "$(DUMP)" ]] || { echo "REFUSED: pass DUMP=backups/<file>.dump" >&2; exit 1; }
	[[ -f "$(DUMP)" ]] || { echo "REFUSED: $(DUMP) does not exist" >&2; exit 1; }
	if [[ "$(ENV)" == "prod" ]]; then
	  printf 'Type the project ref shown above to confirm restoring into it: '
	  read -r reply || { echo "REFUSED: no confirmation (stdin closed) — nothing restored." >&2; exit 1; }
	  [[ "$$reply" == "$$PROJECT_REF" ]] || { echo "REFUSED: that isn't the project ref — nothing restored." >&2; exit 1; }
	fi
	# DATA ONLY, into a database whose structure git already built — the
	# expected flow is: db-schema-sql (structure), db-restore (the friends'
	# rows), then all-words + all-pangrams (the excluded dictionary bulk).
	# NOT db-data: its stackdown reload would delete the restored boards
	# out from under the games that reference them.
	#
	# The -L list reorders the dump's TABLE DATA entries parents-first:
	# pg_dump sorts them alphabetically (identities before users,
	# game_players before games), which live FK constraints reject — and
	# --disable-triggers needs superuser, which hosted postgres is not.
	# --single-transaction: all-or-nothing, so a mid-restore failure can't
	# leave half the rows in place.
	echo "── restoring $(DUMP) → $(ENV) (data only)"
	toc=$$(mktemp)
	bash supabase/scripts/backup-toc-order.sh "$(DUMP)" > "$$toc"
	pg_restore --data-only --single-transaction -L "$$toc" -d "$$SUPABASE_DB_URL" "$(DUMP)"
	rm -f "$$toc"
	echo "── restored. The dictionary bulk is NOT in a backup:"
	echo "   run \`gmake all-words all-pangrams ENV=$(ENV)\` to finish."

# Answers "does ENV's database match the migration baselines?" — the active
# complement to db-schema's passive up-to-date NOTE. While baselines are
# edited in place (alpha), an edit that never shipped is INVISIBLE to
# `db push`; this is the target that makes the divergence a checkable fact.
#
# The shadow database is built from supabase/migrations/ alone, so everything
# supabase/sql/ manages (functions, views, policies, grants) ALWAYS appears
# in the raw diff — expected noise, not drift. The summary pulls out the
# SHAPE lines (table/index/type/constraint DDL); those are the signal.
.PHONY: db-drift
db-drift: ## report schema drift: ENV's database vs the migration baselines
	@$(PRELUDE)
	echo "── drift: $(ENV) database vs supabase/migrations/ (shadow rebuild — takes ~30s)"
	# The diff goes to a FILE, not the terminal: the sql/-managed noise runs
	# tens of KB, and the shape summary below is the actual answer. Read the
	# file when the summary flags something. When stdout isn't a tty (always
	# true in a recipe) the CLI emits one JSON envelope {"diff":"…"} with
	# progress on stderr — jq unwraps it into readable SQL.
	#
	# -R + fromjson?: the CLI occasionally puts a NON-JSON line on stdout
	# ahead of the envelope (its once-a-day update-available notice did it,
	# 2026-08-08 — a plain `jq .diff` died with parse error / exit 5 under
	# pipefail). Reading raw lines and keeping only the ones that parse as
	# JSON drops that pollution without a grep in the pipe (whose no-match
	# exit would itself trip pipefail).
	f=$$(mktemp /tmp/db-drift-$(ENV).XXXXXX)
	supabase $(SUPA_FLAGS) db diff --db-url "$$SUPABASE_DB_URL" | jq -Rr 'fromjson? | .diff // empty' > "$$f"
	echo "── full diff: $$f ($$(wc -l < "$$f" | tr -d ' ') lines; sql/-managed objects are expected noise)"
	echo "── SHAPE lines (the signal):"
	grep -inE '^[[:space:]]*(create|alter|drop)[[:space:]]+(table|index|unique index|type|sequence)' "$$f" \
	  || echo "   none — $(ENV)'s shape matches the baselines"

.PHONY: db-reset
db-reset: ## local only: db (structure + data) + the dev personas
	@[[ "$(ENV)" == "local" ]] || { echo "REFUSED: db-reset is local-only; use db + db-data for prod" >&2; exit 1; }
	$(MAKE) db ENV=local
	$(MAKE) db-seed ENV=local

# ════════════════════════════════════════════════════════════════
# Deploy
# ════════════════════════════════════════════════════════════════
# Everything here reaches production whatever ENV says — `supabase functions
# deploy` and `netlify deploy` both read a link, not a connection string. ENV
# can't route them, so it guards them instead: the deploy targets refuse
# outright unless you typed ENV=prod.
.PHONY: _require-prod
_require-prod:
ifneq ($(ENV),prod)
	@echo "REFUSED: this target needs ENV=prod — it reaches production" >&2
	echo "         whatever ENV says, so ENV must say so too." >&2
	exit 1
endif

# `functions: tries` is a CORRECTNESS edge, not a convenience: the
# boggle and scrabble functions compile their word bundles in, so
# deploying without regenerating ships a stale dictionary and nothing
# errors. --use-api bundles server-side, avoiding the ECR image pull
# (and its anonymous rate limits) plus the Docker dependency.
.PHONY: deploy-funcs
deploy-funcs: _require-prod all-tries ## deploy all edge functions (regenerates the word bundles first)
	@$(PRELUDE)
	echo "── edge functions → $(ENV)"
	supabase $(SUPA_FLAGS) functions deploy --use-api

# Which bundle a given function compiles in, if any. A LOOKUP rather than a
# `case` in the recipe, because of a GNU Make rule with teeth: a recipe
# containing `$(MAKE)` is executed even under `-n`, and with .ONESHELL that
# means the WHOLE recipe runs — so a dry run of this target would really
# deploy. Prerequisites are inert under `-n`; recipes mentioning $(MAKE) are
# not. Keep it this way.
TRIE_boggle-build-board    := $(BOGGLE_TRIE)
TRIE_scrabble-suggest-move := $(SCRABBLE_TRIE)
TRIE_scrabble-ai-move      := $(SCRABBLE_TRIE)

.SECONDEXPANSION:
# (No .PHONY here: it doesn't apply to pattern rules. It also isn't needed —
# no file named deploy-func-* ever exists, so the recipe always runs.)
deploy-func-%: _require-prod $$(TRIE_$$*) ## deploy ONE edge function by name (gmake deploy-func-waffle-build-board)
	@$(PRELUDE)
	supabase $(SUPA_FLAGS) functions deploy "$*" --use-api

.PHONY: deploy-fe
deploy-fe: ## build the FE and push to Netlify
	@[[ "$(ENV)" == "prod" ]] || { echo "REFUSED: deploy-fe targets prod only (ENV=prod)" >&2; exit 1; }
	bash supabase/deploy/fe.sh

.PHONY: deploy
# ENV=prod, or nothing happens. `gmake deploy` with the default ENV=local was
# incoherent AND destructive: db-schema took its local branch and wiped the
# local database, then deploy-funcs pushed to PRODUCTION anyway — because
# `supabase functions deploy` targets the CLI link and ignores ENV, exactly
# like `db reset --linked`. It even printed "→ local" while uploading to prod.
#
# _require-prod is a PREREQUISITE, not a line in the recipe, because a recipe
# guard fires after every prerequisite has already been built — by which point
# db-schema has done the wiping. Prerequisites are built in the order written
# (serial make), so this one refuses before anything else runs.
#
# project-link second: `db push` and `functions deploy` both go through the
# linked project, and a fresh checkout has no link. Idempotent, so the cost is
# one no-op CLI call.
deploy: _require-prod project-link db-schema-sql deploy-funcs deploy-fe ## the routine push: structure + functions + FE (NOT data)

# ════════════════════════════════════════════════════════════════
# Hosted project configuration
# ════════════════════════════════════════════════════════════════

.PHONY: project-create
project-create: ## create a NEW hosted project (costs money; no-ops if one is set)
	@bash supabase/deploy/project-create.sh

.PHONY: project-link
project-link: ## link this checkout to the hosted project
	@bash supabase/deploy/link.sh

.PHONY: project-config-api
project-config-api: ## PostgREST: exposed schemas + search path + max_rows
	@bash supabase/deploy/config-api.sh

.PHONY: project-config-auth
project-config-auth: ## auth: site URL, redirect allowlist, Resend SMTP, email template
	@bash supabase/deploy/config-auth.sh

.PHONY: project-config-secrets
project-config-secrets: ## edge-function secrets (ANTHROPIC_API_KEY)
	@bash supabase/deploy/config-secrets.sh

.PHONY: project-wait-cache
project-wait-cache: ## poll until PostgREST's schema cache reloads (needed before g-connections-puzzles)
	@bash supabase/deploy/wait-cache.sh

# Everything a fresh project needs, in order: create, link, migrate, apply
# the repeatable SQL, configure PostgREST + auth + secrets, deploy the edge
# functions, wait for the schema cache, load the data, ship the FE.
#
# MIGRATIONS=destroy WIPES the hosted database (auth accounts included)
# and replays every migration onto a clean slate. That's routine while
# baselines are still editable, and catastrophic afterwards, so it has
# no default: you type it.
MIGRATIONS ?= keep

# Its own target so that the WIPE is a plain sub-make from project-bootstrap
# rather than a raw command inside that recipe — see the -n note above
# deploy-func-%. Deliberately absent from `help`: reachable, not advertised.
#
# The ENV=prod guard is not ceremony. `supabase db reset --linked` targets the
# LINKED PROJECT and ignores SUPABASE_DB_URL entirely — so ENV, which is only
# a connection string, cannot protect this the way it protects every other
# target here. Without the explicit check, `gmake project-db-destroy` with the
# default ENV=local would cheerfully wipe production. (It happened to fail
# today on an undefined announce_target, which is not a safety mechanism.)
# _require-prod FIRST (a prerequisite, so it refuses before db-backup runs),
# then db-backup: the wipe always leaves a fresh snapshot behind. The
# in-recipe guard stays as the belt to that suspender.
.PHONY: project-db-destroy
project-db-destroy: _require-prod db-backup
	@[[ "$(ENV)" == "prod" ]] || { echo "REFUSED: project-db-destroy needs ENV=prod, typed out." >&2; exit 1; }
	$(PRELUDE)
	echo "── WIPING the hosted database (all data, auth accounts included)"
	# Typed confirmation, not a countdown: ENV=prod says which environment,
	# but wiping every auth account deserves proof you know WHICH project.
	printf 'Type the project ref shown above to confirm the wipe: '
	read -r reply || { echo "REFUSED: no confirmation (stdin closed) — nothing wiped." >&2; exit 1; }
	[[ "$$reply" == "$$PROJECT_REF" ]] || { echo "REFUSED: that isn't the project ref — nothing wiped." >&2; exit 1; }
	supabase $(SUPA_FLAGS) db reset --linked --yes --no-seed
	rm -f .make/prod/*.stamp   # same reason as db-schema: the wipe invalidates them

.PHONY: project-bootstrap
project-bootstrap: ## stand up a hosted project end to end (MIGRATIONS=keep|destroy)
	@[[ "$(ENV)" == "prod" ]] || { echo "REFUSED: project-bootstrap targets prod only (ENV=prod)" >&2; exit 1; }
	case "$(MIGRATIONS)" in
	  keep)    ;;
	  destroy) echo "!! MIGRATIONS=destroy — the hosted DB and ALL auth accounts will be WIPED"
	           echo "!! Ctrl-C within 5s to abort."; sleep 5 ;;
	  *) echo "MIGRATIONS must be keep or destroy (got '$(MIGRATIONS)')" >&2; exit 1 ;;
	esac
	$(MAKE) project-create
	$(MAKE) project-link
	if [[ "$(MIGRATIONS)" == "destroy" ]]; then
	  $(MAKE) project-db-destroy
	else
	  $(MAKE) db-schema ENV=prod
	fi
	$(MAKE) db-sql ENV=prod
	$(MAKE) project-config-api
	$(MAKE) project-config-auth
	$(MAKE) project-config-secrets
	$(MAKE) deploy-funcs ENV=prod
	$(MAKE) project-wait-cache
	$(MAKE) db-data ENV=prod
	$(MAKE) deploy-fe ENV=prod
	echo
	echo "═══ project-bootstrap complete ═══"
	echo "  Manual follow-up: verify the Resend sender domain (DNS, one-time)."

# ════════════════════════════════════════════════════════════════
# Dev loop — thin wrappers; `npm run …` remains the documented entry
# ════════════════════════════════════════════════════════════════

.PHONY: dev test test-fe test-db test-e2e dev-lint dev-types
dev:     ## vite dev server
	@npm run dev
test:    ## FE + DB tests
	@npm test
test-fe: ## vitest
	@npm run test:fe -- --run
test-db: ## pgTAP
	@npm run test:db
test-e2e: ## playwright
	@npm run test:e2e
dev-lint: ## eslint
	@npm run lint
dev-types: ## regenerate src/types/db.ts from the live local schema
	@npm run types:gen

# The screenshot gallery (docs/testing.md → The screenshot gallery) — every game in every
# interesting state, photographed into gallery/index.html for you to scroll.
#
# NOT a test, and deliberately not wired into `test` or `test-e2e`: it asserts
# nothing, so it can't pass or fail. It answers "do these fifteen games look
# like one app?", which only a person answers. Run it when you want to look.
#
# No ENV: it drives the LOCAL stack only (it creates throwaway clubs and plays
# real games), so there's no target to get wrong. Needs `npm run dev` up.
#
# A full run is minutes and hundreds of files, which is a miserable loop when
# you've changed one game — so it takes GAME and TECH:
#
#   gmake gallery                        every game, every technology
#   gmake gallery GAME=waffle            waffle: desktop, mobile and PDF
#   gmake gallery GAME=waffle TECH=pdf   waffle's printouts only
#   gmake gallery-index                  rebuild index.html, capture nothing
#
# A partial run replaces ONLY the files it regenerates; the rest of the sheet
# survives. That works because the index is built from what's on DISK, not from
# what this run did.
.PHONY: gallery
gallery: ## screenshot game states → gallery/index.html (GAME=, TECH=; needs `npm run dev`)
	@# Delete the sheet HERE, not in the script: a syntax error kills the
	# script before its own cleanup runs, and the stale index survives
	# exactly the failure it most needs to not survive.
	rm -f gallery/index.html
	npm run --silent _gallery -- $(GAME) $(TECH) || { \
	  echo ""; \
	  echo "═══ GALLERY BUILD FAILED — gallery/index.html was NOT written ═══" >&2; \
	  echo "    (deleted before the run, so there's no stale sheet to mistake" >&2; \
	  echo "     for a good one — fix the error above and run again)" >&2; \
	  exit 1; }

# Rebuild the sheet without capturing anything — for when the INDEX changed
# (a new game registered, the renderer edited) but the images didn't.
.PHONY: gallery-index
gallery-index: ## rebuild gallery/index.html from the files already on disk
	@# Delete the sheet HERE, not in the script: a syntax error kills the
	# script before its own cleanup runs, and the stale index survives
	# exactly the failure it most needs to not survive.
	rm -f gallery/index.html
	npm run --silent _gallery -- index || { \
	  echo ""; \
	  echo "═══ INDEX BUILD FAILED — gallery/index.html was NOT written ═══" >&2; \
	  echo "    (deleted before the run, so there's no stale sheet to mistake" >&2; \
	  echo "     for a good one — fix the error above and run again)" >&2; \
	  exit 1; }

# Promote the current gallery into the COMMITTED folder.
#
# `gallery/` is gitignored because every run rewrites all of it — committing
# that would be thirty changed PNGs per look, burying the one that mattered.
# This keeps the runs that are worth remembering: before/after a visual pass,
# or just "what did this look like in July".
#
# Copies the WHOLE folder, deliberately: index.html links its tiles by relative
# path, so a hand-picked subset renders a sheet of broken images.
.PHONY: gallery-keep
gallery-keep: ## copy gallery/ → gallery-keep/<date>-<NAME>/ (committed)
	@[[ -n "$(NAME)" ]] || { echo "REFUSED: pass NAME=<label>, e.g. NAME=before-mobile-pass" >&2; exit 1; }
	[[ -f gallery/index.html ]] || { echo "REFUSED: no gallery/index.html — run \`gmake gallery\` first" >&2; exit 1; }
	dest="gallery-keep/$$(date +%Y-%m-%d)-$(NAME)"
	rm -rf "$$dest"
	mkdir -p "$$dest"
	cp gallery/* "$$dest"/
	echo "── kept $$(ls "$$dest" | wc -l | tr -d ' ') files → $$dest/index.html"

# The make system's own test suite — the only part of this repo with no pgTAP
# or playwright coverage, and the part that can write to prod. It re-checks
# the two bug classes that kept recurring here (see the script's header).
# Cheap and safe: everything runs behind PATH shims, so nothing it exercises
# actually reaches a database.
.PHONY: _audit
_audit: ## check the make system itself (-n inertness, ENV leakage, guards)
	@bash supabase/scripts/audit-make.sh

# Leading underscore: an escape hatch, not part of the daily vocabulary — it
# sorts to the top of `help` and out of the way of every prefix.
.PHONY: _stamps-clean
_stamps-clean: ## forget ENV's stamps, so the next data target re-runs
	@[[ -n "$(ENV)" ]] || { echo "REFUSED: pass ENV=local or ENV=prod — with no ENV this would forget BOTH" >&2; exit 1; }
	rm -rf .make/$(ENV)
	echo "forgot the $(ENV) stamps"

# ════════════════════════════════════════════════════════════════
.PHONY: help
help: ## list every target
	@echo "puzpuzpuz — ENV=$(ENV)  (local | prod)"
	echo
	grep -hE '^[a-zA-Z0-9_%-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	echo
	echo "  ENV=local|prod is REQUIRED by anything that talks to a database."
	echo "  DEBUG=1 adds --debug to the supabase CLI; gmake --trace explains make."
	echo "  The dev loop stays on npm (npm run dev / npm test)."
	echo "  Docs: docs/cheatsheet.md · docs/supabase.md#schema-vs-code"
