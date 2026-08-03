import {
  Controller,
  Get,
  Patch,
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

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string; institution_id: string | null };
}

@Controller('users')
@UseGuards(JwtAuthGuard)   // Todas las rutas de usuarios requieren JWT
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users
   * Lista todos los usuarios (admin/coordinador)
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
   * PATCH /api/users/:id
   * Actualizar datos de un usuario
   * Body: { full_name?, phone?, role?, is_active?, institution_id? }
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
   * Body: { role: 'SUPER_ADMIN' | 'ADMIN_INSTITUCION' | 'COORDINADOR' | 'INSTRUCTOR' | 'OPERADOR' }
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
}
