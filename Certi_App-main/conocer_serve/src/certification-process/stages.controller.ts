import {
  Controller, Get, Post,
  Body, Param, Request, UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { StagesService } from './stages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcceptRightsDto } from './dto/accept-rights.dto';
import { SaveDiagnosticDto } from './dto/save-diagnostic.dto';
import { SignCommitmentDto } from './dto/sign-commitment.dto';
import { SavePlanDto } from './dto/save-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { CompleteGenericStageDto } from './dto/complete-generic-stage.dto';
import { BulkReactivosDto } from './dto/bulk-reactivos.dto';
import { CloseCedulaDto } from './dto/close-cedula.dto';
import { EmitJudgmentDto } from './dto/emit-judgment.dto';
import { PresentResultsDto } from './dto/present-results.dto';
import { SubmitSurveyDto } from './dto/submit-survey.dto';

interface Req extends Request {
  user: { id: string; role: string; email: string };
}

@Controller('certification-process/:id')
@UseGuards(JwtAuthGuard)
export class StagesController {
  constructor(private readonly svc: StagesService) {}

  // ── 1) Derechos y obligaciones ──
  @Get('rights')
  getRights(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getRights(id, req.user);
  }
  @Post('rights')
  acceptRights(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptRightsDto, @Request() req: Req) {
    return this.svc.acceptRights(id, dto, req.user);
  }

  // ── 2) Diagnóstico ──
  @Get('diagnostic')
  getDiagnostic(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getDiagnostic(id, req.user);
  }
  @Post('diagnostic')
  saveDiagnostic(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveDiagnosticDto, @Request() req: Req) {
    return this.svc.saveDiagnostic(id, dto, req.user);
  }

  // ── 3) Carta compromiso ──
  @Get('commitment')
  getCommitment(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getCommitment(id, req.user);
  }
  @Post('commitment')
  signCommitment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SignCommitmentDto, @Request() req: Req) {
    return this.svc.signCommitment(id, dto, req.user);
  }

  // ── 4) Plan de evaluación ──
  @Get('plan')
  getPlan(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getPlan(id, req.user);
  }
  @Post('plan')
  savePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SavePlanDto, @Request() req: Req) {
    return this.svc.savePlan(id, dto, req.user);
  }
  @Post('plan/review')
  reviewPlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewPlanDto, @Request() req: Req) {
    return this.svc.reviewPlan(id, dto, req.user);
  }

  // ── 5) Preparación de la evaluación ──
  @Post('preparacion/complete')
  completePreparacion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteGenericStageDto, @Request() req: Req) {
    return this.svc.completePreparacion(id, dto, req.user);
  }

  // ── 6) Recopilación de evidencias (cierre; la carga vive en /evidences) ──
  @Post('evidence-stage/complete')
  completeEvidenceStage(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.completeEvidenceStage(id, req.user);
  }

  // ── 7) Instrumento de evaluación (reactivos) ──
  @Get('instrument')
  getInstrument(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getInstrument(id, req.user);
  }
  @Post('instrument/init')
  initInstrument(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.initInstrument(id, req.user);
  }
  @Post('instrument/bulk')
  bulkSaveReactivos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BulkReactivosDto, @Request() req: Req) {
    return this.svc.bulkSaveReactivos(id, dto, req.user);
  }

  // ── 8) Cédula de evaluación ──
  @Get('cedula')
  getCedula(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getCedula(id, req.user);
  }
  @Post('cedula/close')
  closeCedula(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseCedulaDto, @Request() req: Req) {
    return this.svc.closeCedula(id, dto, req.user);
  }
  @Get('readiness')
  checkReadiness(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.checkReadinessForCompetente(id);
  }

  // ── 9) Emisión de juicio ──
  @Get('judgment')
  getJudgment(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getJudgment(id, req.user);
  }
  @Post('judgment')
  emitJudgment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EmitJudgmentDto, @Request() req: Req) {
    return this.svc.emitJudgment(id, dto, req.user);
  }

  // ── 10) Presentación de resultados ──
  @Get('results-presentation')
  getResultsPresentation(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getResultsPresentation(id, req.user);
  }
  @Post('results-presentation')
  presentResults(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PresentResultsDto, @Request() req: Req) {
    return this.svc.presentResults(id, dto, req.user);
  }

  // ── 12/13) Encuestas ──
  @Get('surveys')
  getSurveyResponses(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getSurveyResponses(id, req.user);
  }
  @Post('surveys')
  submitSurvey(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitSurveyDto, @Request() req: Req) {
    return this.svc.submitSurvey(id, dto, req.user);
  }
}
