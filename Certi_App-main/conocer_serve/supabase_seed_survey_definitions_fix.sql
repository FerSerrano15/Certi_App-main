-- ============================================================================
-- Corrige `survey_definitions` (estaba vacía) para que las últimas 2 etapas
-- del proceso de certificación (encuestas) funcionen.
--
-- Los códigos usan MAYÚSCULAS porque así están definidos en tu tabla real
-- `certification_stage_catalog` (confirmado por consulta directa) — todo
-- el backend y el frontend ya quedaron alineados a esa convención.
--
-- Idempotente: se puede correr más de una vez sin duplicar filas.
-- ============================================================================

INSERT INTO public.survey_definitions (code, name, description, stage_code, questions, version, is_active)
VALUES
  (
    'ENCUESTA_SATISFACCION',
    'Encuesta de satisfacción',
    'Satisfacción del candidato con el proceso de certificación recién concluido.',
    'ENCUESTA_SATISFACCION',
    '[
      {"key":"satisfaccion_general","label":"¿Qué tan satisfecho quedaste con el proceso en general?","type":"scale_1_5"},
      {"key":"atencion_evaluador","label":"¿Cómo calificarías la atención del evaluador?","type":"scale_1_5"},
      {"key":"comentarios","label":"Comentarios adicionales","type":"text"}
    ]'::jsonb,
    1,
    true
  ),
  (
    'ENCUESTA_PROCESO_CERTIFICACION',
    'Encuesta del proceso de certificación',
    'Retroalimentación específica sobre las etapas del proceso de certificación.',
    'ENCUESTA_PROCESO_CERTIFICACION',
    '[
      {"key":"claridad_etapas","label":"¿Las etapas del proceso fueron claras?","type":"scale_1_5"},
      {"key":"tiempos","label":"¿Los tiempos del proceso fueron adecuados?","type":"scale_1_5"},
      {"key":"sugerencias","label":"Sugerencias de mejora","type":"text"}
    ]'::jsonb,
    1,
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  questions = EXCLUDED.questions,
  is_active = true;

-- Verificación
SELECT code, stage_code, is_active FROM public.survey_definitions ORDER BY code;
