
-- Clientes logados podem aprovar/pedir ajuste nos conteúdos dos próprios projetos
CREATE POLICY "Contents approvable by own client" ON public.contents
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'client'::app_role) AND EXISTS (
  SELECT 1 FROM public.projects p WHERE p.id = contents.project_id AND public.can_access_client(auth.uid(), p.client_id)))
WITH CHECK (public.has_role(auth.uid(), 'client'::app_role) AND EXISTS (
  SELECT 1 FROM public.projects p WHERE p.id = contents.project_id AND public.can_access_client(auth.uid(), p.client_id)));

CREATE OR REPLACE FUNCTION public.is_portal_actor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL OR public.has_role(auth.uid(), 'client'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.notify_content_client_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; part text; kind text;
BEGIN
  IF NOT public.is_portal_actor() THEN RETURN NEW; END IF;
  SELECT p.client_id INTO cid FROM public.projects p WHERE p.id = NEW.project_id;
  IF NEW.media_status IS DISTINCT FROM OLD.media_status AND NEW.media_status IN ('approved','change_requested') THEN
    part := 'mídia'; kind := CASE WHEN NEW.media_status = 'approved' THEN 'approved' ELSE 'change_requested' END;
  ELSIF NEW.copy_status IS DISTINCT FROM OLD.copy_status AND NEW.copy_status IN ('approved','change_requested') THEN
    part := 'legenda'; kind := CASE WHEN NEW.copy_status = 'approved' THEN 'approved' ELSE 'change_requested' END;
  ELSE RETURN NEW; END IF;
  INSERT INTO public.client_notifications (client_id, content_id, kind, title, author_name)
  VALUES (cid, NEW.id, kind,
    CASE WHEN kind = 'approved' THEN 'Cliente aprovou ' ELSE 'Cliente pediu ajuste na ' END || part || ' — ' || NEW.title,
    'Cliente');
  RETURN NEW;
END $$;

CREATE TRIGGER contents_notify_client_action AFTER UPDATE ON public.contents
FOR EACH ROW EXECUTE FUNCTION public.notify_content_client_action();

CREATE OR REPLACE FUNCTION public.notify_content_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; ttl text;
BEGIN
  IF NOT public.is_portal_actor() THEN RETURN NEW; END IF;
  SELECT p.client_id, c.title INTO cid, ttl FROM public.contents c JOIN public.projects p ON p.id = c.project_id WHERE c.id = NEW.content_id;
  INSERT INTO public.client_notifications (client_id, content_id, kind, title, message, author_name)
  VALUES (cid, NEW.content_id, 'comment', 'Novo comentário do cliente — ' || COALESCE(ttl, 'conteúdo'), NEW.text, COALESCE(NEW.author_name, 'Cliente'));
  RETURN NEW;
END $$;

CREATE TRIGGER content_comments_notify AFTER INSERT ON public.content_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_content_comment();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
