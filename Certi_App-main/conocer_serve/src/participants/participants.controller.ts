import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateParticipantDto } from './dto/create-participant.dto';

interface Req extends Request {
  user: { id: string; role: string; email: string };
}

@Controller('participants')
@UseGuards(JwtAuthGuard)
export class ParticipantsController {
  constructor(private readonly svc: ParticipantsService) {}

  @Get()
  list(@Query('search') search: string, @Request() req: Req) {
    return this.svc.listParticipants(req.user, search);
  }

  @Get('eligible-for-group')
  eligibleForGroup(@Query('group_id') groupId: string, @Request() req: Req) {
    return this.svc.getEligibleForGroup(groupId, req.user);
  }

  // Debe ir ANTES de @Get(':id') — si no, Nest intenta interpretar "by-user"
  // como si fuera un :id y ParseUUIDPipe lo rechaza con 400.
  @Get('by-user/:userId')
  findByUser(@Param('userId', ParseUUIDPipe) userId: string, @Request() req: Req) {
    return this.svc.findByUserId(userId, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getParticipant(id, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateParticipantDto, @Request() req: Req) {
    return this.svc.createParticipant(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateParticipantDto>,
    @Request() req: Req,
  ) {
    return this.svc.updateParticipant(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.deleteParticipant(id, req.user);
  }
}
