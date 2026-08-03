import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import {
  InstitutionsService,
  Institution,
  InstitutionStats,
} from '../../core/services/institutions.service';

@Component({
  selector: 'app-institutions',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './institutions.component.html',
  styleUrl: './institutions.component.css',
})
export class InstitutionsComponent implements OnInit {
  private readonly svc = inject(InstitutionsService);
  private readonly fb  = inject(FormBuilder);

  // ─── State ───────────────────────────────────────────────────────────────
  loading    = signal(false);
  toast      = signal('');
  toastType  = signal<'ok' | 'err'>('ok');

  institutions = signal<Institution[]>([]);
  stats        = signal<InstitutionStats | null>(null);
  selectedInst = signal<Institution | null>(null);
  detailOpen   = signal(false);

  // Modal
  showModal   = signal(false);
  editingInst = signal<Institution | null>(null);

  // Búsqueda
  search = signal('');
  filterActive = signal<'all' | 'active' | 'inactive'>('all');

  filtered = computed(() => {
    const q  = this.search().toLowerCase();
    const fa = this.filterActive();
    return this.institutions().filter(i => {
      const matchQ = !q || i.name.toLowerCase().includes(q)
                         || i.slug.toLowerCase().includes(q)
                         || (i.contact_email ?? '').toLowerCase().includes(q);
      const matchA = fa === 'all' || (fa === 'active' && i.is_active) || (fa === 'inactive' && !i.is_active);
      return matchQ && matchA;
    });
  });

  // ─── Form ────────────────────────────────────────────────────────────────
  form = this.fb.group({
    name:          ['', [Validators.required, Validators.minLength(3)]],
    slug:          ['', [Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    tax_id:        [''],
    contact_email: ['', [Validators.email]],
    phone:         [''],
    logo_url:      [''],
    is_active:     [true],
  });

  get f() { return this.form.controls; }

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  async ngOnInit() { await this.loadAll(); }

  async loadAll() {
    this.loading.set(true);
    const [list, stats] = await Promise.all([
      this.svc.getAll(),
      this.svc.getStats(),
    ]);
    this.institutions.set(list);
    this.stats.set(stats);
    this.loading.set(false);
  }

  // ─── Modal ───────────────────────────────────────────────────────────────
  openNew() {
    this.editingInst.set(null);
    this.form.reset({ is_active: true });
    this.showModal.set(true);
  }

  openEdit(inst: Institution) {
    this.editingInst.set(inst);
    this.form.patchValue({
      name:          inst.name,
      slug:          inst.slug,
      tax_id:        inst.tax_id        ?? '',
      contact_email: inst.contact_email ?? '',
      phone:         inst.phone         ?? '',
      logo_url:      inst.logo_url      ?? '',
      is_active:     inst.is_active,
    });
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  async save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);

    const v = this.form.value;
    const payload: Partial<Institution> = {};
    if (v.name?.trim()) payload.name = v.name.trim();
    if (v.slug?.trim()) payload.slug = v.slug.trim();
    if (v.tax_id?.trim()) payload.tax_id = v.tax_id.trim();
    if (v.contact_email?.trim()) payload.contact_email = v.contact_email.trim();
    if (v.phone?.trim()) payload.phone = v.phone.trim();
    if (v.logo_url?.trim()) payload.logo_url = v.logo_url.trim();
    payload.is_active = v.is_active ?? true;

    try {
      const editing = this.editingInst();
      const result = editing
        ? await this.svc.update(editing.id, payload)
        : await this.svc.create(payload);
      if (result) {
        this.showToast(editing ? 'Institución actualizada.' : 'Institución creada correctamente.');
        this.showModal.set(false);
        await this.loadAll();
      }
    } catch (err: unknown) {
      const msg = this.extractError(err);
      this.showToast(msg, 'err');
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Acciones de fila ────────────────────────────────────────────────────
  async toggle(inst: Institution) {
    await this.svc.toggle(inst.id);
    await this.loadAll();
    this.showToast(inst.is_active ? 'Institución desactivada.' : 'Institución activada.');
  }

  async remove(inst: Institution) {
    if (!confirm(`¿Eliminar "${inst.name}"? Esta acción no se puede deshacer.`)) return;
    const ok = await this.svc.delete(inst.id);
    if (ok) {
      this.showToast('Institución eliminada.');
      await this.loadAll();
    }
  }

  // ─── Detalle ─────────────────────────────────────────────────────────────
  async openDetail(inst: Institution) {
    const full = await this.svc.getOne(inst.id);
    this.selectedInst.set(full);
    this.detailOpen.set(true);
  }
  closeDetail() { this.detailOpen.set(false); this.selectedInst.set(null); }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  getInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  getRoleLabel(role: string): string {
    const m: Record<string, string> = {
      SUPER_ADMIN: 'Super Admin', ADMIN_INSTITUCION: 'Admin',
      COORDINADOR: 'Coordinador', INSTRUCTOR: 'Instructor', OPERADOR: 'Operador',
    };
    return m[role] ?? role;
  }

  slugify(name: string) {
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim()
      .replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 60);
    this.f['slug'].setValue(slug);
  }

  private showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    this.toast.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toast.set(''), 4000);
  }

  private extractError(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const e = (err as { error: { message?: unknown } }).error;
      if (e?.message) {
        return Array.isArray(e.message) ? (e.message as string[]).join(', ') : String(e.message);
      }
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
