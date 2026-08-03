import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EnrollmentFormsService } from './enrollment-forms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEnrollmentFormDto } from './dto/create-enrollment-form.dto';

@UseGuards(JwtAuthGuard)
@Controller('enrollment-forms')
export class EnrollmentFormsController {
  constructor(private readonly svc: EnrollmentFormsService) {}

  // POST /enrollment-forms — crear o actualizar un formulario
  @Post()
  @HttpCode(HttpStatus.OK)
  upsert(@Body() dto: CreateEnrollmentFormDto, @Request() req: any) {
    return this.svc.upsert(dto, req.user.sub);
  }

  // GET /enrollment-forms/all — vista admin con datos de participante
  @Get('all')
  getAllWithParticipant(@Request() req: any) {
    return this.svc.getAllWithParticipant(req.user.sub);
  }

  // GET /enrollment-forms/status/:enrollmentId — estado de formularios de una inscripción
  @Get('status/:enrollmentId')
  getStatus(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Request() req: any,
  ) {
    return this.svc.getMyFormStatus(enrollmentId, req.user.sub);
  }

  // GET /enrollment-forms/:enrollmentId — todos los formularios de una inscripción (admin)
  @Get(':enrollmentId')
  getByEnrollment(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Request() req: any,
  ) {
    return this.svc.getByEnrollment(enrollmentId, req.user.sub);
  }

  // GET /enrollment-forms/:enrollmentId/:type — formulario específico (admin)
  @Get(':enrollmentId/:type')
  getOne(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Param('type') formType: string,
    @Request() req: any,
  ) {
    return this.svc.getOne(enrollmentId, formType, req.user.sub);
  }

  // DELETE /enrollment-forms/:id — solo SUPER_ADMIN
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    return this.svc.remove(id, req.user.sub);
  }
}
