-- cs-unmet

-- ============================================================
-- strands: the board and the words are stored lowercase
-- ============================================================
-- Every other word game keeps its words lowercase and draws the capitals
-- (plans/seat-view.md → How a game converts, step 10: one case, the data's);
-- strands stored its letters and words as the NYT feed ships them, in
-- capitals. This brings the stored data to lowercase: each puzzle's and each
-- game's board and solution words, and every traced word in the log. The
-- puzzle's title keeps its case: it is the theme prompt, drawn as written.
-- The importer lowercases on the way in from now on.
--
-- A solution is `{spangram: {word, coords}, themeWords: [{word, coords}, …]}`,
-- rebuilt key by key so only the words change; a solution carrying any other
-- key stops the migration rather than losing it.
--
-- The page blobs are rebuilt by hand after the deploy (`select
-- strands._rebuild_data_cols_for_all()`), since a migration cannot call what
-- `supabase/sql/` defines.

create function pg_temp.lower_solution(s jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'spangram', jsonb_build_object(
      'word',   lower(s->'spangram'->>'word'),
      'coords', s->'spangram'->'coords'),
    'themeWords', (
      select jsonb_agg(jsonb_build_object(
               'word',   lower(t->>'word'),
               'coords', t->'coords') order by o)
        from jsonb_array_elements(s->'themeWords') with ordinality as x(t, o)));
$$;

do $$
declare n bigint;
begin
  select count(*) into n
    from (select solution from strands.puzzles
          union all
          select solution from strands.games) s
   where s.solution - 'spangram' - 'themeWords' <> '{}'::jsonb
      or (s.solution->'spangram') - 'word' - 'coords' <> '{}'::jsonb
      or exists (select 1 from jsonb_array_elements(s.solution->'themeWords') t
                  where t - 'word' - 'coords' <> '{}'::jsonb);
  if n > 0 then
    raise exception 'strands: % solution(s) carry a key this migration would drop', n;
  end if;
end $$;

update strands.puzzles
   set board = string_to_array(lower(array_to_string(board, ',')), ','),
       solution = pg_temp.lower_solution(solution);

update strands.games
   set board = string_to_array(lower(array_to_string(board, ',')), ','),
       solution = pg_temp.lower_solution(solution);

update strands.events
   set word = lower(word)
 where word is not null and word <> lower(word);
