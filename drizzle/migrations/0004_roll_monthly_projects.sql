ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS next_cycle_project_id uuid;

CREATE OR REPLACE FUNCTION public.roll_monthly_projects()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p public.projects; new_id uuid; n integer := 0; new_deadline date; lbl text; base_name text;
  meses text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'client') THEN RETURN 0; END IF;
  LOOP
    SELECT * INTO p FROM public.projects
     WHERE is_monthly AND next_cycle_project_id IS NULL AND deadline IS NOT NULL
       AND status <> 'cancelled'
       AND date_trunc('month', deadline) < date_trunc('month', now())
     LIMIT 1 FOR UPDATE SKIP LOCKED;
    EXIT WHEN p.id IS NULL;
    new_deadline := (p.deadline + interval '1 month')::date;
    lbl := meses[extract(month from new_deadline)::int];
    base_name := p.name;
    IF p.cycle_label IS NOT NULL AND p.name ILIKE '%' || p.cycle_label || '%' THEN
      base_name := regexp_replace(p.name, p.cycle_label, lbl, 'i');
    END IF;
    INSERT INTO public.projects (name, client_id, status, priority, deadline, description, created_by, cycle_number, cycle_label, is_monthly, work_type, payment_trigger, payment_amount)
    VALUES (base_name, p.client_id, 'in_progress', p.priority, new_deadline, p.description, p.created_by, COALESCE(p.cycle_number,1)+1, lbl, true, p.work_type, p.payment_trigger, p.payment_amount)
    RETURNING id INTO new_id;
    INSERT INTO public.project_stages (project_id, name, order_index, assigned_role, assigned_to, expected_duration_hours, status, started_at)
    SELECT new_id, s.name, s.order_index, s.assigned_role, s.assigned_to, s.expected_duration_hours,
      CASE WHEN s.order_index = (SELECT min(order_index) FROM public.project_stages WHERE project_id = p.id) THEN 'in_progress'::project_stage_status ELSE 'not_started'::project_stage_status END,
      CASE WHEN s.order_index = (SELECT min(order_index) FROM public.project_stages WHERE project_id = p.id) THEN now() END
    FROM public.project_stages s WHERE s.project_id = p.id;
    INSERT INTO public.project_access (project_id, user_id, role, can_edit, created_by)
    SELECT new_id, a.user_id, a.role, a.can_edit, a.created_by FROM public.project_access a WHERE a.project_id = p.id;
    UPDATE public.projects SET next_cycle_project_id = new_id WHERE id = p.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.roll_monthly_projects() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roll_monthly_projects() TO authenticated;