/* C + C->WASM generation driver. Reuses wsboggle's libwords.c, including its
 * native max-words/max-score fail-fast: find_all_words() returns true iff a
 * board meets ALL constraints (max enforced via ADD_FAIL mid-DFS; min/longest
 * checked after). We loop a FIXED board stream until 100 boards are accepted.
 *
 * Cross-check outputs (must be identical across C, TS, C-wasm, TS-wasm):
 *   solves      = boards scanned to reach the 100th accept
 *   accepted    = 100
 *   sumWords/sumLongest/sumScore over the accepted boards (order-independent)
 */
#include "libwords.c"
#include <time.h>

static int basic_ladder[18] = {0,0,0,1,1,2,3,5,11,11,11,11,11,11,11,11,11,11};

#define MAXB 900000
static char boards[MAXB][20];

int main(int argc, char **argv) {
    read_dawg(argv[1]);
    const int TARGET = 100, REPEATS = 5;
    const int minW = 30, maxW = 300, minS = 40, maxS = 500, minL = 11;

    FILE *f = fopen(argv[2], "r");
    if (!f) { fprintf(stderr, "cannot open %s\n", argv[2]); return 1; }
    int nb = 0;
    while (nb < MAXB && fgets(boards[nb], sizeof(boards[0]), f)) {
        char *nl = strchr(boards[nb], '\n'); if (nl) *nl = '\0';
        if (strlen(boards[nb]) >= 16) nb++;
    }
    fclose(f);

    char *dummy_set[36] = {0};
    Board *b = make_board(dummy_set, basic_ladder, 4, 4,
                          minW, maxW, minS, maxS, minL, -1, /*min_legal*/3);

    double best = 1e9;
    long solves = 0, sumW = 0, sumL = 0, sumS = 0; int accepted = 0;
    for (int rep = 0; rep < REPEATS; rep++) {
        solves = 0; sumW = 0; sumL = 0; sumS = 0; accepted = 0;
        struct timespec t0, t1;
        clock_gettime(CLOCK_MONOTONIC, &t0);
        for (int k = 0; k < nb && accepted < TARGET; k++) {
            const char *s = boards[k];
            for (int i = 0; i < 16; i++) {
                short face = (unsigned char) s[i];
                if (face >= '0' && face <= '9') face = MULTIFACE_DICE[face - '0'];
                b->dice[i] = face;
            }
            solves++;
            if (find_all_words(b)) {            /* accepted: meets all constraints */
                accepted++;
                sumW += b->num_words; sumL += b->longest; sumS += b->score;
            }
        }
        clock_gettime(CLOCK_MONOTONIC, &t1);
        double dt = (t1.tv_sec - t0.tv_sec) + (t1.tv_nsec - t0.tv_nsec) / 1e9;
        if (dt < best) best = dt;
    }
    printf("solves=%ld accepted=%d sumWords=%ld sumLongest=%ld sumScore=%ld\n",
           solves, accepted, sumW, sumL, sumS);
    printf("best_time=%.4fs solves/sec=%.0f ms/board=%.2f\n",
           best, solves / best, best / accepted * 1000.0);
    return 0;
}
