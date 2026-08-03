import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LandingContentService, LandingContent, DEFAULT_LANDING_CONTENT,
} from '../../core/services/landing-content.service';

/**
 * Editor "low-code" del landing page para el Super Admin: solo campos de
 * texto y listas con botones de agregar/quitar — sin necesidad de tocar código.
 * Guarda todo como un único JSON en el backend (GET/PUT /landing).
 */
@Component({
  selector: 'app-landing-editor',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing-editor.component.html',
  styleUrl: './landing-editor.component.css',
})
export class LandingEditorComponent implements OnInit {
  private readonly svc = inject(LandingContentService);

  loading = signal(true);
  saving  = signal(false);
  toast   = signal('');

  content = signal<LandingContent>(structuredClone(DEFAULT_LANDING_CONTENT));

  async ngOnInit() {
    this.content.set(await this.svc.getContent());
    this.loading.set(false);
  }

  // ─── Guardar / Restablecer ────────────────────────────────────────────────

  async save() {
    this.saving.set(true);
    const ok = await this.svc.updateContent(this.content());
    this.showToast(ok ? '✅ Landing page actualizado.' : 'No se pudo guardar. Intenta de nuevo.');
    this.saving.set(false);
  }

  resetToDefaults() {
    if (!confirm('¿Restablecer todos los campos a los valores originales? Esto no se guarda hasta que presiones "Guardar cambios".')) return;
    this.content.set(structuredClone(DEFAULT_LANDING_CONTENT));
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 3500);
  }

  // ─── Helper genérico de mutación inmutable ───────────────────────────────
  private update(mutator: (c: LandingContent) => void) {
    this.content.update(c => {
      const clone = structuredClone(c);
      mutator(clone);
      return clone;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HERO
  // ═══════════════════════════════════════════════════════════════════════

  setHero(field: 'badgeText' | 'titleLine1' | 'titleAccent' | 'titleLine3' | 'description' | 'ctaPrimaryText' | 'ctaSecondaryText' | 'trustTitle' | 'trustSub' | 'trustLabel', value: string) {
    this.update(c => { c.hero[field] = value; });
  }

  addHeroStat() { this.update(c => c.hero.stats.push({ number: '', label: '' })); }
  removeHeroStat(i: number) { this.update(c => c.hero.stats.splice(i, 1)); }
  setHeroStat(i: number, field: 'number' | 'label', value: string) {
    this.update(c => { c.hero.stats[i][field] = value; });
  }

  addInstitution() { this.update(c => c.hero.institutions.push('')); }
  removeInstitution(i: number) { this.update(c => c.hero.institutions.splice(i, 1)); }
  setInstitution(i: number, value: string) { this.update(c => { c.hero.institutions[i] = value; }); }

  // ═══════════════════════════════════════════════════════════════════════
  //  CERTIFICACIONES
  // ═══════════════════════════════════════════════════════════════════════

  setCertSection(field: 'tag' | 'title' | 'description', value: string) {
    this.update(c => { c.certificaciones[field] = value; });
  }

  addCertItem() {
    this.update(c => c.certificaciones.items.push({ icon: '🎓', title: '', description: '', codes: '', color: '#2dd4bf' }));
  }
  removeCertItem(i: number) { this.update(c => c.certificaciones.items.splice(i, 1)); }
  setCertItem(i: number, field: 'icon' | 'title' | 'description' | 'codes' | 'color', value: string) {
    this.update(c => { c.certificaciones.items[i][field] = value; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PROCESO
  // ═══════════════════════════════════════════════════════════════════════

  setProcesoSection(field: 'tag' | 'title' | 'description' | 'ctaText', value: string) {
    this.update(c => { c.proceso[field] = value; });
  }

  addStep() { this.update(c => c.proceso.steps.push({ title: '', description: '' })); }
  removeStep(i: number) { this.update(c => c.proceso.steps.splice(i, 1)); }
  setStep(i: number, field: 'title' | 'description', value: string) {
    this.update(c => { c.proceso.steps[i][field] = value; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EMPRESAS
  // ═══════════════════════════════════════════════════════════════════════

  setEmpresasSection(field: 'tag' | 'title' | 'description' | 'ctaText', value: string) {
    this.update(c => { c.empresas[field] = value; });
  }

  addEmpresaStat() { this.update(c => c.empresas.stats.push({ number: '', label: '' })); }
  removeEmpresaStat(i: number) { this.update(c => c.empresas.stats.splice(i, 1)); }
  setEmpresaStat(i: number, field: 'number' | 'label', value: string) {
    this.update(c => { c.empresas.stats[i][field] = value; });
  }

  addBenefit() { this.update(c => c.empresas.benefits.push('')); }
  removeBenefit(i: number) { this.update(c => c.empresas.benefits.splice(i, 1)); }
  setBenefit(i: number, value: string) { this.update(c => { c.empresas.benefits[i] = value; }); }

  // ═══════════════════════════════════════════════════════════════════════
  //  NOSOTROS
  // ═══════════════════════════════════════════════════════════════════════

  setNosotrosSection(field: 'tag' | 'title' | 'description', value: string) {
    this.update(c => { c.nosotros[field] = value; });
  }

  addValue() { this.update(c => c.nosotros.values.push({ icon: '🎯', title: '', description: '' })); }
  removeValue(i: number) { this.update(c => c.nosotros.values.splice(i, 1)); }
  setValue(i: number, field: 'icon' | 'title' | 'description', value: string) {
    this.update(c => { c.nosotros.values[i][field] = value; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TESTIMONIOS
  // ═══════════════════════════════════════════════════════════════════════

  setTestimoniosSection(field: 'tag' | 'title', value: string) {
    this.update(c => { c.testimonios[field] = value; });
  }

  addTestimonial() {
    this.update(c => c.testimonios.items.push({ quote: '', name: '', role: '', initials: '' }));
  }
  removeTestimonial(i: number) { this.update(c => c.testimonios.items.splice(i, 1)); }
  setTestimonial(i: number, field: 'quote' | 'name' | 'role' | 'initials', value: string) {
    this.update(c => { c.testimonios.items[i][field] = value; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CONTACTO / FOOTER
  // ═══════════════════════════════════════════════════════════════════════

  setContacto(field: 'title' | 'description' | 'email' | 'phone' | 'address', value: string) {
    this.update(c => { c.contacto[field] = value; });
  }

  setFooter(field: 'tagline' | 'copyright' | 'madeText', value: string) {
    this.update(c => { c.footer[field] = value; });
  }

  // ─── Helper de plantilla ──────────────────────────────────────────────────
  inputValue(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
