import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SubmitFichaRegistroDto } from './dto/submit-ficha-registro.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/login
   * Body: { email, password }
   * Response: { accessToken, refreshToken, user }
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /api/auth/register
   * Body: { full_name, email, password, phone?, role?, institution_name? }
   * Response: { accessToken, refreshToken, user }
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * GET /api/auth/me
   * Header: Authorization: Bearer <token>
   * Response: SafeUser
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.id);
  }

  /**
   * PATCH /api/auth/me/ficha-registro
   * Header: Authorization: Bearer <token>
   * Body: { ...campos de la ficha } — se guarda tal cual en ficha_registro_data.
   * Ficha de registro GENERAL de la cuenta (no ligada a una certificación en
   * particular): se llena una sola vez, justo después de crear la cuenta.
   * Response: SafeUser (ya con ficha_registro_submitted_at actualizado)
   */
  @Patch('me/ficha-registro')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  submitFichaRegistro(@Body() dto: SubmitFichaRegistroDto, @Request() req: AuthenticatedRequest) {
    return this.authService.submitFichaRegistro(req.user.id, dto.form_data);
  }

  /**
   * GET /api/auth/me/ficha-registro
   * Header: Authorization: Bearer <token>
   * Devuelve la Ficha de Registro del propio usuario autenticado.
   * Disponible para cualquier rol (el usuario ve su propia ficha).
   */
  @Get('me/ficha-registro')
  @UseGuards(JwtAuthGuard)
  getMyFichaRegistro(@Request() req: AuthenticatedRequest) {
    return this.authService.getMyFichaRegistro(req.user.id);
  }

  /**
   * POST /api/auth/me/change-password
   * Header: Authorization: Bearer <token>
   * Body: { current_password, new_password, confirm_password }
   * Permite al usuario cambiar su propia contraseña.
   * Verifica la contraseña actual antes de actualizar.
   */
  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  changePassword(@Body() dto: ChangePasswordDto, @Request() req: AuthenticatedRequest) {
    return this.authService.changePassword(
      req.user.id,
      dto.current_password,
      dto.new_password,
      dto.confirm_password,
    );
  }

  /**
   * POST /api/auth/logout
   * Header: Authorization: Bearer <token>
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout(@Request() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.id);
  }
}
