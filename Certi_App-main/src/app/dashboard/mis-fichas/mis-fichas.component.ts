import { Component, inject, signal, computed, OnInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { FichaRegistroService, FichaRegistro } from '../../core/services/ficha-registro.service';
import { PdfService } from '../../core/services/pdf.service';
import { EstandaresService, Estandar } from '../../core/services/estandares.service';
import { FichaRegistroPageComponent } from '../ficha-registro-page/ficha-registro-page.component';

type TabView = 'estandares' | 'mis-fichas';

export interface CategoryMeta {
  icon: 'book' | 'heart' | 'sparkles' | 'layers' | 'cpu' | 'star';
  colorClass: string;
  description: string;
}

export interface CategoryGroup {
  name: string;
  meta: CategoryMeta;
  count: number;
  estandares: Estandar[];
}

const CATEGORY_META_MAP: Record<string, CategoryMeta> = {
  'Educación': {
    icon: 'book',
    colorClass: 'cat-theme-indigo',
    description: 'Estándares de formación del capital humano, docencia, tutoría y diseño de cursos presenciales y en línea.',
  },
  'Derechos humanos y salud': {
    icon: 'heart',
    colorClass: 'cat-theme-rose',
    description: 'Servicios de atención médica, primeros auxilios, asistencia social, igualdad y protección integral de derechos.',
  },
  'Belleza': {
    icon: 'sparkles',
    colorClass: 'cat-theme-pink',
    description: 'Servicios cosmetológicos faciales, cuidado y coloración capilar, aplicación de uñas y estética profesional.',
  },
  'Otros servicios': {
    icon: 'layers',
    colorClass: 'cat-theme-amber',
    description: 'Competencias técnicas y operativas: atención al cliente, idiomas, instalaciones especializadas y evaluación.',
  },
  'Tecnología': {
    icon: 'cpu',
    colorClass: 'cat-theme-teal',
    description: 'Tecnologías de la información, plataformas digitales y herramientas síncronas de aprendizaje.',
  },
};

function resolveCategoryMeta(catName: string): CategoryMeta {
  const match = Object.keys(CATEGORY_META_MAP).find(
    k => k.toLowerCase() === catName.toLowerCase() || catName.toLowerCase().includes(k.toLowerCase())
  );
  if (match) return CATEGORY_META_MAP[match];

  return {
    icon: 'star',
    colorClass: 'cat-theme-slate',
    description: 'Estándares de competencia laboral certificados ante el Sistema Nacional de Competencias (CONOCER).',
  };
}

@Component({
  selector: 'app-mis-fichas',
  standalone: true,
  imports: [CommonModule, FormsModule, FichaRegistroPageComponent],
  templateUrl: './mis-fichas.component.html',
  styleUrl: './mis-fichas.component.css',
})
export class MisFichasComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly fichaSvc = inject(FichaRegistroService);
  private readonly estandaresSvc = inject(EstandaresService);
  private readonly pdfSvc = inject(PdfService);

  /** Emite cuando se guarda una ficha nueva exitosamente */
  fichaGuardada = output<void>();

  // 'catalog' muestra las cartas de estándares y mis fichas; 'form' abre la Ficha de Registro del estándar seleccionado
  viewMode = signal<'catalog' | 'form'>('catalog');
  activeTab = signal<TabView>('estandares');

  loading = signal(true);
  estandares = signal<Estandar[]>([]);
  fichas = signal<FichaRegistro[]>([]);
  chosenEstandar = signal<Estandar | null>(null);
  downloadingId = signal<string | null>(null);
  searchQuery = signal<string>('');
  selectedCategory = signal<string>('TODAS');

  // Categorías presentes en los estándares cargados con sus conteos
  categories = computed(() => {
    const counts = new Map<string, number>();
    for (const e of this.estandares()) {
      const cat = e.categoria?.trim() || 'Otros servicios';
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        count,
        meta: resolveCategoryMeta(name),
      }))
      .sort((a, b) => b.count - a.count);
  });

  // Estándares agrupados en secciones por categoría con filtros reactivos
  groupedEstandares = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const catFilter = this.selectedCategory();
    const all = this.estandares();

    // 1. Filtro de búsqueda por texto (código, nombre o categoría)
    const filtered = all.filter(e => {
      if (!q) return true;
      return (
        e.codigo.toLowerCase().includes(q) ||
        e.nombre.toLowerCase().includes(q) ||
        (e.categoria && e.categoria.toLowerCase().includes(q))
      );
    });

    // 2. Agrupar por categoría
    const groupsMap = new Map<string, Estandar[]>();
    for (const e of filtered) {
      const cat = e.categoria?.trim() || 'Otros servicios';
      if (!groupsMap.has(cat)) {
        groupsMap.set(cat, []);
      }
      groupsMap.get(cat)!.push(e);
    }

    // 3. Crear lista de secciones aplicando el filtro de categoría activa
    const groups: CategoryGroup[] = [];
    for (const [catName, items] of groupsMap.entries()) {
      if (catFilter !== 'TODAS' && catName !== catFilter) {
        continue;
      }
      groups.push({
        name: catName,
        meta: resolveCategoryMeta(catName),
        count: items.length,
        estandares: items,
      });
    }

    return groups.sort((a, b) => b.count - a.count);
  });

  totalFilteredCount = computed(() => {
    return this.groupedEstandares().reduce((acc, g) => acc + g.estandares.length, 0);
  });

  // Mapa rápido de fichas del usuario por estandar_id
  fichasByEstandarId = computed(() => {
    const map = new Map<string, FichaRegistro>();
    for (const f of this.fichas()) {
      map.set(f.estandar_id, f);
    }
    return map;
  });

  selectCategory(cat: string) {
    this.selectedCategory.set(cat);
  }

  resetFilters() {
    this.searchQuery.set('');
    this.selectedCategory.set('TODAS');
  }

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    try {
      const [estList, fichasList] = await Promise.all([
        this.estandaresSvc.list(),
        this.fichaSvc.listMine()
      ]);
      this.estandares.set(estList);
      this.fichas.set(fichasList);
    } catch (err) {
      console.error('Error cargando estándares o fichas:', err);
    } finally {
      this.loading.set(false);
    }
  }

  onSelectEstandar(e: Estandar) {
    this.chosenEstandar.set(e);
    this.viewMode.set('form');
  }

  backToCatalog() {
    this.viewMode.set('catalog');
    this.chosenEstandar.set(null);
  }

  async onFichaSaved() {
    await this.loadData();
    this.fichaGuardada.emit();
  }

  async verPdf(f: FichaRegistro, event?: Event) {
    if (event) event.stopPropagation();
    const token = this.auth.getToken();
    if (!token) return;
    this.downloadingId.set(f.id);
    try {
      const url = await this.pdfSvc.getFichaRegistroBlobUrlByFichaId(f.id, token);
      window.open(url, '_blank');
    } catch {
      // reintento disponible
    } finally {
      this.downloadingId.set(null);
    }
  }
}

