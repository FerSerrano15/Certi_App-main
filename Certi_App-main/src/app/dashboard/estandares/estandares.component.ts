import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  EstandaresService, Estandar, GuiaObservacion, Reactivo,
} from '../../core/services/estandares.service';

type View = 'list' | 'detail';

@Component({
  selector: 'app-estandares',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './estandares.component.html',
  styleUrl: './estandares.component.css',
})
export class EstandaresComponent implements OnInit {
  private readonly svc = inject(EstandaresService);
  private readonly confirmSvc = inject(ConfirmDialogService);
  private readonly fb = inject(FormBuilder);

  // ─── State ───────────────────────────────────────────────────────────────
  view = signal<View>('list');
  loading = signal(false);
  toast = signal('');

  estandares = signal<Estandar[]>([]);
  search = signal('');
  selectedEstandar = signal<Estandar | null>(null);

  filteredEstandares = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.estandares();
    return this.estandares().filter(e =>
      e.codigo.toLowerCase().includes(q) || e.nombre.toLowerCase().includes(q)
    );
  });

  // ─── Modal: Estándar ───────────────────────────────────────────────────────
  showEstandarModal = signal(false);
  editingEstandar = signal<Estandar | null>(null);
  estandarForm = this.fb.group({
    codigo:    ['', [Validators.required, Validators.minLength(1)]],
    nombre:    ['', [Validators.required, Validators.minLength(3)]],
    categoria: [''],
    vigente:   [true],
  });

  // ─── Modal: Guía de Observación ────────────────────────────────────────────
  showGuiaModal = signal(false);
  editingGuia = signal<GuiaObservacion | null>(null);
  guiaForm = this.fb.group({
    titulo:        ['', [Validators.required, Validators.minLength(1)]],
    instrucciones: [''],
    orden:         [1, [Validators.min(1)]],
  });

  // ─── Modal: Reactivo ───────────────────────────────────────────────────────
  showReactivoModal = signal(false);
  editingReactivo = signal<Reactivo | null>(null);
  editingReactivoGuiaId = signal<string | null>(null);
  reactivoForm = this.fb.group({
    codigo_reactivo:  ['', [Validators.required, Validators.minLength(1)]],
    descripcion:      ['', [Validators.required, Validators.minLength(1)]],
    peso:             [0, [Validators.required, Validators.min(0)]],
    es_actitud_valor: [false],
    orden:            [1, [Validators.min(1)]],
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  async ngOnInit() {
    await this.loadEstandares();
  }

  async loadEstandares() {
    this.loading.set(true);
    this.estandares.set(await this.svc.list());
    this.loading.set(false);
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3000);
  }

  // ─── Navegación ────────────────────────────────────────────────────────────
  async openDetail(e: Estandar) {
    this.loading.set(true);
    const full = await this.svc.getOne(e.id);
    this.selectedEstandar.set(full);
    this.view.set('detail');
    this.loading.set(false);
  }

  backToList() {
    this.view.set('list');
    this.selectedEstandar.set(null);
  }

  private async refreshSelected() {
    const current = this.selectedEstandar();
    if (!current) return;
    const full = await this.svc.getOne(current.id);
    this.selectedEstandar.set(full);
  }

  // ─── Estándar CRUD ─────────────────────────────────────────────────────────
  openNewEstandar() {
    this.editingEstandar.set(null);
    this.estandarForm.reset({ codigo: '', nombre: '', categoria: '', vigente: true });
    this.showEstandarModal.set(true);
  }

  openEditEstandar(e: Estandar, ev: Event) {
    ev.stopPropagation();
    this.editingEstandar.set(e);
    this.estandarForm.reset({
      codigo: e.codigo, nombre: e.nombre, categoria: e.categoria ?? '', vigente: e.vigente,
    });
    this.showEstandarModal.set(true);
  }

  async saveEstandar() {
    if (this.estandarForm.invalid) { this.estandarForm.markAllAsTouched(); return; }
    this.loading.set(true);
    const val = this.estandarForm.value;
    const payload = {
      codigo: val.codigo!.trim(),
      nombre: val.nombre!.trim(),
      categoria: val.categoria?.trim() || undefined,
      vigente: val.vigente ?? true,
    };
    const editing = this.editingEstandar();
    const result = editing
      ? await this.svc.update(editing.id, payload)
      : await this.svc.create(payload);
    this.loading.set(false);
    if (result) {
      this.showToast(editing ? 'Estándar actualizado.' : 'Estándar creado.');
      this.showEstandarModal.set(false);
      await this.loadEstandares();
      if (editing && this.selectedEstandar()?.id === editing.id) await this.refreshSelected();
    } else {
      this.showToast('No se pudo guardar el estándar (¿código duplicado?).');
    }
  }

  /** Marca una nueva versión del estándar seleccionado (incrementa version, deja editar el código a mano). */
  async bumpVersion() {
    const e = this.selectedEstandar();
    if (!e) return;
    const nextVersion = (e.version ?? 1) + 1;
    const suggestion = e.codigo.replace(/\.\d+$/, '') + '.' + String(nextVersion).padStart(2, '0');
    const nuevoCodigo = prompt(`Nuevo código para la versión ${nextVersion} (puedes editarlo):`, suggestion);
    if (nuevoCodigo === null) return;
    this.loading.set(true);
    const result = await this.svc.update(e.id, { codigo: nuevoCodigo.trim(), version: nextVersion });
    this.loading.set(false);
    if (result) {
      this.showToast(`Estándar actualizado a la versión ${nextVersion}.`);
      await this.refreshSelected();
      await this.loadEstandares();
    } else {
      this.showToast('No se pudo actualizar la versión.');
    }
  }

  async deleteEstandar(e: Estandar, ev: Event) {
    ev.stopPropagation();
    const ok1 = await this.confirmSvc.ask({
      title: 'Eliminar estándar',
      message: `¿Eliminar el estándar "${e.codigo}"? Se eliminarán también sus guías y reactivos.`,
      detail: `Se perderán permanentemente todas las guías de observación y reactivos del estándar "${e.codigo}", junto con cualquier evaluación que dependa de ellos. Esta acción no se puede deshacer.`,
    });
    if (!ok1) return;
    const ok = await this.svc.remove(e.id);
    if (ok) {
      this.showToast('Estándar eliminado.');
      await this.loadEstandares();
    }
  }

  // ─── Guía CRUD ─────────────────────────────────────────────────────────────
  openNewGuia() {
    this.editingGuia.set(null);
    const nextOrden = (this.selectedEstandar()?.guias?.length ?? 0) + 1;
    this.guiaForm.reset({ titulo: `Guía de Observación ${nextOrden}`, instrucciones: '', orden: nextOrden });
    this.showGuiaModal.set(true);
  }

  openEditGuia(g: GuiaObservacion) {
    this.editingGuia.set(g);
    this.guiaForm.reset({ titulo: g.titulo, instrucciones: g.instrucciones ?? '', orden: g.orden });
    this.showGuiaModal.set(true);
  }

  async saveGuia() {
    if (this.guiaForm.invalid) { this.guiaForm.markAllAsTouched(); return; }
    const estandar = this.selectedEstandar();
    if (!estandar) return;
    this.loading.set(true);
    const val = this.guiaForm.value;
    const payload = {
      titulo: val.titulo!.trim(),
      instrucciones: val.instrucciones?.trim() || undefined,
      orden: val.orden ?? 1,
    };
    const editing = this.editingGuia();
    const result = editing
      ? await this.svc.updateGuia(editing.id, payload)
      : await this.svc.createGuia(estandar.id, payload);
    this.loading.set(false);
    if (result) {
      this.showToast(editing ? 'Guía actualizada.' : 'Guía creada.');
      this.showGuiaModal.set(false);
      await this.refreshSelected();
    } else {
      this.showToast('No se pudo guardar la guía.');
    }
  }

  async deleteGuia(g: GuiaObservacion) {
    const ok1 = await this.confirmSvc.ask({
      title: 'Eliminar guía de observación',
      message: `¿Eliminar "${g.titulo}"? Se eliminarán también sus reactivos.`,
      detail: 'Se perderán permanentemente todos los reactivos de esta guía. Esta acción no se puede deshacer.',
    });
    if (!ok1) return;
    const ok = await this.svc.removeGuia(g.id);
    if (ok) {
      this.showToast('Guía eliminada.');
      await this.refreshSelected();
    }
  }

  // ─── Reactivo CRUD ─────────────────────────────────────────────────────────
  openNewReactivo(g: GuiaObservacion) {
    this.editingReactivo.set(null);
    this.editingReactivoGuiaId.set(g.id);
    const nextOrden = (g.reactivos?.length ?? 0) + 1;
    this.reactivoForm.reset({ codigo_reactivo: '', descripcion: '', peso: 0, es_actitud_valor: false, orden: nextOrden });
    this.showReactivoModal.set(true);
  }

  openEditReactivo(g: GuiaObservacion, r: Reactivo) {
    this.editingReactivo.set(r);
    this.editingReactivoGuiaId.set(g.id);
    this.reactivoForm.reset({
      codigo_reactivo: r.codigo_reactivo, descripcion: r.descripcion, peso: r.peso,
      es_actitud_valor: r.es_actitud_valor, orden: r.orden,
    });
    this.showReactivoModal.set(true);
  }

  async saveReactivo() {
    if (this.reactivoForm.invalid) { this.reactivoForm.markAllAsTouched(); return; }
    const guiaId = this.editingReactivoGuiaId();
    if (!guiaId) return;
    this.loading.set(true);
    const val = this.reactivoForm.value;
    const payload = {
      codigo_reactivo: val.codigo_reactivo!.trim(),
      descripcion: val.descripcion!.trim(),
      peso: val.peso ?? 0,
      es_actitud_valor: val.es_actitud_valor ?? false,
      orden: val.orden ?? 1,
    };
    const editing = this.editingReactivo();
    const result = editing
      ? await this.svc.updateReactivo(editing.id, payload)
      : await this.svc.createReactivo(guiaId, payload);
    this.loading.set(false);
    if (result) {
      this.showToast(editing ? 'Reactivo actualizado.' : 'Reactivo agregado.');
      this.showReactivoModal.set(false);
      await this.refreshSelected();
    } else {
      this.showToast('No se pudo guardar el reactivo.');
    }
  }

  async deleteReactivo(r: Reactivo) {
    const ok1 = await this.confirmSvc.ask({
      title: 'Eliminar reactivo',
      message: `¿Eliminar el reactivo "${r.codigo_reactivo}"?`,
    });
    if (!ok1) return;
    const ok = await this.svc.removeReactivo(r.id);
    if (ok) {
      this.showToast('Reactivo eliminado.');
      await this.refreshSelected();
    }
  }

  pesoTotalGuia(g: GuiaObservacion): number {
    return (g.reactivos ?? []).reduce((sum, r) => sum + (r.peso ?? 0), 0);
  }
}
