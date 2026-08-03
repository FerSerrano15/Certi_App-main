-- ============================================================
--  SUPABASE — SQL para crear la tabla certifications
--  Ejecuta esto en el SQL Editor de tu proyecto de Supabase
--  (mismo procedimiento que supabase_schema.sql)
-- ============================================================
--
--  Esta tabla resuelve el requisito de negocio:
--   "Para ser asignado como instructor de un grupo, el usuario debe
--    tener (a) la credencial general de instructor Y (b) la
--    certificación específica del estándar/curso que va a impartir."
--
--  type = 'INSTRUCTOR_CREDENTIAL' -> acredita que la persona puede
--         fungir como instructor/capacitador (sin importar el curso).
--  type = 'STANDARD'              -> acredita al usuario en un
--         estándar de competencia específico. El campo `code` debe
--         coincidir exactamente con `courses.code` (ej: 'EC0217').
--
-- ============================================================

CREATE TABLE IF NOT EXISTS public.certifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  type              TEXT NOT NULL CHECK (type IN ('INSTRUCTOR_CREDENTIAL','STANDARD')),

  -- Obligatorio solo cuando type = 'STANDARD'; debe igualar courses.code
  code              TEXT,

  name              TEXT,

  status            TEXT NOT NULL DEFAULT 'vigente'
                      CHECK (status IN ('vigente','vencido','revocado')),

  issued_at         DATE,
  expires_at        DATE,
  certificate_url   TEXT,

  institution_id    UUID REFERENCES public.institutions(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT certifications_code_required_for_standard
    CHECK (type <> 'STANDARD' OR code IS NOT NULL)
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_certifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certifications_updated_at ON public.certifications;
CREATE TRIGGER certifications_updated_at
  BEFORE UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION update_certifications_updated_at();

-- Índices para las consultas de elegibilidad (instructor + estándar)
CREATE INDEX IF NOT EXISTS idx_certifications_user   ON public.certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_certifications_type    ON public.certifications(type);
CREATE INDEX IF NOT EXISTS idx_certifications_code    ON public.certifications(code);
CREATE INDEX IF NOT EXISTS idx_certifications_status  ON public.certifications(status);

-- El backend usa la service_role key (bypasea RLS), igual que el resto
-- de tablas de esta app. No es necesario configurar RLS aquí.
