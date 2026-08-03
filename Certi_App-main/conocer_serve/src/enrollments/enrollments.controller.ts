import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { SelfEnrollDto } from './dto/self-enroll.dto';

interface Req extends Request {
  user: { id: string; role: string; institution_id: string | null; email: string };
}

@Controller('enrollments')
@UseGuards(JwtAuthGuard)
export class EnrollmentsController {
  constructor(private readonly svc: EnrollmentsService) {}

  @Get()
  list(
    @Query('group_id')       groupId: string,
    @Query('participant_id') participantId: string,
    @Request() req: Req,
  ) {
    return this.svc.listEnrollments(req.user, groupId, participantId);
  }

  @Get('stats/:groupId')
  stats(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.svc.getGroupStats(groupId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getEnrollment(id);
  }

  @Post('self')
  @HttpCode(HttpStatus.CREATED)
  selfEnroll(@Body() dto: SelfEnrollDto, @Request() req: Req) {
    return this.svc.selfEnroll(dto.group_id, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEnrollmentDto, @Request() req: Req) {
    return this.svc.createEnrollment(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateEnrollmentDto>,
    @Request() req: Req,
  ) {
    return this.svc.updateEnrollment(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.deleteEnrollment(id, req.user);
  }
}
