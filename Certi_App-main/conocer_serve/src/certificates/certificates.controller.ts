import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCertificateRequestDto } from './dto/create-certificate-request.dto';
import { ReviewCertificateRequestDto } from './dto/review-certificate-request.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';

interface Req extends Request {
  user: { id: string; role: string; email: string };
}

@Controller()
export class CertificatesController {
  constructor(private readonly svc: CertificatesService) {}

  // ── Pública, sin autenticación: usada por la página /verificar ──
  @Get('certificates/verify/:ref')
  verify(@Param('ref') ref: string) {
    return this.svc.verifyPublic(ref);
  }

  @UseGuards(JwtAuthGuard)
  @Get('certificates/mine')
  listMine(@Request() req: Req) {
    return this.svc.listMine(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('certificates/validation-logs')
  validationLogs(@Request() req: Req) {
    return this.svc.listValidationLogs(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('certificates')
  list(
    @Query('participant_id') participantId: string,
    @Query('course_id') courseId: string,
    @Request() req: Req,
  ) {
    return this.svc.list(req.user, { participant_id: participantId, course_id: courseId });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('certificates/:id/revoke')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeCertificateDto,
    @Request() req: Req,
  ) {
    return this.svc.revoke(id, dto.reason, req.user);
  }

  // ── Trámite de certificado (certificate_requests) ──
  @UseGuards(JwtAuthGuard)
  @Get('certificate-requests')
  listRequests(@Query('process_id') processId: string, @Request() req: Req) {
    return this.svc.listRequests(req.user, processId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('certificate-requests')
  @HttpCode(HttpStatus.CREATED)
  createRequest(@Body() dto: CreateCertificateRequestDto, @Request() req: Req) {
    return this.svc.createRequest(dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('certificate-requests/:id/review')
  reviewRequest(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewCertificateRequestDto, @Request() req: Req) {
    return this.svc.reviewRequest(id, dto, req.user);
  }
}
