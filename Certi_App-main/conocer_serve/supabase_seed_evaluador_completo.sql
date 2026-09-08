-- ============================================================================
-- Script: dejar a un evaluador calificado para TODOS los estándares
-- Usuario objetivo: sumalazyq@mailinator.com
--
-- Qué hace:
--   1. Le asegura el rol EVALUADOR y lo marca como activo (is_active = true).
--   2. Le da (o reactiva) su credencial general de evaluador
--      (certifications.type = 'EVALUATOR_CREDENTIAL'), vigente y sin vencimiento.
--   3. Le da (o reactiva) una certificación STANDARD vigente para CADA estándar
--      que exista hoy en el catálogo `estandares`.
--
-- Es idempotente: se puede ejecutar más de una vez sin duplicar filas ni
-- romper nada (usa NOT EXISTS / actualiza lo que ya exista).
--
-- Ejecutar completo en el SQL Editor de Supabase, de una sola vez.
-- ============================================================================

-- 0. Verificación previa: el usuario debe existir ya (haberse registrado en la app).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'sumalazyq@mailinator.com') THEN
    RAISE EXCEPTION 'No existe ningún usuario con email sumalazyq@mailinator.com. Debe registrarse/iniciar sesión al menos una vez antes de correr este script.';
  END IF;
END $$;

-- 1. Rol EVALUADOR + activo
UPDATE public.users
SET role = 'EVALUADOR',
    is_active = true
WHERE email = 'sumalazyq@mailinator.com';

-- 2. Credencial general de evaluador (EVALUATOR_CREDENTIAL) vigente
INSERT INTO public.certifications (user_id, type, name, status, issued_at, expires_at)
SELECT u.id, 'EVALUATOR_CREDENTIAL', 'Credencial general de evaluador', 'vigente', CURRENT_DATE, NULL
FROM public.users u
WHERE u.email = 'sumalazyq@mailinator.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.certifications c
    WHERE c.user_id = u.id
      AND c.type = 'EVALUATOR_CREDENTIAL'
      AND c.status = 'vigente'
      AND (c.expires_at IS NULL OR c.expires_at >= CURRENT_DATE)
  );

-- Si ya tenía una EVALUATOR_CREDENTIAL pero vencida/revocada/cancelada, la reactiva
-- en vez de crear una duplicada.
UPDATE public.certifications c
SET status = 'vigente', expires_at = NULL
FROM public.users u
WHERE c.user_id = u.id
  AND u.email = 'sumalazyq@mailinator.com'
  AND c.type = 'EVALUATOR_CREDENTIAL'
  AND (c.status <> 'vigente' OR (c.expires_at IS NOT NULL AND c.expires_at < CURRENT_DATE));

-- 3. Certificación STANDARD vigente para TODOS los estándares del catálogo
INSERT INTO public.certifications (user_id, estandar_id, type, code, name, status, issued_at, expires_at)
SELECT u.id, e.id, 'STANDARD', e.codigo, e.nombre, 'vigente', CURRENT_DATE, NULL
FROM public.users u
CROSS JOIN public.estandares e
WHERE u.email = 'sumalazyq@mailinator.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.certifications c
    WHERE c.user_id = u.id
      AND c.type = 'STANDARD'
      AND c.estandar_id = e.id
      AND c.status = 'vigente'
      AND (c.expires_at IS NULL OR c.expires_at >= CURRENT_DATE)
  );

-- Reactiva cualquier STANDARD que ya existiera pero estuviera vencida/revocada/cancelada.
UPDATE public.certifications c
SET status = 'vigente', expires_at = NULL
FROM public.users u
WHERE c.user_id = u.id
  AND u.email = 'sumalazyq@mailinator.com'
  AND c.type = 'STANDARD'
  AND (c.status <> 'vigente' OR (c.expires_at IS NOT NULL AND c.expires_at < CURRENT_DATE));

-- ============================================================================
-- 4. Verificación final — corre esto para confirmar que quedó todo en orden.
-- ============================================================================
SELECT
  u.email,
  u.role,
  u.is_active,
  (SELECT count(*) FROM public.certifications c
     WHERE c.user_id = u.id AND c.type = 'EVALUATOR_CREDENTIAL' AND c.status = 'vigente') AS credencial_evaluador_vigente,
  (SELECT count(*) FROM public.estandares) AS total_estandares,
  (SELECT count(*) FROM public.certifications c
     WHERE c.user_id = u.id AND c.type = 'STANDARD' AND c.status = 'vigente') AS estandares_certificados_vigentes
FROM public.users u
WHERE u.email = 'sumalazyq@mailinator.com';
