# Build the two C benchmarks. See README.md for how to generate the inputs
# (a word list + a fixed board stream) and the measured results.
#
#   make                      # build both
#   make run-before           # original DAWG + hash-dedup solver (libwords.c)
#   make run-after            # improved trie + node-stamp solver (solver_trie.c)
#
# Inputs default to the /tmp files the exploration harness produced; override:
#   make run-after WORDS=mywords.txt BOARDS=myboards.txt

WORDS  ?= /tmp/req_sorted.txt
BOARDS ?= /tmp/boards_stream.txt
DAWG   ?= /tmp/required.dat

# bench_before.c does #include "libwords.c", so it needs no extra sources.
CFLAGS = -O2 -Wall

.PHONY: all run-before run-after clean

all: bench_before solver_trie

bench_before: bench_before.c libwords.c
	$(CC) $(CFLAGS) -o $@ bench_before.c

solver_trie: solver_trie.c
	$(CC) $(CFLAGS) -o $@ solver_trie.c

run-before: bench_before
	./bench_before $(DAWG) $(BOARDS)

run-after: solver_trie
	./solver_trie $(WORDS) $(BOARDS)

clean:
	rm -f bench_before solver_trie
