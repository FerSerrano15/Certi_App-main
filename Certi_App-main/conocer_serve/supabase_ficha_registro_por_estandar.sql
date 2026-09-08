-- ============================================================
-- supabase_ficha_registro_por_estandar.sql
-- Reemplaza el modelo de "una sola ficha de registro por cuenta"
-- por "una ficha de registro por cada estándar/certificación" que
-- el candidato quiera tramitar. Cada fila es una ficha independiente,
-- ligada a un estándar del catálogo `estandares`.
--
-- Nota: users.ficha_registro_data / ficha_registro_submitted_at
-- (creadas en supabase_ficha_registro_general.sql) se dejan intactas
-- por compatibilidad, pero el flujo nuevo ya no las usa.
-- ============================================================

CREATE TABLE public.fichas_registro (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  estandar_id       uuid NOT NULL REFERENCES public.estandares(id),
  -- Snapshot del código/nombre del estándar al momento de enviar la ficha,
  -- para que el PDF no cambie si el estándar se edita/versiona después.
  estandar_codigo   text NOT NULL,
  estandar_nombre   text NOT NULL,
  form_data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fichas_registro_user_estandar_unique UNIQUE (user_id, estandar_id)
);

CREATE INDEX idx_fichas_registro_user ON public.fichas_registro(user_id);
CREATE INDEX idx_fichas_registro_estandar ON public.fichas_registro(estandar_id);

-- El backend usa siempre el cliente service_role (bypassa RLS); se habilita
-- RLS con policy deny-all para anon/authenticated como el resto de tablas
-- sensibles del proyecto (ver supabase_rls_fix.sql).
ALTER TABLE public.fichas_registro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fichas_registro_no_public_access" ON public.fichas_registro
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
