-- ============================================================================
-- Fix: Supabase Security Advisor — "RLS Disabled in Public"
-- Tablas afectadas: public.landing_content, public.certifications
-- ============================================================================
--
-- Por qué aparece esta advertencia:
-- Supabase expone automáticamente TODAS las tablas del schema "public" vía su
-- API REST (PostgREST), usando las claves "anon" y "authenticated". Si una
-- tabla no tiene Row Level Security (RLS) activado, cualquiera que tenga la
-- clave "anon" (que es pública, va incluida en apps frontend) puede leer o
-- escribir TODAS las filas de esa tabla directamente contra la API de
-- Supabase, saltándose por completo tu backend NestJS y su lógica de permisos
-- (JwtAuthGuard, roles, etc.). Es un hueco de seguridad real, no un falso
-- positivo.
--
-- Por qué es seguro activar RLS aquí sin romper nada:
-- El backend (conocer_serve) se conecta a Supabase usando la SERVICE_ROLE_KEY
-- (ver supabase.service.ts), y ese rol IGNORA RLS por diseño. Es decir, tu
-- API seguirá funcionando exactamente igual. Lo único que cambia es que ya
-- nadie podrá leer/escribir estas tablas llamando directo a Supabase con la
-- clave anónima.
--
-- Ejecuta esto en el SQL Editor de Supabase.
-- ============================================================================

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications  ENABLE ROW LEVEL SECURITY;

-- Sin políticas (policies) definidas, RLS por defecto BLOQUEA todo acceso
-- para los roles "anon" y "authenticated" — que es lo que queremos, porque
-- toda la lectura/escritura de estas tablas pasa por el backend con
-- service_role. Aun así, se agregan dos políticas explícitas abajo por
-- higiene y claridad (no son estrictamente necesarias, pero documentan la
-- intención y facilitan auditorías futuras).

-- landing_content: el contenido del landing es público en el sitio, pero se
-- sirve siempre a través del backend (GET /landing), nunca directo desde
-- Supabase. No se crea policy de SELECT para anon a propósito: mantener todo
-- el tráfico pasando por el backend simplifica el control de versiones del
-- contenido y evita depender de la clave anon en el frontend.
DROP POLICY IF EXISTS "landing_content_no_public_access" ON public.landing_content;
CREATE POLICY "landing_content_no_public_access"
  ON public.landing_content
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- certifications: contiene datos de certificación de instructores/candidatos;
-- toda su gestión ya pasa por endpoints protegidos con JwtAuthGuard.
DROP POLICY IF EXISTS "certifications_no_public_access" ON public.certifications;
CREATE POLICY "certifications_no_public_access"
  ON public.certifications
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Nota: si en el futuro el Advisor marca más tablas nuevas (documents,
-- certificates, audit_logs, validation_logs, etc.), aplica el mismo patrón:
--   ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;
-- y, opcionalmente, una policy "no_public_access" como las de arriba —
-- siempre que esa tabla solo se use desde el backend con service_role.
