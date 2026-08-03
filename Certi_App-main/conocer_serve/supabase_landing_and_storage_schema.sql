-- ============================================================
--  SUPABASE — Landing page CMS + bucket de documentos
--  Ejecuta esto en el SQL Editor de tu proyecto de Supabase
--  (mismo procedimiento que supabase_schema.sql)
--
--  NOTA: Este script asume que las tablas documents, certificates,
--  audit_logs y validation_logs YA EXISTEN (las creaste tú mismo,
--  como confirma el CREATE TABLE que compartiste). Este script solo
--  agrega lo que falta: el contenido editable del landing page y el
--  bucket de Storage donde se guardarán los archivos subidos a
--  `documents`.
-- ============================================================

-- 1. Tabla singleton para el contenido editable del landing page.
--    Se guarda como un único registro JSON; el backend hace upsert
--    sobre este mismo id siempre.
CREATE TABLE IF NOT EXISTS public.landing_content (
  id          UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES public.users(id)
);

-- 2. Bucket de Storage para los documentos de candidatos (INE, comprobantes, etc.)
--    Privado: el backend (service_role) genera URLs firmadas para verlos/descargarlos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- El backend siempre usa la service_role key (bypasea RLS tanto en
-- tablas como en Storage), igual que el resto de esta app, así que
-- no se requieren políticas adicionales de RLS para que funcione.
