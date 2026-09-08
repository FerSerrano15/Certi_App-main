import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { DeleteUserDto } from './dto/delete-user.dto';

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
