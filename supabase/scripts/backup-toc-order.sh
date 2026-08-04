#!/usr/bin/env bash
# Emit a `pg_restore -L` list for a db-backup dump, with the TABLE DATA
# entries reordered parents-first.
#
# Why: pg_dump sorts data sections ALPHABETICALLY, not by FK dependency —
# auth.identities before auth.users, common.game_players before
# common.games — so a data-only restore into a schema with live FK
# constraints fails on the first child-before-parent table. The usual
# escape hatch, --disable-triggers, needs superuser, which the hosted
# `postgres` role is not. Reordering the TOC needs no privileges at all.
#
# Ranks, not a topological sort: the FK graph is small and stable (see the
# BACKUP_* notes in the Makefile). Everything the ranks don't name sorts
# after the things they do, which is correct for every leaf table
# (players / guesses / cells / found_words / … all point at a games table
# or at common.profiles).
#
# Usage: backup-toc-order.sh <dump-file>   (list on stdout)

set -euo pipefail
dump="$1"

toc=$(pg_restore -l "$dump")

# Non-data entries first, in their original order. Under --data-only,
# pg_restore ignores the definition entries anyway; SEQUENCE SET lines land
# here too, and a setval before the COPYs is harmless. Auth sequences are
# dropped: we don't restore the tables they serve (see below), and gotrue's
# schema drifts between hosted and the local CLI, so a setval could name a
# sequence the target doesn't have.
grep -v ' TABLE DATA ' <<< "$toc" | grep -v ' SEQUENCE SET auth '

# Then the data entries, parents before children. Line shape:
#   217; 1259 17538 TABLE DATA common games postgres
# so $6 is the schema and $7 the table. NR is the tiebreak, keeping the
# original (alphabetical) order within a rank.
awk '
  # The ACCOUNTS are auth.users + auth.identities; every other auth table
  # is ephemera (sessions, tokens, MFA) or belongs to gotrue features we
  # do not use. Dropping them here — not just at dump time — matters for
  # version skew: gotrue grows tables over time, and a COPY into a table
  # the target does not have fails even with zero rows.
  / TABLE DATA auth / && $7 != "users" && $7 != "identities" { next }
  function rank(s, t) {
    if (s == "auth")   return t == "users" ? 0 : 1
    if (s == "common") {
      if (t == "profiles") return 10
      if (t == "clubs")    return 11
      if (t == "clubs_gametypes" || t == "clubs_members") return 12
      if (t == "games")    return 13
      return 14
    }
    # Board/puzzle libraries that game rows FK into (puzzle_id, board_id).
    if (t == "puzzles" || (s == "stackdown" && t == "boards")) return 15
    # Each game schema`s games table references common.games.
    if (t == "games") return 20
    return 30
  }
  / TABLE DATA / { printf "%02d %06d %s\n", rank($6, $7), NR, $0 }
' <<< "$toc" | sort -n -k1,1 -k2,2 | cut -d' ' -f3-
