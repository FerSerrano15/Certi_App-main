import {
  Component, inject, signal, OnInit,
  ElementRef, ViewChild, OnDestroy, output, input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { FichaRegistroService } from '../../core/services/ficha-registro.service';
import { Estandar } from '../../core/services/estandares.service';
import { parseCurp, MEXICAN_STATES } from '../../core/utils/curp.util';

/**
 * Ficha de Registro del candidato para UN estándar de competencia en
 * particular. El candidato puede llenar varias de estas fichas — una por
 * cada certificación que quiera tramitar — eligiendo el estándar antes de
 * abrir este formulario (ver MisFichasComponent + EstandarPickerComponent).
 * Se guarda en `fichas_registro` vía FichaRegistroService.create().
 */
@Component({
  selector: 'app-ficha-registro-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ficha-registro-page.component.html',
  styleUrl: './ficha-registro-page.component.css',
})
export class FichaRegistroPageComponent implements OnInit, OnDestroy {
  private readonly fb   = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly fichaSvc = inject(FichaRegistroService);

  /** Estándar de competencia para el que se está llenando esta ficha. */
  estandar = input.required<Estandar>();

  /** Emite cuando el formulario fue guardado con éxito */
  saved = output<void>();

  // ─── State ───────────────────────────────────────────────────────────────
  loading   = signal(false);
  toast     = signal('');
  toastType = signal<'success' | 'error' | 'info'>('info');
  submitted = signal(false);

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

  // ─── Domicilio: estados + "Otro" con texto libre ──────────────────────────
  readonly estadosList = MEXICAN_STATES;
  entidadOtroSelected = signal(false);

  // ─── Estudios: solo el nivel (no institución) ─────────────────────────────
  readonly nivelesEstudio = [
    'Primaria',
    'Secundaria',
    'Preparatoria / Bachillerato',
    'Técnico Superior',
    'Licenciatura',
    'Maestría',
    'Doctorado',
  ];

  // ─── Formulario ─────────────────────────────────────────────────────────
  form!: FormGroup;

  // ─── Secciones colapsables ───────────────────────────────────────────────
  sections = signal({
    personales:    true,
    domicilio:     false,
    contacto:      false,
    complementaria:false,
    renap:         false,
    terminos:      false,
    firma:         false,
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  ngOnInit() {
    const user = this.auth.currentUser();
    this.buildForm(user?.full_name ?? '', user?.email ?? '', user?.phone ?? '');
    this.watchCurpAutofill();
  }

  /**
   * Al escribir una CURP válida, autocompleta fecha de nacimiento, estado de
   * nacimiento (lugarNacimiento — de la ficha solo interesa el estado, no la
   * ciudad) y género — pero solo si el candidato no los editó ya a mano
   * (controles `pristine`), para no pisar una corrección manual.
   */
  private watchCurpAutofill() {
    this.form.get('curp')?.valueChanges.subscribe((value: string) => {
      const parsed = parseCurp(value ?? '');
      if (!parsed) return;

      const fechaCtrl = this.form.get('fechaNacimiento');
      if (parsed.birthDate && fechaCtrl?.pristine) {
        fechaCtrl.setValue(parsed.birthDate);
      }

      const lugarCtrl = this.form.get('lugarNacimiento');
      if (parsed.birthStateName && lugarCtrl?.pristine) {
        lugarCtrl.setValue(parsed.birthStateName);
      }

      const generoCtrl = this.form.get('genero');
      if (parsed.sex && generoCtrl?.pristine) {
        generoCtrl.setValue(parsed.sex === 'H' ? 'Hombre' : 'Mujer');
      }
    });
  }

  /** Maneja el select de Entidad Federativa del domicilio (con opción "Otro"). */
  onEntidadSelectChange(value: string) {
    if (value === 'Otro') {
      this.entidadOtroSelected.set(true);
      this.form.get('entidadFederativa')?.setValue('');
    } else {
      this.entidadOtroSelected.set(false);
      this.form.get('entidadFederativa')?.setValue(value);
    }
  }

  ngOnDestroy() {
    this.drawing = false;
  }

  private buildForm(name: string, email: string, phone: string) {
    this.form = this.fb.group({
      // Datos personales
      nombreCompleto:  [name,  [Validators.required, Validators.minLength(3)]],
      lugarNacimiento: ['',    Validators.required],
      nacionalidad:    ['Mexicana', Validators.required],
      curp:            ['',    [Validators.required, Validators.minLength(18), Validators.maxLength(18),
                                Validators.pattern(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/i)]],
      genero:          ['',    Validators.required],
      fechaNacimiento: ['',    Validators.required],
      // Domicilio
      calle:             ['', Validators.required],
      numero:            ['', Validators.required],
      cp:                ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      colonia:           ['', Validators.required],
      ciudad:            ['', Validators.required],
      entidadFederativa: ['', Validators.required],
      // Contacto
      email:           [email, [Validators.required, Validators.email]],
      telefono:        [phone, [Validators.required, Validators.pattern(/^\d{10}$/)]],
      telefonoCelular: ['',    [Validators.pattern(/^\d{10}$/)]],
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
      // Términos y condiciones
      terminosAceptados: [false, Validators.requiredTrue],
    });
  }

  // ─── Secciones ─────────────────────────────────────────────────────────
  toggleSection(key: 'personales' | 'domicilio' | 'contacto' | 'renap' | 'complementaria' | 'terminos' | 'firma') {
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
      this.showToast('Completa todos los campos obligatorios antes de continuar.', 'error');
      // Abrir todas las secciones para que el usuario vea los errores
      this.sections.set({
        personales:    true,
        domicilio:     true,
        contacto:      true,
        renap:         true,
        complementaria:true,
        terminos:      true,
        firma:         true,
      });
      return;
    }

    if (!this.firmaBase64()) {
      this.sections.update(s => ({ ...s, firma: true }));
      setTimeout(() => this.initCanvas(), 150);
      this.showToast('Dibuja tu firma antes de enviar.', 'error');
      return;
    }

    this.loading.set(true);
    const formData = { ...this.form.value, firma: this.firmaBase64() };
    const result = await this.fichaSvc.create(this.estandar().id, formData);
    this.loading.set(false);

    if (result.ok) {
      this.submitted.set(true);
      this.showToast('¡Ficha de Registro enviada exitosamente!', 'success');
      setTimeout(() => this.saved.emit(), 2000);
    } else {
      this.showToast(result.error || 'Error al guardar. Verifica tu conexión e intenta de nuevo.', 'error');
    }
  }

  private showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    this.toast.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toast.set(''), 4500);
  }

  get user() { return this.auth.currentUser(); }
}
