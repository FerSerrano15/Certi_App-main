-- ============================================================
-- supabase_notifications.sql
-- Notificaciones in-app dirigidas a un rol (ADMIN/SUPER_ADMIN).
-- Primer uso: avisar cuando un candidato envía una ficha de
-- registro (ver conocer_serve/src/ficha-registro).
-- ============================================================

CREATE TABLE public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_role   text NOT NULL DEFAULT 'ADMIN' CHECK (target_role = ANY (ARRAY['ADMIN','SUPER_ADMIN'])),
  type          text NOT NULL,
  title         text NOT NULL,
  message       text NOT NULL,
  -- payload esperado para type = 'FICHA_REGISTRO_SUBMITTED':
  -- { ficha_id, user_id, full_name, estandar_codigo, estandar_nombre }
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  read          boolean NOT NULL DEFAULT false,
  read_by       uuid REFERENCES public.users(id),
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_role ON public.notifications(target_role, read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_no_public_access" ON public.notifications
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
