/* dump_fixture.c — golden-fixture generator for the TS solver's parity test.
 *
 * Reuses the original, battle-tested wsboggle solver (libwords.c) as the oracle:
 * it is size-general (up to 6×6 via a 64-bit used mask) and handles multiface
 * tiles (Qu/In/Th/Er/He). For every board on stdin's file it prints one line
 *   <num_words>\t<longest>\t<score>
 * computed by a FULL enumeration (permissive min/max so nothing fail-fasts),
 * min word length 3, "basic" scoring ladder. Board side length N is inferred
 * from each line's length (N = sqrt(len)); chars are 'A'-'Z' or a digit
 * '1'-'5' for a multiface tile (same encoding libwords.c's make_dice uses).
 *
 *   cc -O2 -I ../../wsboggle/c -o dump_fixture dump_fixture.c -lm
 *   ./dump_fixture <dawg> <boards.txt> > tuples.tsv
 */
#include "libwords.c"
#include <math.h>

static int basic_ladder[18] = {0,0,0,1,1,2,3,5,11,11,11,11,11,11,11,11,11,11};

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "usage: %s <dawg> <boards>\n", argv[0]); return 1; }
    read_dawg(argv[1]);
    FILE *f = fopen(argv[2], "r");
    if (!f) { fprintf(stderr, "cannot open %s\n", argv[2]); return 1; }

    char line[256];
    while (fgets(line, sizeof line, f)) {
        int len = 0;
        while (line[len] && line[len] != '\n' && line[len] != '\r') len++;
        if (len == 0) continue;
        int n = (int) (sqrt((double) len) + 0.5);
        if (n * n != len) { fprintf(stderr, "non-square board len %d\n", len); return 1; }

        Board *b = make_board(NULL, basic_ladder, n, n,
                              0, -1, 0, -1, 0, -1, /*min_legal*/3);
        for (int i = 0; i < len; i++) {
            short face = (unsigned char) line[i];
            if (face >= '0' && face <= '9') face = MULTIFACE_DICE[face - '0'];
            b->dice[i] = face;
        }
        find_all_words(b);
        printf("%d\t%d\t%d\n", b->num_words, b->longest, b->score);
        free_words(NULL, NULL, b);
    }
    fclose(f);
    return 0;
}
