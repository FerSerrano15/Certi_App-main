import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { ParticipantsModule } from './participants/participants.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { EnrollmentFormsModule } from './enrollment-forms/enrollment-forms.module';
import { CertificationsModule } from './certifications/certifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { DocumentsModule } from './documents/documents.module';
import { CertificatesModule } from './certificates/certificates.module';
import { LandingContentModule } from './landing-content/landing-content.module';
import { PdfModule } from './pdf/pdf.module';
import { EstandaresModule } from './estandares/estandares.module';
import { EvaluacionesModule } from './evaluaciones/evaluaciones.module';
import { FichaRegistroModule } from './ficha-registro/ficha-registro.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SolicitudesModule } from './solicitudes/solicitudes.module';
import { CertificationProcessModule } from './certification-process/certification-process.module';
import { EvidencesModule } from './evidences/evidences.module';

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
    ParticipantsModule,
    EnrollmentsModule,
    AttendanceModule,
    EnrollmentFormsModule,
    CertificationsModule,
    AuditLogsModule,
    DocumentsModule,
    CertificatesModule,
    LandingContentModule,
    PdfModule,
    EstandaresModule,
    EvaluacionesModule,
    NotificationsModule,
    FichaRegistroModule,
    SolicitudesModule,
    CertificationProcessModule,
    EvidencesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
