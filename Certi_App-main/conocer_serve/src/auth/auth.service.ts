import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

// Tipos que coinciden con public.users
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN_INSTITUCION'
  | 'COORDINADOR'
  | 'INSTRUCTOR'
  | 'OPERADOR';

export interface DbUser {
  id: string;
  institution_id: string | null;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  refresh_token_hash: string | null;
  created_at: string;
  updated_at: string;
}

export type SafeUser = Omit<DbUser, 'password_hash' | 'refresh_token_hash'>;

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    // 1. Buscar usuario en public.users
    const { data: user, error } = await this.supabaseService.admin
      .from('users')
      .select('*')
      .eq('email', dto.email.toLowerCase().trim())
      .eq('is_active', true)
      .single<DbUser>();

    if (error || !user) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    // 2. Verificar contraseña con bcrypt
    const passwordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    // 3. Generar tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // 4. Guardar hash del refresh token en la BD
    await this.saveRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  // ─── Registro ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    // 1. Verificar que el email no exista
    const { data: existing } = await this.supabaseService.admin
      .from('users')
      .select('id')
      .eq('email', dto.email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email.');
    }

    // 2. Hashear contraseña
    const password_hash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // 3. Insertar en public.users
    const { data: newUser, error } = await this.supabaseService.admin
      .from('users')
      .insert({
        email: dto.email.toLowerCase().trim(),
        password_hash,
        full_name: dto.full_name,
        role: dto.role ?? 'OPERADOR',
        phone: dto.phone ?? null,
        institution_id: dto.institution_id ?? null,
        is_active: true,
      })
      .select('*')
      .single<DbUser>();

    if (error || !newUser) {
      throw new InternalServerErrorException('Error al crear el usuario: ' + (error?.message ?? ''));
    }

    // 4. Generar tokens y guardar refresh
    const { accessToken, refreshToken } = await this.generateTokens(newUser);
    await this.saveRefreshToken(newUser.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(newUser),
    };
  }

  // ─── Obtener perfil por id (para GET /auth/me) ────────────────────────────

  async getMe(userId: string): Promise<SafeUser> {
    const { data: user, error } = await this.supabaseService.admin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single<DbUser>();

    if (error || !user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return this.sanitizeUser(user);
  }

  // ─── Refresh token ────────────────────────────────────────────────────────

  async refreshTokens(userId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const { data: user, error } = await this.supabaseService.admin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single<DbUser>();

    if (error || !user || !user.refresh_token_hash) {
      throw new UnauthorizedException('Acceso denegado.');
    }

    const tokenValid = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!tokenValid) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<{ message: string }> {
    // Limpiar el refresh token en la BD
    await this.supabaseService.admin
      .from('users')
      .update({ refresh_token_hash: null })
      .eq('id', userId);

    return { message: 'Sesión cerrada correctamente.' };
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async generateTokens(user: DbUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      institution_id: user.institution_id,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '15m') as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as StringValue,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, this.SALT_ROUNDS);
    await this.supabaseService.admin
      .from('users')
      .update({ refresh_token_hash: hash })
      .eq('id', userId);
  }

  private sanitizeUser(user: DbUser): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, refresh_token_hash, ...safe } = user;
    return safe;
  }
}
