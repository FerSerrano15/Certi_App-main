-- ============================================================
--  SUPABASE — SQL para crear la tabla profiles
--  Ejecuta esto en el SQL Editor de tu proyecto de Supabase
-- ============================================================

-- 1. Crear la tabla de perfiles (vinculada a auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  -- Clave primaria = UUID del usuario en Supabase Auth
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Datos básicos
  nombre          TEXT        NOT NULL,
  correo          TEXT        NOT NULL UNIQUE,
  role            TEXT        NOT NULL DEFAULT 'candidato'
                              CHECK (role IN ('superadmin','admin','evaluador','candidato')),
  completed_profile BOOLEAN   NOT NULL DEFAULT false,
  has_evaluador_request BOOLEAN NOT NULL DEFAULT false,

  -- Datos de Candidato
  folio           TEXT,
  curp            TEXT        UNIQUE,
  domicilio       TEXT,
  grado_estudios  TEXT,
  sector_productivo TEXT,

  -- Datos de Evaluador
  estandares      TEXT[],
  estatus_evaluador TEXT      CHECK (estatus_evaluador IN ('activo','inactivo','pendiente')),

  -- Campo telefono compartido
  telefono        TEXT,

  -- Timestamps automáticos
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Habilitar RLS (Row Level Security) — Buena práctica
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de acceso:
-- Los usuarios pueden ver y editar su propio perfil
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins y superadmins pueden ver todos los perfiles
-- NOTA: Esta política se manejará desde NestJS con service_role key
-- (la service_role key bypasea RLS automáticamente)

-- 5. Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_correo ON public.profiles(correo);
CREATE INDEX IF NOT EXISTS idx_profiles_curp ON public.profiles(curp);
