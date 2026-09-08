-- ============================================================
-- supabase_fichas_registro_status.sql
-- Agrega un estado de revisión a cada ficha de registro, para que el
-- admin pueda darle seguimiento desde la vista de "Solicitudes"
-- (en vez de solo ver el PDF desde la notificación).
-- ============================================================

ALTER TABLE public.fichas_registro
  ADD COLUMN status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobada', 'rechazada'));

CREATE INDEX idx_fichas_registro_status ON public.fichas_registro(status);
