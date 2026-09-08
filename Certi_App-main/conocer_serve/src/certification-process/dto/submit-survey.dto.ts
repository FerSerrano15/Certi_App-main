import { IsIn, IsObject } from 'class-validator';

export class SubmitSurveyDto {
  @IsIn(['ENCUESTA_SATISFACCION', 'ENCUESTA_PROCESO_CERTIFICACION'])
  survey_code: 'ENCUESTA_SATISFACCION' | 'ENCUESTA_PROCESO_CERTIFICACION';

  @IsObject()
  responses: Record<string, unknown>;
}
