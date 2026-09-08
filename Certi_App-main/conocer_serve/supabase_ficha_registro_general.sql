-- Ficha de Registro general de la cuenta (no ligada a una inscripción/
-- certificación particular). Se llena una sola vez, justo después de crear
-- la cuenta, con datos personales completos + firma + aceptación de
-- términos y condiciones.
--
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ficha_registro_data JSONB,
  ADD COLUMN IF NOT EXISTS ficha_registro_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
