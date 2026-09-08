import { Body, Controller, Get, Put, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { LandingContentService } from './landing-content.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller('landing')
export class LandingContentController {
  constructor(private readonly svc: LandingContentService) {}

  // Pública: la consume el home para renderizarse.
  @Get()
  get() {
    return this.svc.getContent();
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  update(@Body() body: { data?: Record<string, unknown> }, @Request() req: Req) {
    if (!body?.data || typeof body.data !== 'object') {
      throw new BadRequestException('Falta el campo "data" con el contenido del landing page.');
    }
    return this.svc.updateContent(body.data, req.user);
  }
}
