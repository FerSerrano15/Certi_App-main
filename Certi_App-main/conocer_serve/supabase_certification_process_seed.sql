-- ============================================================================
-- supabase_certification_process_seed.sql
-- Este archivo NO crea tablas nuevas — todo el modelo del proceso de
-- certificación (certification_processes, certification_process_stages,
-- certification_stage_catalog, process_rights_obligations, diagnostics,
-- commitment_letters, evaluation_plans, evidences, evaluation_cedulas,
-- evaluation_reactivos, process_judgments, results_presentations,
-- survey_definitions, survey_responses, certificate_requests, certificates)
-- ya existe en la base de datos real de Supabase.
--
-- Este script solo SIEMBRA datos de catálogo necesarios para que el backend
-- funcione (las 13 etapas obligatorias + las 2 encuestas), de forma
-- IDEMPOTENTE (seguro de correr más de una vez, con ON CONFLICT DO NOTHING /
-- UPDATE), y garantiza que exista el bucket de Storage para evidencias.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- ── Las 13 etapas obligatorias, en orden fijo ──────────────────────────────
-- NOTA: los códigos (`code`) deben coincidir EXACTAMENTE con los que ya
-- existen en tu tabla real `certification_stage_catalog` (confirmado por
-- consulta directa: son en MAYÚSCULAS, p.ej. 'DERECHOS_OBLIGACIONES', no
-- 'recibo_derechos_obligaciones'). Todo el backend (`stages.service.ts`,
-- `certificates.service.ts`) y el frontend (`process-workspace.component`)
-- usan estos mismos códigos en mayúsculas — si tu catálogo real usa otros,
-- corrígelos aquí también antes de correr el script.
INSERT INTO public.certification_stage_catalog (code, name, description, stage_order, is_active)
VALUES
  ('DERECHOS_OBLIGACIONES',      'Derechos y obligaciones',                  'El candidato acusa recibo de sus derechos y obligaciones dentro del proceso.', 1,  true),
  ('DIAGNOSTICO',                'Diagnóstico',                              'El evaluador aplica/registra el diagnóstico digital del candidato.',           2,  true),
  ('CARTA_COMPROMISO',           'Carta compromiso',                         'El candidato firma la carta compromiso.',                                      3,  true),
  ('PLAN_EVALUACION',            'Plan de evaluación',                       'El evaluador propone el plan de evaluación; el admin lo aprueba.',             4,  true),
  ('PREPARACION_EVALUACION',     'Preparación de evaluación',                'Logística y preparación previa a aplicar el instrumento.',                     5,  true),
  ('RECOPILACION_EVIDENCIAS',    'Recopilación de evidencias',               'Se reúnen y validan las evidencias del candidato.',                            6,  true),
  ('INSTRUMENTO_EVALUACION',     'Instrumento de evaluación',                'Se responden los reactivos de la guía de observación vigente.',                7,  true),
  ('CEDULA_EVALUACION',          'Cédula de evaluación',                     'Cierre formal de la cédula con el resultado calculado.',                       8,  true),
  ('EMISION_JUICIO',             'Emisión de juicio',                        'El evaluador emite el dictamen: competente / aún no competente.',              9,  true),
  ('PRESENTACION_RESULTADOS',    'Presentación de resultados',               'Se presentan los resultados al candidato.',                                    10, true),
  ('TRAMITE_CERTIFICADO',        'Trámite de certificado',                   'El admin autoriza y gestiona el trámite del certificado.',                     11, true),
  ('ENCUESTA_SATISFACCION',      'Encuesta de satisfacción',                 'El candidato responde la encuesta de satisfacción.',                           12, true),
  ('ENCUESTA_PROCESO_CERTIFICACION', 'Encuesta del proceso de certificación','El candidato responde la encuesta del proceso de certificación.',              13, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  stage_order = EXCLUDED.stage_order,
  is_active = true;

-- ── Encuestas obligatorias (etapas 12 y 13) ────────────────────────────────
-- La tabla `survey_definitions` estaba vacía en la base real — sin estas 2
-- filas, la etapa de encuestas (submitSurvey) nunca encuentra la definición
-- y falla con "Encuesta no encontrada o inactiva."
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

-- ── Bucket de Storage para evidencias (privado; el backend usa service_role) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidences', 'evidences', false)
ON CONFLICT (id) DO NOTHING;
