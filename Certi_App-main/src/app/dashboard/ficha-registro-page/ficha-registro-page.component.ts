import {
  Component, inject, signal, OnInit,
  ElementRef, ViewChild, OnDestroy, output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { EnrollmentFormsService } from '../../core/services/enrollment-forms.service';
import { ParticipantsService } from '../../core/services/participants.service';

@Component({
  selector: 'app-ficha-registro-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ficha-registro-page.component.html',
  styleUrl: './ficha-registro-page.component.css',
})
export class FichaRegistroPageComponent implements OnInit, OnDestroy {
  private readonly fb       = inject(FormBuilder);
  private readonly auth     = inject(AuthService);
  private readonly frmsSvc  = inject(EnrollmentFormsService);
  private readonly partSvc  = inject(ParticipantsService);

  /** Emite cuando el formulario fue guardado con éxito */
  saved = output<void>();

  // ─── State ───────────────────────────────────────────────────────────────
  loading       = signal(false);
  toast         = signal('');
  toastType     = signal<'success' | 'error' | 'info'>('info');
  submitted     = signal(false);
  enrollmentId  = signal<string | null>(null);
  loadingEnroll = signal(true);

  // ─── Canvas de firma ────────────────────────────────────────────────────
  @ViewChild('sigCanvas') sigCanvas!: ElementRef<HTMLCanvasElement>;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  firmaBase64 = signal<string | null>(null);
  canvasReady = signal(false);

  // ─── Si/No options ───────────────────────────────────────────────────────
  readonly siNoOpts = [
    { value: 'Sí', label: 'Sí' },
    { value: 'No', label: 'No' },
  ];

  // ─── Formulario ─────────────────────────────────────────────────────────
  form!: FormGroup;

  // ─── Secciones colapsables ───────────────────────────────────────────────
  sections = signal({
    estandar:      true,
    personales:    true,
    domicilio:     false,
    contacto:      false,
    renap:         false,
    complementaria:false,
    firma:         false,
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  ngOnInit() {
    const user = this.auth.currentUser();
    this.buildForm(user?.full_name ?? '', user?.email ?? '', user?.phone ?? '');
    this.loadFirstEnrollment();
  }

  ngOnDestroy() {
    this.drawing = false;
  }

  private buildForm(name: string, email: string, phone: string) {
    this.form = this.fb.group({
      // Estándar
      estandarCompetencia: ['', Validators.required],
      estandarCodigo:      ['', Validators.required],
      fechaRegistro:       [new Date().toISOString().slice(0, 10), Validators.required],
      // Datos personales
      nombreCompleto:  [name,  Validators.required],
      lugarNacimiento: ['',    Validators.required],
      nacionalidad:    ['Mexicana', Validators.required],
      curp:            ['',    Validators.required],
      genero:          ['',    Validators.required],
      fechaNacimiento: ['',    Validators.required],
      // Domicilio
      calle:             ['', Validators.required],
      numero:            ['', Validators.required],
      cp:                ['', Validators.required],
      colonia:           ['', Validators.required],
      ciudad:            ['', Validators.required],
      entidadFederativa: ['', Validators.required],
      // Contacto
      email:           [email, [Validators.required, Validators.email]],
      telefono:        [phone, Validators.required],
      telefonoCelular: [''],
      // RENAP
      consentimientoRenap: ['', Validators.required],
      // Complementaria
      sabeLeerEscribir:     ['', Validators.required],
      cuentaEstudios:       ['', Validators.required],
      cualesEstudios:       [''],
      tieneDiscapacidad:    ['', Validators.required],
      discapacidadMotriz:        [false],
      discapacidadVisual:        [false],
      discapacidadAuditiva:      [false],
      discapacidadLenguaje:      [false],
      discapacidadIntelectual:   [false],
      discapacidadOtras:         [false],
      idiomas:              ['Español'],
      trabajaActualmente:   ['', Validators.required],
      puestoTrabajo:        [''],
      experienciaLaboral:   [''],
      observaciones:        [''],
      cuentaCertificacion:  ['', Validators.required],
      cualesCertificaciones:[''],
    });
  }

  private async loadFirstEnrollment() {
    this.loadingEnroll.set(true);
    const user = this.auth.currentUser();
    if (!user?.email) { this.loadingEnroll.set(false); return; }

    try {
      const parts = await this.partSvc.getParticipants(user.email);
      const me = parts.find(p => p.email === user.email || p.user_id === user.id) ?? parts[0];
      if (me) {
        const enrs = await this.partSvc.getEnrollments(undefined, me.id);
        if (enrs.length > 0) {
          this.enrollmentId.set(enrs[0].id);
          // Pre-llenar código/nombre del estándar desde la inscripción
          const e = enrs[0] as any;
          const courseName = e.groups?.courses?.name ?? '';
          const courseCode = e.groups?.courses?.code ?? '';
          if (courseName) this.form.patchValue({ estandarCompetencia: courseName });
          if (courseCode) this.form.patchValue({ estandarCodigo: courseCode });
        }
      }
    } catch { /* silently ignore */ }
    this.loadingEnroll.set(false);
  }

  // ─── Secciones ─────────────────────────────────────────────────────────
  toggleSection(key: 'estandar' | 'personales' | 'domicilio' | 'contacto' | 'renap' | 'complementaria' | 'firma') {
    this.sections.update(s => ({ ...s, [key]: !s[key] }));
    // Inicializar canvas si se abre la sección de firma
    if (key === 'firma' && !this.sections()[key]) {
      setTimeout(() => this.initCanvas(), 150);
    }
  }

  openFirmaSection() {
    this.sections.update(s => ({ ...s, firma: true }));
    setTimeout(() => this.initCanvas(), 150);
  }

  // ─── Canvas de firma ────────────────────────────────────────────────────
  initCanvas() {
    const canvas = this.sigCanvas?.nativeElement;
    if (!canvas || this.canvasReady()) return;

    // Ajustar resolución al DPR
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.scale(dpr, dpr);
    this.ctx.strokeStyle = '#1a1a2e';
    this.ctx.lineWidth   = 2.5;
    this.ctx.lineCap     = 'round';
    this.ctx.lineJoin    = 'round';
    this.canvasReady.set(true);

    const getPos = (e: MouseEvent | Touch) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e instanceof Touch ? e.clientX : e.clientX) - r.left,
        y: (e instanceof Touch ? e.clientY : e.clientY) - r.top,
      };
    };

    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault(); this.drawing = true;
      const p = getPos(e); this.ctx!.beginPath(); this.ctx!.moveTo(p.x, p.y);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.drawing) return;
      const p = getPos(e); this.ctx!.lineTo(p.x, p.y); this.ctx!.stroke();
    });
    canvas.addEventListener('mouseup',    () => { this.drawing = false; this.captureSignature(); });
    canvas.addEventListener('mouseleave', () => { this.drawing = false; });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.drawing = true;
      const p = getPos(e.touches[0]); this.ctx!.beginPath(); this.ctx!.moveTo(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.drawing) return;
      const p = getPos(e.touches[0]); this.ctx!.lineTo(p.x, p.y); this.ctx!.stroke();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this.drawing = false; this.captureSignature(); });
  }

  captureSignature() {
    const canvas = this.sigCanvas?.nativeElement;
    if (!canvas) return;
    this.firmaBase64.set(canvas.toDataURL('image/png'));
  }

  clearSignature() {
    const canvas = this.sigCanvas?.nativeElement;
    if (!canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);
    this.firmaBase64.set(null);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  f(name: string) { return this.form.get(name); }
  invalid(name: string) { return this.f(name)?.invalid && this.f(name)?.touched; }

  // ─── Guardar ─────────────────────────────────────────────────────────────
  async onSubmit() {
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.showToast('⚠️ Completa todos los campos obligatorios antes de continuar.', 'error');
      // Abrir todas las secciones para que el usuario vea los errores
      this.sections.set({
        estandar:      true,
        personales:    true,
        domicilio:     true,
        contacto:      true,
        renap:         true,
        complementaria:true,
        firma:         true,
      });
      return;
    }

    if (!this.firmaBase64()) {
      this.sections.update(s => ({ ...s, firma: true }));
      setTimeout(() => this.initCanvas(), 150);
      this.showToast('⚠️ Dibuja tu firma antes de enviar.', 'error');
      return;
    }

    const eid = this.enrollmentId();
    if (!eid) {
      this.showToast('⚠️ No tienes una inscripción activa. Solicita una inscripción primero.', 'error');
      return;
    }

    this.loading.set(true);
    const formData = { ...this.form.value, firma: this.firmaBase64() };
    const result = await this.frmsSvc.upsert(eid, 'ficha_registro', formData);
    this.loading.set(false);

    if (result) {
      this.submitted.set(true);
      this.showToast('✅ ¡Ficha de Registro enviada exitosamente!', 'success');
      setTimeout(() => this.saved.emit(), 2000);
    } else {
      this.showToast('❌ Error al guardar. Verifica tu conexión e intenta de nuevo.', 'error');
    }
  }

  private showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    this.toast.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toast.set(''), 4500);
  }

  get user() { return this.auth.currentUser(); }
}
