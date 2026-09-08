-- ============================================================================
-- Foto de perfil (subir desde archivo o cámara)
--
-- 1. Agrega la columna `avatar_url` a `users` (guarda la URL pública final,
--    no una ruta interna — el bucket es público, no necesita URLs firmadas).
-- 2. Crea el bucket público `avatars` en Storage.
--
-- Idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Verificación
SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_url';
SELECT id, name, public FROM storage.buckets WHERE id = 'avatars';
