-- ============================================================================
-- Corrige columnas faltantes en public.documents
--
-- El error "column documents.uploaded_at does not exist" significa que tu
-- tabla `documents` (creada manualmente) no tiene todas las columnas que el
-- backend espera. Este script agrega SOLO las que falten, sin tocar las que
-- ya tienes ni borrar nada.
--
-- Idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type           TEXT,
  ADD COLUMN IF NOT EXISTS file_path      TEXT,
  ADD COLUMN IF NOT EXISTS file_name      TEXT,
  ADD COLUMN IF NOT EXISTS mime_type      TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes     BIGINT,
  ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by    UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS uploaded_at    TIMESTAMPTZ DEFAULT NOW();

-- Documentos ya existentes sin fecha: les ponemos "ahora" para que no
-- rompan el ORDER BY uploaded_at que usa el backend.
UPDATE public.documents
SET uploaded_at = NOW()
WHERE uploaded_at IS NULL;

-- Verificación: deberías ver estas 10 columnas listadas.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'documents'
ORDER BY ordinal_position;
