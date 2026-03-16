-- Player interactions: toggle switches and doors via RPC.
-- Allows authenticated players to toggle switches/doors without
-- full write access to the encounter.

-- ═══════════════════════════════════════════════════
-- Toggle a switch and its linked lights
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION toggle_encounter_switch(
  p_encounter_id uuid,
  p_switch_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_switches jsonb;
  v_lights jsonb;
  v_new_on boolean;
  v_light_ids jsonb;
  v_i int;
  v_j int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT data INTO v_data FROM encounters WHERE id = p_encounter_id;
  IF v_data IS NULL THEN RETURN false; END IF;

  v_switches := COALESCE(v_data->'switches', '[]'::jsonb);
  v_lights := COALESCE(v_data->'lights', '[]'::jsonb);

  FOR v_i IN 0..jsonb_array_length(v_switches) - 1 LOOP
    IF v_switches->v_i->>'id' = p_switch_id THEN
      -- Toggle switch
      v_new_on := NOT COALESCE((v_switches->v_i->>'on')::boolean, true);
      v_light_ids := COALESCE(v_switches->v_i->'lightIds', '[]'::jsonb);
      v_switches := jsonb_set(v_switches, ARRAY[v_i::text, 'on'], to_jsonb(v_new_on));

      -- Toggle linked lights
      FOR v_j IN 0..jsonb_array_length(v_lights) - 1 LOOP
        IF v_light_ids @> to_jsonb(v_lights->v_j->>'id') THEN
          v_lights := jsonb_set(v_lights, ARRAY[v_j::text, 'on'], to_jsonb(v_new_on));
        END IF;
      END LOOP;

      -- Persist
      v_data := v_data || jsonb_build_object('switches', v_switches, 'lights', v_lights);
      UPDATE encounters SET data = v_data WHERE id = p_encounter_id;
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- ═══════════════════════════════════════════════════
-- Toggle a door or window open/closed
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION toggle_encounter_door(
  p_encounter_id uuid,
  p_x1 numeric,
  p_y1 numeric,
  p_x2 numeric,
  p_y2 numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_walls jsonb;
  v_wall jsonb;
  v_i int;
  v_open boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT data INTO v_data FROM encounters WHERE id = p_encounter_id;
  IF v_data IS NULL THEN RETURN false; END IF;

  v_walls := COALESCE(v_data->'walls', '[]'::jsonb);

  FOR v_i IN 0..jsonb_array_length(v_walls) - 1 LOOP
    v_wall := v_walls->v_i;
    IF v_wall->>'type' IN ('door', 'window')
       AND (v_wall->>'x1')::numeric = p_x1
       AND (v_wall->>'y1')::numeric = p_y1
       AND (v_wall->>'x2')::numeric = p_x2
       AND (v_wall->>'y2')::numeric = p_y2
    THEN
      v_open := NOT COALESCE((v_wall->>'doorOpen')::boolean, false);
      v_walls := jsonb_set(v_walls, ARRAY[v_i::text, 'doorOpen'], to_jsonb(v_open));
      v_data := jsonb_set(v_data, '{walls}', v_walls);
      UPDATE encounters SET data = v_data WHERE id = p_encounter_id;
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;
