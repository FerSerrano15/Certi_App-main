import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { DeleteUserDto } from './dto/delete-user.dto';

const AVATAR_UPLOAD_OPTIONS = {
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
};

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('users')
@UseGuards(JwtAuthGuard)   // Todas las rutas de usuarios requieren JWT
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users
   * Lista todos los usuarios (admin)
   */
  @Get()
  findAll(@Request() req: AuthenticatedRequest) {
    return this.usersService.findAll(req.user);
  }

  /**
   * GET /api/users/:id
   * Obtener un usuario por ID
   */
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.findOne(id, req.user);
  }

  /**
   * GET /api/users/:id/ficha-registro
   * Devuelve la Ficha de Registro general (llenada tras el alta de cuenta)
   * de un usuario, para que el admin la descargue en PDF.
   */
  @Get(':id/ficha-registro')
  getFichaRegistro(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.getFichaRegistro(id, req.user);
  }

  /**
   * PATCH /api/users/:id
   * Actualizar datos de un usuario
   * Body: { full_name?, phone?, role?, is_active?, institution_name? }
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.update(id, body as Parameters<UsersService['update']>[1], req.user);
  }

  /**
   * POST /api/users/:id/avatar
   * Sube (o reemplaza) la foto de perfil. El propio usuario puede cambiar la
   * suya; un admin puede cambiar la de cualquiera. Body: multipart/form-data
   * con el campo "file" (JPG/PNG/WEBP, máx. 5 MB).
   */
  @Post(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', AVATAR_UPLOAD_OPTIONS))
  uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('face_check') faceCheck: string | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.uploadAvatar(id, file, req.user, faceCheck);
  }

  /**
   * PATCH /api/users/:id/avatar-review
   * Un admin valida o rechaza la foto de perfil de un usuario.
   * Body: { action: 'validated' | 'rejected' }
   */
  @Patch(':id/avatar-review')
  @HttpCode(HttpStatus.OK)
  reviewAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('action') action: 'validated' | 'rejected',
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.reviewAvatar(id, action, req.user);
  }

  /**
   * PATCH /api/users/:id/toggle-active
   * Activar o desactivar un usuario
   */
  @Patch(':id/toggle-active')
  @HttpCode(HttpStatus.OK)
  toggleActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.toggleActive(id, req.user);
  }

  /**
   * PATCH /api/users/:id/role
   * Cambiar el rol de un usuario
   * Body: { role: 'SUPER_ADMIN' | 'ADMIN' | 'EVALUADOR' | 'CANDIDATO' }
   */
  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('role') role: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.changeRole(id, role, req.user);
  }

  /**
   * PATCH /api/users/:id/reset-password
   * Restablece la contraseña de otro usuario. Solo SUPER_ADMIN.
   * Body: { new_password: string }
   * Nota: no existe forma de "recuperar" la contraseña original (se guarda
   * como hash bcrypt, irreversible) — esto la reemplaza por una nueva y
   * cierra la sesión activa del usuario afectado en todos sus dispositivos.
   */
  @Patch(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.resetPassword(id, dto.new_password, req.user);
  }

  /**
   * DELETE /api/users/:id
   * Elimina permanentemente a un usuario. Solo SUPER_ADMIN.
   * Body: { password: string } — la propia contraseña del SUPER_ADMIN, para confirmar.
   * No permite auto-eliminarse. Si el usuario tiene actividad asociada
   * (cursos, certificados, documentos, auditoría, etc.) se rechaza con un
   * mensaje claro en vez de romper la integridad de esos registros.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteUserDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.deleteUser(id, dto.password, req.user);
  }
}
