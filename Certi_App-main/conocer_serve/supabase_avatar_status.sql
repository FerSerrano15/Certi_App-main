-- ============================================================================
-- Estado de revisión de la foto de perfil (avatar)
--
-- Igual que `documents.status` (pending/validated/rejected), pero para la
-- foto de perfil de `users`. Al subir una foto nueva queda "pending" hasta
-- que un admin la revise desde Usuarios → (clic en el usuario).
--
-- Idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_status TEXT DEFAULT 'pending';

-- Usuarios que ya tenían foto antes de este cambio: quedan "pending" para
-- que el admin las revise (si avatar_url es NULL, no aplica: no tienen foto).
UPDATE public.users
SET avatar_status = 'pending'
WHERE avatar_url IS NOT NULL AND avatar_status IS NULL;

-- Verificación
SELECT avatar_status, count(*) FROM public.users GROUP BY avatar_status;
