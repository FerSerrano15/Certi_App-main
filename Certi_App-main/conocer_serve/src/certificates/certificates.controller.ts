import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';

interface Req extends Request {
  user: { id: string; role: string; institution_id: string | null; email: string };
}

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly svc: CertificatesService) {}

  // ── Pública, sin autenticación: usada por la página /verificar ──
  @Get('verify/:ref')
  verify(@Param('ref') ref: string) {
    return this.svc.verifyPublic(ref);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  listMine(@Request() req: Req) {
    return this.svc.listMine(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('validation-logs')
  validationLogs(@Request() req: Req) {
    return this.svc.listValidationLogs(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Query('participant_id') participantId: string,
    @Query('course_id') courseId: string,
    @Request() req: Req,
  ) {
    return this.svc.list(req.user, { participant_id: participantId, course_id: courseId });
  }

  @UseGuards(JwtAuthGuard)
  @Post('issue')
  @HttpCode(HttpStatus.CREATED)
  issue(@Body() dto: IssueCertificateDto, @Request() req: Req) {
    return this.svc.issue(dto.enrollment_id, !!dto.force, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/revoke')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeCertificateDto,
    @Request() req: Req,
  ) {
    return this.svc.revoke(id, dto.reason, req.user);
  }
}
