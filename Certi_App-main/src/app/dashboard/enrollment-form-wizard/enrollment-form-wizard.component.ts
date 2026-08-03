import {
  Component, inject, signal, input, output,
  OnInit, AfterViewInit, ElementRef, ViewChild, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { EnrollmentFormsService } from '../../core/services/enrollment-forms.service';
import { Participant } from '../../core/services/participants.service';
import { Enrollment } from '../../core/services/participants.service';

type WizardStep = 1 | 2;

@Component({
  selector: 'app-enrollment-form-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './enrollment-form-wizard.component.html',
  styleUrl: './enrollment-form-wizard.component.css',
})
export class EnrollmentFormWizardComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly svc = inject(EnrollmentFormsService);
  private readonly fb  = inject(FormBuilder);

  // ─── Inputs / Outputs ────────────────────────────────────────────────────
  enrollment    = input.required<Enrollment>();
  participant   = input.required<Participant>();
  initialStep   = input<WizardStep>(1);
  closed        = output<void>();
  saved         = output<void>();

  // ─── State ───────────────────────────────────────────────────────────────
  step    = signal<WizardStep>(1);
  loading = signal(false);
  toast   = signal('');
  step1Done = signal(false);
  step2Done = signal(false);

  // ─── Canvas de firma ────────────────────────────────────────────────────
  @ViewChild('sigCanvas1') sigCanvas1!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sigCanvas2') sigCanvas2!: ElementRef<HTMLCanvasElement>;

  private ctx1: CanvasRenderingContext2D | null = null;
  private ctx2: CanvasRenderingContext2D | null = null;
  private drawing1 = false;
  private drawing2 = false;
  firma1Base64 = signal<string | null>(null);
  firma2Base64 = signal<string | null>(null);

  // ─── Formulario Carta de Solicitud ──────────────────────────────────────
  cartaForm!: FormGroup;

  // ─── Formulario Ficha de Registro ───────────────────────────────────────
  fichaForm!: FormGroup;

  // ─── SI/NO options ───────────────────────────────────────────────────────
  readonly siNoOpts = [
    { value: 'Sí', label: 'Sí' },
    { value: 'No', label: 'No' },
  ];

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  ngOnInit() {
    // Respect initialStep input (e.g., open directly on ficha de registro)
    if (this.initialStep() === 2) {
      this.step.set(2);
      this.step1Done.set(true); // mark step 1 as done so the indicator looks correct
    }
    const p = this.participant();
    const e = this.enrollment() as any;
    const courseName = e.groups?.courses?.name ?? '';
    const courseCode = e.groups?.courses?.code ?? '';

    // Carta de Solicitud — pre-llenar con datos del participante
    this.cartaForm = this.fb.group({
      fecha:         [new Date().toISOString().slice(0, 10), Validators.required],
      estandarCodigo:[courseCode, Validators.required],
      estandarNombre:[courseName, Validators.required],
      nombreCompleto:[p.full_name ?? '', Validators.required],
    });

    // Ficha de Registro — pre-llenar con datos del participante
    this.fichaForm = this.fb.group({
      // Estándar
      estandarCompetencia:[courseName, Validators.required],
      estandarCodigo:     [courseCode, Validators.required],
      fechaRegistro:      [new Date().toISOString().slice(0, 10), Validators.required],
      // Datos personales
      nombreCompleto: [p.full_name ?? '', Validators.required],
      lugarNacimiento:['', Validators.required],
      nacionalidad:   ['Mexicana', Validators.required],
      curp:           [p.national_id ?? '', Validators.required],
      genero:         ['', Validators.required],
      fechaNacimiento:['', Validators.required],
      // Domicilio
      calle:          ['', Validators.required],
      numero:         ['', Validators.required],
      cp:             ['', Validators.required],
      colonia:        ['', Validators.required],
      ciudad:         ['', Validators.required],
      entidadFederativa:['', Validators.required],
      // Contacto
      email:          [p.email ?? '', [Validators.required, Validators.email]],
      telefono:       [p.phone ?? '', Validators.required],
      telefonoCelular:[''],
      // RENAP
      consentimientoRenap:['', Validators.required],
      // Confidencial
      sabeLeerEscribir:   ['', Validators.required],
      cuentaEstudios:     ['', Validators.required],
      cualesEstudios:     [''],
      tieneDiscapacidad:  ['', Validators.required],
      discapacidadMotriz:         [false],
      discapacidadVisual:         [false],
      discapacidadAuditiva:       [false],
      discapacidadLenguaje:       [false],
      discapacidadIntelectual:    [false],
      discapacidadOtras:          [false],
      idiomas:        ['Español'],
      trabajaActualmente:['', Validators.required],
      puestoTrabajo:  [''],
      experienciaLaboral:[''],
      observaciones:  [''],
      cuentaCertificacion:['', Validators.required],
      cualesCertificaciones:[''],
    });
  }

  ngAfterViewInit() {
    // El canvas se inicializa cuando el step es visible
  }

  ngOnDestroy() {
    this.cleanupCanvas();
  }

  // ─── Navegación de pasos ─────────────────────────────────────────────────
  goToStep(s: WizardStep) { this.step.set(s); }

  // ─── Canvas de firma ────────────────────────────────────────────────────
  initCanvas(step: WizardStep) {
    setTimeout(() => {
      if (step === 1 && this.sigCanvas1?.nativeElement) {
        this.ctx1 = this.sigCanvas1.nativeElement.getContext('2d');
        this.setupCanvas(this.sigCanvas1.nativeElement, this.ctx1!, step);
      }
      if (step === 2 && this.sigCanvas2?.nativeElement) {
        this.ctx2 = this.sigCanvas2.nativeElement.getContext('2d');
        this.setupCanvas(this.sigCanvas2.nativeElement, this.ctx2!, step);
      }
    }, 100);
  }

  private setupCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, step: WizardStep) {
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e instanceof Touch ? e.clientX : e.clientX) - rect.left,
        y: (e instanceof Touch ? e.clientY : e.clientY) - rect.top,
      };
    };

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      if (step === 1) this.drawing1 = true;
      else this.drawing2 = true;
    });

    canvas.addEventListener('mousemove', (e) => {
      e.preventDefault();
      const isDrawing = step === 1 ? this.drawing1 : this.drawing2;
      if (!isDrawing) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => {
      if (step === 1) { this.drawing1 = false; this.captureSignature(1); }
      else { this.drawing2 = false; this.captureSignature(2); }
    });

    canvas.addEventListener('mouseleave', () => {
      if (step === 1) { this.drawing1 = false; }
      else { this.drawing2 = false; }
    });

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const pos = getPos(e.touches[0]);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      if (step === 1) this.drawing1 = true;
      else this.drawing2 = true;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const isDrawing = step === 1 ? this.drawing1 : this.drawing2;
      if (!isDrawing) return;
      const pos = getPos(e.touches[0]);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      if (step === 1) { this.drawing1 = false; this.captureSignature(1); }
      else { this.drawing2 = false; this.captureSignature(2); }
    });
  }

  captureSignature(step: WizardStep) {
    const canvas = step === 1 ? this.sigCanvas1?.nativeElement : this.sigCanvas2?.nativeElement;
    if (!canvas) return;
    const b64 = canvas.toDataURL('image/png');
    if (step === 1) this.firma1Base64.set(b64);
    else this.firma2Base64.set(b64);
  }

  clearSignature(step: WizardStep) {
    const canvas = step === 1 ? this.sigCanvas1?.nativeElement : this.sigCanvas2?.nativeElement;
    const ctx = step === 1 ? this.ctx1 : this.ctx2;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (step === 1) this.firma1Base64.set(null);
    else this.firma2Base64.set(null);
  }

  private cleanupCanvas() {
    this.drawing1 = false;
    this.drawing2 = false;
  }

  // ─── Guardar Carta de Solicitud (Step 1) ─────────────────────────────────
  async saveStep1() {
    if (this.cartaForm.invalid) {
      this.cartaForm.markAllAsTouched();
      return;
    }
    if (!this.firma1Base64()) {
      this.showToast('⚠️ Por favor dibuja tu firma antes de continuar');
      return;
    }
    this.loading.set(true);
    const formData = {
      ...this.cartaForm.value,
      firma: this.firma1Base64(),
    };
    const result = await this.svc.upsert(
      this.enrollment().id,
      'carta_solicitud',
      formData,
    );
    this.loading.set(false);
    if (result) {
      this.step1Done.set(true);
      this.showToast('✅ Carta de Solicitud guardada');
      setTimeout(() => this.step.set(2), 800);
    } else {
      this.showToast('❌ Error al guardar. Intenta de nuevo.');
    }
  }

  // ─── Guardar Ficha de Registro (Step 2) ──────────────────────────────────
  async saveStep2() {
    if (this.fichaForm.invalid) {
      this.fichaForm.markAllAsTouched();
      return;
    }
    if (!this.firma2Base64()) {
      this.showToast('⚠️ Por favor dibuja tu firma antes de continuar');
      return;
    }
    this.loading.set(true);
    const formData = {
      ...this.fichaForm.value,
      firma: this.firma2Base64(),
    };
    const result = await this.svc.upsert(
      this.enrollment().id,
      'ficha_registro',
      formData,
    );
    this.loading.set(false);
    if (result) {
      this.step2Done.set(true);
      this.showToast('✅ Ficha de Registro guardada. ¡Proceso completo!');
      setTimeout(() => this.saved.emit(), 1500);
    } else {
      this.showToast('❌ Error al guardar. Intenta de nuevo.');
    }
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3500);
  }

  close() { this.closed.emit(); }
}
