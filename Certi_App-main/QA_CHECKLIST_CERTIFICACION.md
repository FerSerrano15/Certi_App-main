# QA Checklist — Flujo de Certificación CONOCER (CertiApp)

Antes de probar, en el SQL Editor de Supabase ejecuta una vez:
`conocer_serve/supabase_certification_process_seed.sql`
(siembra las 13 etapas del catálogo, las 2 encuestas, y crea el bucket de Storage `evidences` si no existe — no crea tablas).

## Escenario dorado (E2E) — estándar de ejemplo: Primeros Auxilios

1. **Candidato** crea cuenta / inicia sesión.
2. Candidato va a **Ficha de Registro** → elige el estándar (Primeros Auxilios) → llena y envía la ficha (queda `enviada`).
3. Candidato va a **Mi Certificación** → "+ Nueva solicitud" → busca y selecciona el mismo estándar → se crea la solicitud (`pendiente`).
4. **Admin** entra a **Solicitudes de Certificación**, abre la solicitud del candidato.
   - Pestaña *Datos del candidato* / *Estándar solicitado* / *Documentos* / *Historial*: revisa la información.
   - Pestaña *Revisión*: clic en **Aprobar** (pasa a `en_revision` automáticamente al abrir y luego a `aprobada`).
5. Admin, en la misma solicitud, pestaña *Preparación del curso*: selecciona (o crea) un curso ligado al estándar, opcionalmente un grupo → **Guardar preparación**.
6. Admin, pestaña *Selección de evaluador*: debe aparecer únicamente evaluadores que cumplen **las 4 condiciones** (rol EVALUADOR, activo, credencial de evaluador vigente, certificación vigente del estándar). Selecciona uno.
   - Si no aparece nadie, ve a **Usuarios → certificaciones del evaluador** y agrégale la credencial (`EVALUATOR_CREDENTIAL`) y la certificación del estándar (`STANDARD`, usando el buscador de estándar — ya no es texto libre).
7. Admin, pestaña *Confirmación del proceso*: clic en **Crear proceso de certificación**. Se genera folio único y las 13 etapas en `pending`.
8. Se abre el expediente (`process-workspace`) — recorre las etapas en orden:
   1. Candidato acepta **Recibo de derechos y obligaciones**.
   2. Evaluador registra **Diagnóstico**.
   3. Candidato firma **Carta compromiso**.
   4. Evaluador propone **Plan de evaluación** → envía a revisión; Admin lo **aprueba**.
   5. Evaluador marca **Preparación de la evaluación** completada.
   6. Candidato/Evaluador suben **Evidencias**; Evaluador valida cada una; Evaluador **cierra la etapa** de evidencias.
   7. Evaluador **inicializa el instrumento**, responde todos los reactivos (Sí/No) y guarda.
   8. Evaluador **cierra la Cédula de evaluación** (calcula % automáticamente).
   9. Evaluador **emite el juicio** → elige `competente` (el sistema valida los requisitos obligatorios antes de permitirlo).
   10. Evaluador **presenta resultados** al candidato.
   11. Admin, en *Trámite de certificado*, **inicia el trámite** y luego **aprueba** → se emite el certificado (folio, token, QR).
   12. Candidato responde **Encuesta de satisfacción** y **Encuesta del proceso de certificación**.
9. Candidato ve su certificado emitido en **Mi Certificación** (banner del proceso) y puede compartir el enlace público `/verificar/<folio>`.
10. Cualquier persona (sin sesión) entra a `/verificar` e introduce el folio o token → ve el estatus **vigente** y los datos del certificado.

## Escenarios negativos (deben bloquear)

1. **Evaluador sin credencial** → al intentar asignarlo en *Selección de evaluador* no aparece en la lista; si se fuerza por API, `assertEvaluatorQualified` responde 409.
2. **Evaluador con credencial pero sin certificación del estándar** → mismo bloqueo (no aparece / 409 al forzar).
3. **Certificación vencida** (credencial o del estándar con `expires_at` pasado, o `status` distinto de `vigente`) → no aparece como calificado.
4. **Candidato no aprobado intentando crear proceso** → `POST /certification-process` responde 409 si la solicitud no está `aprobada` o no tiene `course_id`.
5. **Evaluador viendo proceso de otro evaluador** → `GET /certification-process/:id` responde 403 (`getProcessForActor`).
6. **Candidato viendo expediente ajeno** → mismo 403 vía `getProcessForActor`.
7. **Intento de emitir certificado con juicio `aun_no_competente`** → `POST /certificate-requests` responde 409 ("el juicio del proceso debe ser competente").

## Verificado en esta sesión

- Backend: `npx tsc --noEmit` → 0 errores (verificado en sesión previa).
- Frontend: `ng build` (configuración development) → build exitoso, 0 errores de tipos/plantillas. Los únicos *warnings* restantes (`LmsComponent`/`ParticipantsComponent` no usados en `DashboardComponent`) son preexistentes y no están relacionados con este trabajo.
- No fue posible ejecutar el flujo real contra Supabase desde este entorno (sin credenciales de base de datos ni acceso de red al proyecto) — la verificación fue estática (compilación) únicamente. Se recomienda correr manualmente esta checklist contra el ambiente real.

## Gaps conocidos (fuera de alcance de esta sesión)

- El módulo `documents` / `document_types` sigue roto contra el esquema real (`document_type_id` es FK NOT NULL sin CRUD de tipos de documento) — no bloquea el escenario dorado, pero la pestaña *Documentos* del admin mostrará poco o nada hasta corregirse.
- `git status` en el repo muestra prácticamente todos los archivos como modificados por diferencias de fin de línea (CRLF/LF) preexistentes al trabajo de esta sesión — no se tocó intencionalmente ningún archivo fuera de los listados arriba.
