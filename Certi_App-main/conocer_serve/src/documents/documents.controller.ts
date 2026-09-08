import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards, UseInterceptors,
  UploadedFile, HttpCode, HttpStatus, ParseUUIDPipe, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';

interface Req extends Request {
  user: { id: string; role: string; email: string };
}

const UPLOAD_OPTIONS = {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
};

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  list(@Query('participant_id') participantId: string, @Request() req: Req) {
    return this.svc.list(req.user, participantId);
  }

  @Get(':id/url')
  getUrl(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getSignedUrl(id, req.user);
  }

  @Post('self')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', UPLOAD_OPTIONS))
  uploadSelf(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentDto,
    @Request() req: Req,
  ) {
    return this.svc.uploadSelf(file, dto.type, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', UPLOAD_OPTIONS))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentDto,
    @Request() req: Req,
  ) {
    if (!dto.participant_id) {
      throw new BadRequestException('participant_id es requerido.');
    }
    return this.svc.uploadForParticipant(file, { type: dto.type, participant_id: dto.participant_id }, req.user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentStatusDto,
    @Request() req: Req,
  ) {
    return this.svc.updateStatus(id, dto.status, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.remove(id, req.user);
  }
}
