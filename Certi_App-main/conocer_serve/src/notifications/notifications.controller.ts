import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface Req extends Request {
  user: { id: string; role: string };
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // GET /notifications?unread=true&limit=50
  @Get()
  list(
    @Query('unread') unread: string | undefined,
    @Query('limit') limit: string | undefined,
    @Request() req: Req,
  ) {
    return this.svc.list(req.user, unread === 'true', limit ? Number(limit) : undefined);
  }

  // GET /notifications/unread-count
  @Get('unread-count')
  unreadCount(@Request() req: Req) {
    return this.svc.unreadCount(req.user);
  }

  // PATCH /notifications/:id/read
  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.markRead(id, req.user);
  }
}
