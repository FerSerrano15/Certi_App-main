import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditLogsController {
  constructor(private readonly svc: AuditLogsService) {}

  @Get()
  list(
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Request() req: Req,
  ) {
    return this.svc.list(req.user, limit ? +limit : undefined, offset ? +offset : undefined);
  }
}
