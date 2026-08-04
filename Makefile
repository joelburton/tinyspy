# ════════════════════════════════════════════════════════════════
# puzpuzpuz — build, data, and deploy targets
# ════════════════════════════════════════════════════════════════
# `gmake help` lists everything. The spec behind this file is
# docs/make-plan.md; the durable parts live in docs/cheatsheet.md.
#
# WHAT THIS IS FOR: npm scripts can't express a dependency, so today's
# alternatives are an all-or-nothing chain (`npm run deploy`) or nothing.
# This file owns EDGES and ENVIRONMENT; every recipe shells out to the
# npm script or deploy step that already exists. Nothing is
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
  # the connection string. See supabase/deploy/env.sh.
  PRELUDE := . supabase/deploy/env.sh; require_project; derive_db_url; fetch_api_keys
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
	  . supabase/deploy/env.sh; require_project; derive_db_url
	else
	  # Fail CLOSED. With no ENV, $(STAMPS) is `.make/` and $* comes out
	  # empty — an `else` that meant "prod" would have made a bare
	  # `gmake all-words` import 283k rows into production.
	  echo "REFUSED: unknown stamp env '$*' — pass ENV=local or ENV=prod" >&2; exit 1
	fi
	echo "── all-words → $*"
	npm run words:import
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
	elif [ "$*" = "prod" ]; then . supabase/deploy/env.sh; require_project; derive_db_url
	else echo "REFUSED: unknown stamp env '$*'" >&2; exit 1; fi
	npm run spellingbee:import
	touch $@

.PHONY: g-wordwheel-pangrams
g-wordwheel-pangrams: $(STAMPS)/wordwheel-pangrams.stamp ## rebuild the wordwheel board-seed pool
.make/%/wordwheel-pangrams.stamp: .make/%/words.stamp
	@if [ "$*" = "local" ]; then export SUPABASE_DB_URL=$(LOCAL_DB_URL)
	elif [ "$*" = "prod" ]; then . supabase/deploy/env.sh; require_project; derive_db_url
	else echo "REFUSED: unknown stamp env '$*'" >&2; exit 1; fi
	npm run wordwheel:import
	touch $@

.PHONY: all-pangrams
all-pangrams: g-spellingbee-pangrams g-wordwheel-pangrams ## both seed pools

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
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run boggle:wordlist

.PHONY: g-scrabble-trie
g-scrabble-trie: $(SCRABBLE_TRIE) ## bundle the scrabble AI's dictionary (from LOCAL common.words)
$(SCRABBLE_TRIE): .make/local/words.stamp
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run scrabble:wordlist

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
	SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run stackdown:gen -- $(COUNT) $(SEED) $(BAND)

$(STACKDOWN_JSONL):
	@echo "── $(STACKDOWN_JSONL) is missing (fresh clone?) — generating a starter set"
	$(MAKE) g-stackdown-genpuzzles COUNT=25 BAND=1
	$(MAKE) g-stackdown-genpuzzles COUNT=25 BAND=2

.PHONY: g-stackdown-puzzles
g-stackdown-puzzles: $(STACKDOWN_JSONL) ## delete + reload stackdown.boards (generates the library iff missing)
	@$(PRELUDE)
	echo "── stackdown.boards → $(ENV)"
	npm run stackdown:import

.PHONY: g-stackdown-audit
g-stackdown-audit: ## report boards holding words the CURRENT dictionary wouldn't choose
	@$(PRELUDE)
	npx tsx supabase/scripts/audit-stackdown-boards.ts || \
	  echo "(informational — those boards still play fine; rebuilding is your call)"

.PHONY: g-connections-puzzles
g-connections-puzzles: ## import the NYT Connections archive (remote source, incremental)
	@$(PRELUDE)
	echo "── connections.puzzles → $(ENV)"
	npm run connections:import

.PHONY: g-crosswords-puzzles
g-crosswords-puzzles: ## import supabase/data/crosswords/*.puz|.ipuz
	@$(PRELUDE)
	echo "── crosswords.puzzles → $(ENV)"
	npm run crosswords:import

.PHONY: db-data
db-data: all-words all-pangrams g-stackdown-puzzles g-connections-puzzles g-crosswords-puzzles ## load every table's DATA (no schema, no code)

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
else
	echo "── db push → $(PROJECT_REF)"
	supabase $(SUPA_FLAGS) db push --linked <<< y
endif

.PHONY: db-sql
db-sql: ## re-apply the CODE half — supabase/sql/*.sql (functions, views, policies, grants)
	@$(PRELUDE)
ifeq ($(ENV),local)
	npm run sql:apply
else
	npm run sql:apply -- --require-url
endif

.PHONY: db
db: db-schema db-sql ## the whole database definition: migrations, then supabase/sql/

# Pinned to LOCAL rather than merely documented as local-only: seeding the
# dev personas into a real database would be a mess to unpick, and an
# exported SUPABASE_DB_URL in the caller's shell is all it would take.
.PHONY: db-seed
db-seed: ## local only: the dev personas + clubs (seed.dev.sql)
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run seed

# An interactive shell on whichever database ENV names — the thing you reach
# for when a target did something surprising. SQL="..." runs one statement and
# exits instead. It announces the target first: `gmake db-psql ENV=prod` is a
# prompt on the friends' real data, and which one you're typing into should
# never be a guess.
.PHONY: db-psql
db-psql: ## psql on ENV's database — SQL="select 1" to run one statement
	@$(PRELUDE)
	echo "── psql → $(ENV)"
	[[ "$(ENV)" == "local" ]] || announce_target
	psql "$$SUPABASE_DB_URL" $(if $(SQL),-c "$(SQL)",)

.PHONY: db-reset
db-reset: ## local only: db + all data + dev seed (what `npm run db:reset` does)
	@[[ "$(ENV)" == "local" ]] || { echo "REFUSED: db-reset is local-only; use db + db-data for prod" >&2; exit 1; }
	$(MAKE) db ENV=local
	$(MAKE) db-data ENV=local
	$(MAKE) db-seed

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
	@echo "REFUSED: deploy targets need ENV=prod — they reach production" >&2
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
.PHONY: deploy-func-%
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
deploy: _require-prod project-link db-schema db-sql deploy-funcs deploy-fe ## the routine push: schema + code + functions + FE (NOT data)

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
project-wait-cache: ## pause for PostgREST's schema-cache reload (needed before g-connections-puzzles)
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
.PHONY: project-db-destroy
project-db-destroy:
	@[[ "$(ENV)" == "prod" ]] || { echo "REFUSED: project-db-destroy needs ENV=prod, typed out." >&2; exit 1; }
	$(PRELUDE)
	echo "── WIPING the hosted database (all data, auth accounts included)"
	announce_target
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
_stamps-clean: ## forget every stamp, so the next data target re-runs
	@rm -rf .make/$(ENV)
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
