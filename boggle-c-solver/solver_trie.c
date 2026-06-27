/* solver_trie.c — the IMPROVED Boggle solver.
 *
 * This is the same C language as libwords.c (the "before"), but a different
 * ALGORITHM. The whole point of this folder is to read the two side by side and
 * see that the speedup we measured (TS/AS beating the original C) was never about
 * the language — it was about the data structure and the dedup strategy. Port the
 * better algorithm back into C and C is fast again.
 *
 * =============================================================================
 * WHAT CHANGED, AND WHY
 * =============================================================================
 *
 * 1. DICTIONARY: minimised DAWG  ->  plain TRIE
 *    libwords.c reads a minimised DAWG (words.dat). A DAWG merges shared
 *    SUFFIXES, so "CARS" and "BARS" end at the SAME node (they share "ARS").
 *    That makes the DAWG tiny (288 KB) but it means a node does NOT identify a
 *    word — two different words can land on one node.
 *
 *    Here we build a plain trie from the word list. No suffix merging, so every
 *    word ends at its OWN unique node. The trie is bigger in RAM (~22 MB vs
 *    288 KB) but that unique-terminal-node property is what unlocks change #2.
 *
 * 2. DEDUP: hash table of word STRINGS  ->  generation stamp on the trie NODE
 *    A board lets you trace the same word along several tile paths, so we must
 *    dedup. libwords.c had to build the word string for every hit and dedup it
 *    in an FNV hash table (fnv1a + strcmp + a 4096-slot table). It HAD to,
 *    because on a DAWG the node can't identify the word.
 *
 *    On a trie, "same word" == "same terminal node", so dedup is just: stamp
 *    seen_gen[node] with a per-board generation counter. First time we reach a
 *    terminal node this board -> new word. Already stamped -> duplicate. No
 *    string is ever built, no hash, no strcmp. O(1), one array write.
 *
 * 3. NO WORD MATERIALISATION IN THE HOT LOOP
 *    Rejection sampling throws away ~99.98% of boards (one accept per ~5,300
 *    tries for the "11-letter word" constraint). libwords.c builds the full word
 *    list (arena strdup per word) on EVERY try, then discards it. We only need
 *    count / longest / score to test the constraints, so we compute exactly
 *    those and nothing else. Materialising the actual words is a separate cheap
 *    pass you run ONCE, on the single accepted board (see extract_words()).
 *
 * The fail-fast on max-words / max-score is kept (same as libwords.c): the
 * moment a board busts a max budget we abort its DFS — those boards are rejected
 * anyway, and bailing early never changes which words an ACCEPTED board yields.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <time.h>

/* "basic" Boggle scoring ladder, indexed by word length (8+ clamps to 11). */
static int score_for(int len) {
    static const int L[] = {0,0,0,1,1,2,3,5,11,11,11,11,11,11,11,11,11,11};
    return len <= 16 ? L[len] : 11;
}

/* ============================ TRIE ============================ */
/* Flat, struct-of-arrays trie. child[node*26 + c] is the node you reach by
 * appending letter c (0='a'..25='z'); 0 means "no such child" (node 0 is the
 * root, and nothing ever points back to the root, so 0 is an unambiguous
 * "none"). eow[node] marks a word ending. seen_gen[node] backs the dedup. */
typedef struct {
    int32_t *child;     /* cap * 26 */
    uint8_t *eow;       /* cap      */
    int32_t *seen_gen;  /* cap      */
    int      n;         /* nodes used (node 0 is the root)             */
    int      cap;       /* nodes allocated                            */
} Trie;

static void trie_grow(Trie *t, int need) {
    if (need <= t->cap) return;
    int old = t->cap;
    while (t->cap < need) t->cap *= 2;
    t->child    = realloc(t->child,    (size_t) t->cap * 26 * sizeof(int32_t));
    t->eow      = realloc(t->eow,      (size_t) t->cap * sizeof(uint8_t));
    t->seen_gen = realloc(t->seen_gen, (size_t) t->cap * sizeof(int32_t));
    /* zero the freshly added nodes: child=0 (no child), eow=0, seen_gen=0 */
    memset(t->child    + (size_t) old * 26, 0, (size_t)(t->cap - old) * 26 * sizeof(int32_t));
    memset(t->eow      + old,               0, (size_t)(t->cap - old) * sizeof(uint8_t));
    memset(t->seen_gen + old,               0, (size_t)(t->cap - old) * sizeof(int32_t));
}

/* Insert one lowercase word. Mirrors the JS/AS trie build exactly. */
static void trie_insert(Trie *t, const char *w, int len) {
    int node = 0;
    for (int i = 0; i < len; i++) {
        int c = w[i] - 'a';
        int nx = t->child[node * 26 + c];
        if (nx == 0) {
            trie_grow(t, t->n + 1);
            nx = t->n++;
            t->child[node * 26 + c] = nx;
        }
        node = nx;
    }
    t->eow[node] = 1;
}

/* Build a trie from a word-list file (one word per line; any case; words with
 * non-letters or length outside [3,15] are skipped). */
static Trie build_trie(const char *path) {
    Trie t = {0};
    t.cap = 1 << 16;
    t.child    = calloc((size_t) t.cap * 26, sizeof(int32_t));
    t.eow      = calloc((size_t) t.cap, sizeof(uint8_t));
    t.seen_gen = calloc((size_t) t.cap, sizeof(int32_t));
    t.n = 1; /* node 0 = root */

    FILE *f = fopen(path, "r");
    if (!f) { fprintf(stderr, "cannot open word list %s\n", path); exit(1); }
    char line[64]; int words = 0;
    while (fgets(line, sizeof(line), f)) {
        char w[32]; int len = 0; bool ok = true;
        for (char *p = line; *p && *p != '\n' && *p != '\r'; p++) {
            char ch = *p;
            if (ch >= 'A' && ch <= 'Z') ch += 32;          /* uppercase -> lower */
            if (ch < 'a' || ch > 'z') { ok = false; break; }
            if (len < 31) w[len++] = ch;
        }
        if (ok && len >= 3 && len <= 15) { trie_insert(&t, w, len); words++; }
    }
    fclose(f);
    fprintf(stderr, "trie: %d words, %d nodes (%.1f MB)\n",
            words, t.n, (double) t.n * 26 * 4 / 1e6);
    return t;
}

/* ========================= SOLVER ========================= */
/* Per-board state. File-scope (like the JS module globals) keeps the recursive
 * DFS tight and readable. */
static Trie  *T;
static const uint8_t *g_board;  /* 16 letter indices (0..25); 'q' for a Qu tile */
static const uint8_t *g_isqu;   /* 16 flags: 1 if this tile is "Qu"             */
static int32_t g_gen;           /* bumped once per board; stamps seen_gen        */
static int     g_used;          /* bitmask of tiles used in the current path     */
static int     g_count, g_longest, g_score;
static int     g_maxw, g_maxs;
static bool    g_busted;

/* 8-direction DFS from `cell`, sitting at trie `node` after consuming a word of
 * length `len`. Identical in shape to the AssemblyScript dfs(). */
static void dfs(int cell, int node, int len) {
    g_used |= (1 << cell);

    if (len >= 3 && T->eow[node] && T->seen_gen[node] != g_gen) {
        T->seen_gen[node] = g_gen;          /* dedup: first time this board */
        g_count++;
        g_score += score_for(len);
        if (len > g_longest) g_longest = len;
        if (g_count > g_maxw || g_score > g_maxs) {   /* fail-fast on a max */
            g_busted = true; g_used &= ~(1 << cell); return;
        }
    }

    int row = cell >> 2, col = cell & 3;
    for (int di = -1; di <= 1; di++) {
        for (int dj = -1; dj <= 1; dj++) {
            if (di == 0 && dj == 0) continue;
            int nr = row + di, nc = col + dj;
            if (nr < 0 || nr >= 4 || nc < 0 || nc >= 4) continue;
            int ncell = nr * 4 + nc;
            if (g_used & (1 << ncell)) continue;
            int nx = T->child[node * 26 + g_board[ncell]];
            if (nx == 0) continue;
            if (g_isqu[ncell]) {                 /* Qu tile: take 'q' then 'u' */
                nx = T->child[nx * 26 + ('u' - 'a')];
                if (nx == 0) continue;
                dfs(ncell, nx, len + 2);
            } else {
                dfs(ncell, nx, len + 1);
            }
            if (g_busted) { g_used &= ~(1 << cell); return; }
        }
    }
    g_used &= ~(1 << cell);
}

/* Solve one board; return true iff it meets every constraint. */
static bool solve_accept(const uint8_t *board, const uint8_t *isqu,
                         int minw, int maxw, int mins, int maxs, int minl) {
    g_board = board; g_isqu = isqu; g_maxw = maxw; g_maxs = maxs;
    g_gen++; g_used = 0; g_count = 0; g_longest = 0; g_score = 0; g_busted = false;
    for (int cell = 0; cell < 16; cell++) {
        int nx = T->child[g_board[cell]];        /* root row: child[letter] */
        if (nx == 0) continue;
        if (g_isqu[cell]) {
            nx = T->child[nx * 26 + ('u' - 'a')];
            if (nx == 0) continue;
            dfs(cell, nx, 2);
        } else {
            dfs(cell, nx, 1);
        }
        if (g_busted) return false;
    }
    return g_count >= minw && g_score >= mins && g_longest >= minl;
}

/* ========================= BENCH ========================= */
/* Read the fixed board stream (one 16-char board per line, 'A'-'Z' or '1'=Qu)
 * into parallel letter/qu byte arrays so file IO stays out of the timed loop. */
static int load_boards(const char *path, uint8_t **out_let, uint8_t **out_qu) {
    FILE *f = fopen(path, "r");
    if (!f) { fprintf(stderr, "cannot open boards %s\n", path); exit(1); }
    int cap = 1 << 16, n = 0;
    uint8_t *let = malloc((size_t) cap * 16), *qu = malloc((size_t) cap * 16);
    char line[64];
    while (fgets(line, sizeof(line), f)) {
        if (strlen(line) < 16) continue;
        if (n >= cap) { cap *= 2; let = realloc(let, (size_t) cap * 16); qu = realloc(qu, (size_t) cap * 16); }
        for (int c = 0; c < 16; c++) {
            char ch = line[c];
            if (ch == '1') { let[n * 16 + c] = 'q' - 'a'; qu[n * 16 + c] = 1; }
            else { let[n * 16 + c] = (ch | 32) - 'a'; qu[n * 16 + c] = 0; }
        }
        n++;
    }
    fclose(f);
    *out_let = let; *out_qu = qu;
    return n;
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "usage: %s <wordlist> <boards_stream>\n", argv[0]); return 1; }
    Trie t = build_trie(argv[1]); T = &t;
    uint8_t *let, *qu; int nb = load_boards(argv[2], &let, &qu);
    fprintf(stderr, "boards: %d\n", nb);

    const int TARGET = 100, REPEATS = 5;
    const int minw = 30, maxw = 300, mins = 40, maxs = 500, minl = 11;

    /* warmup so the page faults / caches aren't charged to run 1 */
    for (int i = 0; i < 5000 && i < nb; i++)
        solve_accept(let + i * 16, qu + i * 16, minw, maxw, mins, maxs, minl);

    double best = 1e9; long solves = 0, sumW = 0, sumL = 0, sumS = 0; int accepted = 0;
    for (int rep = 0; rep < REPEATS; rep++) {
        solves = 0; sumW = 0; sumL = 0; sumS = 0; accepted = 0;
        struct timespec a, b;
        clock_gettime(CLOCK_MONOTONIC, &a);
        for (int k = 0; k < nb && accepted < TARGET; k++) {
            solves++;
            if (solve_accept(let + k * 16, qu + k * 16, minw, maxw, mins, maxs, minl)) {
                accepted++; sumW += g_count; sumL += g_longest; sumS += g_score;
            }
        }
        clock_gettime(CLOCK_MONOTONIC, &b);
        double dt = (b.tv_sec - a.tv_sec) + (b.tv_nsec - a.tv_nsec) / 1e9;
        if (dt < best) best = dt;
    }

    printf("solves=%ld accepted=%d sumWords=%ld sumLongest=%ld sumScore=%ld\n",
           solves, accepted, sumW, sumL, sumS);
    printf("best_time=%.4fs solves/sec=%.0f ms/board=%.2f\n",
           best, solves / best, best / accepted * 1000.0);
    return 0;
}
