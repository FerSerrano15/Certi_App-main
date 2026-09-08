import {
  Controller, Get, Post, Patch,
  Body, Param, Request, UseGuards, UseInterceptors,
  UploadedFile, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EvidencesService } from './evidences.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { ReviewEvidenceDto } from './dto/review-evidence.dto';

interface Req extends Request {
  user: { id: string; role: string; email: string };
}

const UPLOAD_OPTIONS = {
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
    cb(null, allowed.includes(file.mimetype));
  },
};

@Controller('certification-process/:processId/evidences')
@UseGuards(JwtAuthGuard)
export class EvidencesController {
  constructor(private readonly svc: EvidencesService) {}

  @Get()
  list(@Param('processId', ParseUUIDPipe) processId: string, @Request() req: Req) {
    return this.svc.list(processId, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', UPLOAD_OPTIONS))
  upload(
    @Param('processId', ParseUUIDPipe) processId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEvidenceDto,
    @Request() req: Req,
  ) {
    return this.svc.upload(processId, file, dto, req.user);
  }

  @Get(':id/url')
  getUrl(@Param('processId', ParseUUIDPipe) processId: string, @Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getSignedUrl(id, req.user);
  }

  @Patch(':id')
  review(
    @Param('processId', ParseUUIDPipe) processId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewEvidenceDto,
    @Request() req: Req,
  ) {
    return this.svc.review(id, dto, req.user);
  }
}
