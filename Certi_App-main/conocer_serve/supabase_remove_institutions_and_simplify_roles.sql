-- Ejecutar en el SQL Editor de Supabase.
--
-- Este script hace dos cosas, en este orden:
--   PARTE 1: elimina por completo el concepto de "instituciones" (multi-tenencia)
--            y simplifica el modelo de roles a 4: SUPER_ADMIN, ADMIN, EVALUADOR, CANDIDATO.
--   PARTE 2: agrega el catálogo de Estándares de Competencia -> Guías de Observación
--            -> Reactivos, y la tabla donde se guardan las respuestas de evaluación
--            de cada candidato inscrito.
--
-- Corre primero la PARTE 1 y confirma que el backend/frontend actualizado sigue
-- funcionando antes de correr la PARTE 2 (son independientes, pero así es más
-- fácil detectar en qué paso algo salió mal si pasa).

-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — Quitar institutions, simplificar roles
-- ════════════════════════════════════════════════════════════════════════════

-- 0) Quitar el CHECK constraint VIEJO primero — todavía no acepta 'ADMIN'/'CANDIDATO',
--    así que hay que quitarlo antes de poder migrar los valores de rol.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

-- 1) Migrar los roles existentes al nuevo modelo de 4
UPDATE public.users SET role = 'ADMIN'     WHERE role IN ('ADMIN_INSTITUCION', 'COORDINADOR');
UPDATE public.users SET role = 'EVALUADOR' WHERE role = 'INSTRUCTOR';
UPDATE public.users SET role = 'CANDIDATO' WHERE role = 'OPERADOR';
-- SUPER_ADMIN y EVALUADOR (los que ya tuvieran ese rol) quedan igual.

-- 2) Poner el CHECK constraint NUEVO, ya con los 4 roles finales
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['SUPER_ADMIN','ADMIN','EVALUADOR','CANDIDATO']));

-- 3) Quitar institution_id de todas las tablas que lo tienen (dropea su FK en cascada)
ALTER TABLE public.users               DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.participants        DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.programs            DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.courses             DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.groups              DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.documents           DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.certificates        DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.audit_logs          DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.certifications      DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.course_applications DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.document_types      DROP COLUMN IF EXISTS institution_id;

-- 4) Nuevo dato opcional de texto libre en users (reemplaza el FK a institutions)
ALTER TABLE public.users ADD COLUMN institution_name text;

-- 5) Tablas que solo existían para el concepto de instituciones
DROP TABLE IF EXISTS public.institution_standards;
DROP TABLE IF EXISTS public.institutions;

-- 6) groups: un solo responsable por grupo (evaluator_id, que ya existía sin usar);
--    se retira instructor_id, que quedaba duplicado con el mismo propósito.
ALTER TABLE public.groups DROP COLUMN IF EXISTS instructor_id;

-- 7) certifications: retirar INSTRUCTOR_CREDENTIAL, EVALUATOR_CREDENTIAL toma su lugar
--    (ya existía en el CHECK constraint pero el código nunca la usaba).
UPDATE public.certifications SET type = 'EVALUATOR_CREDENTIAL' WHERE type = 'INSTRUCTOR_CREDENTIAL';
ALTER TABLE public.certifications DROP CONSTRAINT IF EXISTS certifications_type_check;
ALTER TABLE public.certifications ADD CONSTRAINT certifications_type_check
  CHECK (type = ANY (ARRAY['EVALUATOR_CREDENTIAL','STANDARD']));

-- 8) document_types.applies_to: 'instructor' -> 'evaluador' (mismo concepto, nuevo nombre)
--    (quitar el constraint viejo ANTES del UPDATE — mismo motivo que el paso 0/1)
ALTER TABLE public.document_types DROP CONSTRAINT IF EXISTS document_types_applies_to_check;
UPDATE public.document_types SET applies_to = 'evaluador' WHERE applies_to = 'instructor';
ALTER TABLE public.document_types ADD CONSTRAINT document_types_applies_to_check
  CHECK (applies_to = ANY (ARRAY['participante','evaluador']));

-- Nota: evaluator_requests (solicitudes para convertirse en evaluador) queda tal cual,
-- sin usar en el código — no se tocó, no era parte de lo pedido.

-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — Catálogo de Estándares -> Guías de Observación -> Reactivos
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.estandares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,        -- 'EC0755', 'EC0682.01'
  nombre text NOT NULL,
  categoria text,                     -- agrupador opcional, ej. 'Administración'
  version integer NOT NULL DEFAULT 1, -- se incrementa manualmente al actualizarse (.01 -> .02)
  vigente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.guias_observacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estandar_id uuid NOT NULL REFERENCES public.estandares(id) ON DELETE CASCADE,
  titulo text NOT NULL,               -- 'Guía de Observación 1'
  instrucciones text,                 -- párrafo de instrucciones para el evaluador
  orden integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reactivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_id uuid NOT NULL REFERENCES public.guias_observacion(id) ON DELETE CASCADE,
  codigo_reactivo text NOT NULL,      -- '1.1/5-D1E1'
  descripcion text NOT NULL,
  peso numeric(6,2) NOT NULL,
  es_actitud_valor boolean NOT NULL DEFAULT false,  -- categoría especial que menciona la guía original
  orden integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- liga opcional de un curso al catálogo de estándares (aditivo, no rompe nada existente)
ALTER TABLE public.courses ADD COLUMN estandar_id uuid REFERENCES public.estandares(id);

-- respuestas de evaluación por candidato inscrito, llenadas por el EVALUADOR del grupo
CREATE TABLE public.evaluacion_reactivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  reactivo_id uuid NOT NULL REFERENCES public.reactivos(id),
  respuesta boolean,                  -- null = sin responder, true = Sí, false = No
  observaciones text,
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, reactivo_id)
);
