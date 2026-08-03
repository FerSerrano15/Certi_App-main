import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { ParticipantsModule } from './participants/participants.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { EnrollmentFormsModule } from './enrollment-forms/enrollment-forms.module';
import { CertificationsModule } from './certifications/certifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { DocumentsModule } from './documents/documents.module';
import { CertificatesModule } from './certificates/certificates.module';
import { LandingContentModule } from './landing-content/landing-content.module';

@Module({
  imports: [
    // Carga las variables de entorno desde .env globalmente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Módulo de Supabase (global — disponible en todos los módulos)
    SupabaseModule,
    // Módulos de funcionalidad
    AuthModule,
    UsersModule,
    CoursesModule,
    InstitutionsModule,
    ParticipantsModule,
    EnrollmentsModule,
    AttendanceModule,
    EnrollmentFormsModule,
    CertificationsModule,
    AuditLogsModule,
    DocumentsModule,
    CertificatesModule,
    LandingContentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
