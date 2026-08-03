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
# ENV=local (default) or ENV=prod. Prod is never inferred — you type it,
# and every writing target echoes its resolved target first.

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
ENV ?= local
LOCAL_DB_URL := postgresql://postgres:postgres@127.0.0.1:54322/postgres

ifeq ($(ENV),local)
  # Plain export: the local stack needs no secrets and no discovery.
  PRELUDE := export SUPABASE_DB_URL=$(LOCAL_DB_URL)
else ifeq ($(ENV),prod)
  # The sourced prelude does secrets, project discovery, key fetch and
  # the connection string. See supabase/deploy/env.sh.
  PRELUDE := . supabase/deploy/env.sh; require_project; derive_db_url; fetch_api_keys
else
  $(error ENV must be `local` or `prod` (got `$(ENV)`))
endif

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

# Board generation knobs (gmake stackdown-boards COUNT=50 BAND=2)
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
# `gmake stamps-clean` forgets everything. Per-ENV, because "loaded to
# local" says nothing about prod. The failure mode is a needless
# re-import (a couple of minutes), never corruption — which is the only
# reason stamps are acceptable here at all.
STAMPS := .make/$(ENV)
.make/local .make/prod:
	@mkdir -p $@

# ════════════════════════════════════════════════════════════════
# Data + assets
# ════════════════════════════════════════════════════════════════

.PHONY: words
words: $(STAMPS)/words.stamp ## import common.words from the gamelist working copy
$(STAMPS)/words.stamp: $(WORDS_SRC) | $(STAMPS)

	@$(PRELUDE)
	echo "── words → $(ENV)"
	npm run words:import
	touch $@
	echo
	echo "  NOTE: the committed stackdown boards were built against the OLD"
	echo "  word list. They are not broken — still solvable, still real words —"
	echo "  but they may hold words this list would no longer choose."
	echo "  Run \`gmake stackdown-audit\` to see the size of it; rebuilding is"
	echo "  slow and often not worth it. Your call."

.PHONY: spellingbee-pangrams
spellingbee-pangrams: $(STAMPS)/spellingbee-pangrams.stamp ## rebuild the spellingbee board-seed pool
$(STAMPS)/spellingbee-pangrams.stamp: $(STAMPS)/words.stamp
	@$(PRELUDE)
	npm run spellingbee:import
	touch $@

.PHONY: wordwheel-pangrams
wordwheel-pangrams: $(STAMPS)/wordwheel-pangrams.stamp ## rebuild the wordwheel board-seed pool
$(STAMPS)/wordwheel-pangrams.stamp: $(STAMPS)/words.stamp
	@$(PRELUDE)
	npm run wordwheel:import
	touch $@

.PHONY: pangrams
pangrams: spellingbee-pangrams wordwheel-pangrams ## both seed pools

# The two edge-function dictionaries. Real files, but derived from a
# DATABASE — so the stamp, not the .ts, is the prerequisite. They're
# gitignored build artifacts, and their functions won't compile without
# them, which is why `functions` depends on them.
#
# ALWAYS BUILT FROM LOCAL, whatever ENV says — note the hardcoded
# .make/local stamp and the pinned URL. The bundles are derived from the
# canonical dictionary (words.tsv → local common.words), and during a
# fresh bootstrap the hosted common.words isn't loaded until step 8,
# several steps after the functions deploy. Depending on the per-ENV
# stamp would make `gmake functions ENV=prod` try to import 283k words
# INTO PROD first, which is neither wanted nor implied.
.PHONY: boggle-trie
boggle-trie: $(BOGGLE_TRIE) ## bundle boggle's solver dictionary (from LOCAL common.words)
$(BOGGLE_TRIE): .make/local/words.stamp
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run boggle:wordlist

.PHONY: scrabble-trie
scrabble-trie: $(SCRABBLE_TRIE) ## bundle the scrabble AI's dictionary (from LOCAL common.words)
$(SCRABBLE_TRIE): .make/local/words.stamp
	@SUPABASE_DB_URL=$(LOCAL_DB_URL) npm run scrabble:wordlist

.PHONY: tries
tries: boggle-trie scrabble-trie ## both edge-function word bundles

# stackdown-boards APPENDS (it adds COUNT boards and dedups by word-set;
# it does not rebuild), so it must never be a timestamp-driven rule —
# that would grow the library every time the generator was touched. It's
# .PHONY and explicit. The FILE rule below has no prerequisites, so make
# builds it only when it's actually missing, which is the
# generate-if-absent behaviour `stackdown-upload` wants.
.PHONY: stackdown-boards
stackdown-boards: $(STAMPS)/words.stamp ## generate COUNT=n BAND=b boards (APPENDS to the library)
	@$(PRELUDE)
	echo "── generating $(COUNT) band-$(BAND) board(s), seed $(SEED) (appending)"
	npm run stackdown:gen -- $(COUNT) $(SEED) $(BAND)

$(STACKDOWN_JSONL):
	@echo "── $(STACKDOWN_JSONL) is missing (fresh clone?) — generating a starter set"
	$(MAKE) stackdown-boards COUNT=25 BAND=1
	$(MAKE) stackdown-boards COUNT=25 BAND=2

.PHONY: stackdown-upload
stackdown-upload: $(STACKDOWN_JSONL) ## delete + reload stackdown.boards (generates the library iff missing)
	@$(PRELUDE)
	echo "── stackdown.boards → $(ENV)"
	npm run stackdown:import

.PHONY: stackdown-audit
stackdown-audit: ## report boards holding words the CURRENT dictionary wouldn't choose
	@$(PRELUDE)
	npx tsx supabase/scripts/audit-stackdown-boards.ts || \
	  echo "(informational — those boards still play fine; rebuilding is your call)"

.PHONY: connections-puzzles
connections-puzzles: ## import the NYT Connections archive (remote source, incremental)
	@$(PRELUDE)
	echo "── connections.puzzles → $(ENV)"
	npm run connections:import

.PHONY: crosswords-puzzles
crosswords-puzzles: ## import supabase/data/crosswords/*.puz|.ipuz
	@$(PRELUDE)
	echo "── crosswords.puzzles → $(ENV)"
	npm run crosswords:import

.PHONY: db-data
db-data: words pangrams stackdown-upload connections-puzzles crosswords-puzzles ## load every table's DATA (no schema, no code)

# ════════════════════════════════════════════════════════════════
# Schema + code   (docs/supabase.md → Schema vs code)
# ════════════════════════════════════════════════════════════════

.PHONY: schema
schema: ## apply the SHAPE half — migrations (local: reset; prod: push)
	@$(PRELUDE)
ifeq ($(ENV),local)
	supabase db reset
else
	echo "── db push → $(PROJECT_REF)"
	supabase db push --linked <<< y
endif

.PHONY: sql
sql: ## re-apply the CODE half — supabase/sql/*.sql (functions, views, policies, grants)
	@$(PRELUDE)
ifeq ($(ENV),local)
	npm run sql:apply
else
	npm run sql:apply -- --require-url
endif

.PHONY: db
db: schema sql ## schema + code

.PHONY: seed
seed: ## local only: the dev personas + clubs (seed.dev.sql)
	@npm run seed

.PHONY: reset
reset: ## local only: db + all data + dev seed (what `npm run db:reset` does)
	@[[ "$(ENV)" == "local" ]] || { echo "reset is local-only; use db + db-data for prod" >&2; exit 1; }
	$(MAKE) db ENV=local
	$(MAKE) db-data ENV=local
	$(MAKE) seed

# ════════════════════════════════════════════════════════════════
# Deploy
# ════════════════════════════════════════════════════════════════

# `functions: tries` is a CORRECTNESS edge, not a convenience: the
# boggle and scrabble functions compile their word bundles in, so
# deploying without regenerating ships a stale dictionary and nothing
# errors. --use-api bundles server-side, avoiding the ECR image pull
# (and its anonymous rate limits) plus the Docker dependency.
.PHONY: functions
functions: tries ## deploy all edge functions (regenerates the word bundles first)
	@$(PRELUDE)
	echo "── edge functions → $(ENV)"
	supabase functions deploy --use-api

.PHONY: function-%
function-%: ## deploy ONE edge function by name (gmake function-waffle-build-board)
	@$(PRELUDE)
	case "$*" in
	  boggle-build-board)     $(MAKE) boggle-trie ;;
	  scrabble-suggest-move|scrabble-ai-move) $(MAKE) scrabble-trie ;;
	esac
	supabase functions deploy "$*" --use-api

.PHONY: fe
fe: ## build the FE and push to Netlify
	@[[ "$(ENV)" == "prod" ]] || { echo "fe targets prod only (ENV=prod)" >&2; exit 1; }
	bash supabase/deploy/fe.sh

.PHONY: deploy
deploy: schema sql functions fe ## the routine push: schema + code + functions + FE (NOT data)

# ════════════════════════════════════════════════════════════════
# Hosted project configuration
# ════════════════════════════════════════════════════════════════

.PHONY: project-create
project-create: ## create a NEW hosted project (costs money; no-ops if one is set)
	@bash supabase/deploy/project-create.sh

.PHONY: link
link: ## link this checkout to the hosted project
	@bash supabase/deploy/link.sh

.PHONY: config-api
config-api: ## PostgREST: exposed schemas + search path + max_rows
	@bash supabase/deploy/config-api.sh

.PHONY: config-auth
config-auth: ## auth: site URL, redirect allowlist, Resend SMTP, email template
	@bash supabase/deploy/config-auth.sh

.PHONY: config-secrets
config-secrets: ## edge-function secrets (ANTHROPIC_API_KEY)
	@bash supabase/deploy/config-secrets.sh

.PHONY: wait-cache
wait-cache: ## pause for PostgREST's schema-cache reload (needed before connections-puzzles)
	@bash supabase/deploy/wait-cache.sh

# Everything, in the order a fresh project needs it — what
# import-to-hosted.sh used to be, end to end.
#
# MIGRATIONS=destroy WIPES the hosted database (auth accounts included)
# and replays every migration onto a clean slate. That's routine while
# baselines are still editable, and catastrophic afterwards, so it has
# no default: you type it.
MIGRATIONS ?= keep

.PHONY: bootstrap
bootstrap: ## stand up a hosted project end to end (MIGRATIONS=keep|destroy)
	@[[ "$(ENV)" == "prod" ]] || { echo "bootstrap targets prod only (ENV=prod)" >&2; exit 1; }
	case "$(MIGRATIONS)" in
	  keep)    ;;
	  destroy) echo "!! MIGRATIONS=destroy — the hosted DB and ALL auth accounts will be WIPED"
	           echo "!! Ctrl-C within 5s to abort."; sleep 5 ;;
	  *) echo "MIGRATIONS must be keep or destroy (got '$(MIGRATIONS)')" >&2; exit 1 ;;
	esac
	$(MAKE) project-create
	$(MAKE) link
	if [[ "$(MIGRATIONS)" == "destroy" ]]; then
	  . supabase/deploy/env.sh; require_project
	  supabase db reset --linked --yes --no-seed
	else
	  $(MAKE) schema ENV=prod
	fi
	$(MAKE) sql ENV=prod
	$(MAKE) config-api
	$(MAKE) config-auth
	$(MAKE) config-secrets
	$(MAKE) functions ENV=prod
	$(MAKE) wait-cache
	$(MAKE) db-data ENV=prod
	$(MAKE) fe ENV=prod
	echo
	echo "═══ bootstrap complete ═══"
	echo "  Manual follow-up: verify the Resend sender domain (DNS, one-time)."

# ════════════════════════════════════════════════════════════════
# Dev loop — thin wrappers; `npm run …` remains the documented entry
# ════════════════════════════════════════════════════════════════

.PHONY: dev test test-fe test-db test-e2e lint types
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
lint:    ## eslint
	@npm run lint
types:   ## regenerate src/types/db.ts from the live local schema
	@npm run types:gen

.PHONY: stamps-clean
stamps-clean: ## forget every stamp, so the next data target re-runs
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
	echo "  The dev loop stays on npm (npm run dev / npm test)."
	echo "  Docs: docs/cheatsheet.md · docs/supabase.md#schema-vs-code"
