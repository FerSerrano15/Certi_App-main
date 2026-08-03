import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface LandingStat { number: string; label: string; }
export interface LandingCert { icon: string; title: string; description: string; codes: string; color: string; }
export interface LandingStep { title: string; description: string; }
export interface LandingValue { icon: string; title: string; description: string; }
export interface LandingTestimonial { quote: string; name: string; role: string; initials: string; }

export interface LandingContent {
  hero: {
    badgeText: string;
    titleLine1: string;
    titleAccent: string;
    titleLine3: string;
    description: string;
    ctaPrimaryText: string;
    ctaSecondaryText: string;
    stats: LandingStat[];
    trustTitle: string;
    trustSub: string;
    trustLabel: string;
    institutions: string[];
  };
  certificaciones: {
    tag: string;
    title: string;
    description: string;
    items: LandingCert[];
  };
  proceso: {
    tag: string;
    title: string;
    description: string;
    ctaText: string;
    steps: LandingStep[];
  };
  empresas: {
    tag: string;
    title: string;
    description: string;
    ctaText: string;
    stats: LandingStat[];
    benefits: string[];
  };
  nosotros: {
    tag: string;
    title: string;
    description: string;
    values: LandingValue[];
  };
  testimonios: {
    tag: string;
    title: string;
    items: LandingTestimonial[];
  };
  contacto: {
    title: string;
    description: string;
    email: string;
    phone: string;
    address: string;
  };
  footer: {
    tagline: string;
    copyright: string;
    madeText: string;
  };
}

/** Valores por defecto — igual al contenido que tenía el home antes de ser editable. */
export const DEFAULT_LANDING_CONTENT: LandingContent = {
  hero: {
    badgeText: 'Reconocido oficialmente',
    titleLine1: 'Certifica lo que ya',
    titleAccent: 'sabes hacer.',
    titleLine3: 'Con validez oficial.',
    description: 'En CONOCER acompañamos a personas y empresas a certificar competencias laborales bajo los estándares nacionales de México. Un proceso serio, humano y con reconocimiento oficial.',
    ctaPrimaryText: 'Comenzar registro',
    ctaSecondaryText: 'Conocer el proceso',
    stats: [
      { number: '+15', label: 'Años de experiencia' },
      { number: '300+', label: 'Estándares acreditados' },
      { number: '98%', label: 'Tasa de aprobación' },
    ],
    trustTitle: 'Certificado oficial',
    trustSub: 'Válido en todo México',
    trustLabel: 'Respaldados por:',
    institutions: ['SEP', 'STPS', 'SEMS', 'CONACYT', 'IMSS', 'SAT'],
  },
  certificaciones: {
    tag: 'Nuestras Certificaciones',
    title: 'Estándares para cada etapa profesional',
    description: 'Contamos con acreditación en más de 300 estándares de competencia.',
    items: [
      { icon: '🎓', title: 'Docencia y Formación', description: 'Diseño de cursos, impartición y evaluación del aprendizaje por competencias.', codes: 'EC0217, EC0301', color: '#2dd4bf' },
      { icon: '🤝', title: 'Atención al Cliente', description: 'Estándares para prestación de servicios de atención presencial y a distancia.', codes: 'EC0305', color: '#818cf8' },
      { icon: '🧭', title: 'Gestión y Liderazgo', description: 'Coordinación de equipos, gestión de proyectos y desarrollo organizacional.', codes: 'EC0249, EC0076', color: '#f59e0b' },
      { icon: '💼', title: 'Consultoría General', description: 'Diagnóstico organizacional, propuestas de mejora e implementación de soluciones.', codes: 'EC0249', color: '#34d399' },
      { icon: '🌱', title: 'Tutoría y Coaching', description: 'Acompañamiento a personas y equipos para el desarrollo de competencias.', codes: 'EC0647', color: '#f472b6' },
      { icon: '📋', title: 'Evaluación de Competencias', description: 'Formación de evaluadores certificados en el Sistema Nacional de Competencias.', codes: 'EC0076', color: '#60a5fa' },
    ],
  },
  proceso: {
    tag: 'Cómo trabajamos',
    title: 'Un proceso claro, cuatro pasos.',
    description: 'Diseñamos cada etapa para que la certificación sea accesible y con estándares reales de calidad.',
    ctaText: 'Agendar diagnóstico gratuito',
    steps: [
      { title: 'Diagnóstico', description: 'Analizamos tu experiencia y elegimos el estándar de competencia adecuado.' },
      { title: 'Preparación', description: 'Recibes materiales, asesoría y una guía clara de evidencias a presentar.' },
      { title: 'Evaluación', description: 'Un evaluador acreditado revisa tus evidencias con criterios justos y transparentes.' },
      { title: 'Certificación', description: 'Recibes tu certificado con validez oficial, reconocido en todo el país.' },
    ],
  },
  empresas: {
    tag: 'Para Empresas',
    title: 'Fortalece el talento de tu organización',
    description: 'Diseñamos programas de certificación corporativa que profesionalizan a tu equipo y elevan la calidad de tus procesos.',
    ctaText: 'Hablar con un consultor',
    stats: [
      { number: '500+', label: 'Colaboradores certificados por año' },
      { number: '40+', label: 'Empresas aliadas' },
      { number: '12', label: 'Sectores atendidos' },
      { number: '24 hrs', label: 'Tiempo de respuesta' },
    ],
    benefits: [
      'Diagnóstico de brechas de competencias por área',
      'Diseño de rutas de certificación a la medida',
      'Evaluadores acreditados en sitio o remoto',
      'Reportes ejecutivos y evidencia de cumplimiento',
    ],
  },
  nosotros: {
    tag: 'Sobre Nosotros',
    title: 'Una casa certificadora construida sobre confianza.',
    description: 'Desde hace más de una década acompañamos a profesionales, docentes, consultores y empresas mexicanas en el reconocimiento formal de sus competencias.',
    values: [
      { icon: '🎯', title: 'Rigor técnico', description: 'Aplicamos estándares internacionales con precisión en cada evaluación.' },
      { icon: '🤝', title: 'Trato humano', description: 'Cada candidato recibe acompañamiento personalizado durante todo el proceso.' },
      { icon: '🏛️', title: 'Validez oficial', description: 'Reconocidos por instituciones nacionales en todo México.' },
    ],
  },
  testimonios: {
    tag: 'Historias Reales',
    title: 'Lo que dicen quienes ya se certificaron',
    items: [
      { quote: 'El proceso fue claro desde el primer día. Certificarme en EC0217 abrió puertas que no imaginaba.', name: 'María Fernanda Ruiz', role: 'Docente · CDMX', initials: 'MF' },
      { quote: 'Certificamos a 80 colaboradores en seis meses. La coordinación fue impecable y los reportes muy útiles.', name: 'Alejandro Domínguez', role: 'Director de RH · Grupo Industrial', initials: 'AD' },
      { quote: 'El acompañamiento pedagógico marcó la diferencia. Me sentí respaldada durante toda la evaluación.', name: 'Laura Beltrán', role: 'Consultora independiente', initials: 'LB' },
    ],
  },
  contacto: {
    title: '¿Listo para certificar tu experiencia?',
    description: 'Agenda una llamada de 20 minutos con nuestro equipo. Te ayudamos a elegir el estándar adecuado y a estimar tiempos y costos.',
    email: 'contacto@conocer.mx',
    phone: '+52 (55) 0000 0000',
    address: 'Av. Reforma 123, Piso 8 · Ciudad de México',
  },
  footer: {
    tagline: 'Casa certificadora acreditada para el reconocimiento formal de competencias laborales en México.',
    copyright: '© 2026 CONOCER. Todos los derechos reservados.',
    madeText: 'Hecho con rigor en México 🇲🇽',
  },
};

@Injectable({ providedIn: 'root' })
export class LandingContentService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private token() { return this.auth.getToken() ?? ''; }

  /** Pública — sin token. Si no hay contenido guardado o falla, regresa los valores por defecto. */
  async getContent(): Promise<LandingContent> {
    try {
      const res = await firstValueFrom(this.api.get<{ data: Partial<LandingContent> | null }>('/landing'));
      if (!res?.data) return DEFAULT_LANDING_CONTENT;
      return this.mergeWithDefaults(res.data);
    } catch {
      return DEFAULT_LANDING_CONTENT;
    }
  }

  async updateContent(content: LandingContent): Promise<boolean> {
    try {
      await firstValueFrom(this.api.put(`/landing`, { data: content }, this.token()));
      return true;
    } catch { return false; }
  }

  /** Combina lo guardado con los defaults, por si se agregan campos nuevos en el futuro. */
  private mergeWithDefaults(data: Partial<LandingContent>): LandingContent {
    return {
      hero: { ...DEFAULT_LANDING_CONTENT.hero, ...(data.hero ?? {}) },
      certificaciones: { ...DEFAULT_LANDING_CONTENT.certificaciones, ...(data.certificaciones ?? {}) },
      proceso: { ...DEFAULT_LANDING_CONTENT.proceso, ...(data.proceso ?? {}) },
      empresas: { ...DEFAULT_LANDING_CONTENT.empresas, ...(data.empresas ?? {}) },
      nosotros: { ...DEFAULT_LANDING_CONTENT.nosotros, ...(data.nosotros ?? {}) },
      testimonios: { ...DEFAULT_LANDING_CONTENT.testimonios, ...(data.testimonios ?? {}) },
      contacto: { ...DEFAULT_LANDING_CONTENT.contacto, ...(data.contacto ?? {}) },
      footer: { ...DEFAULT_LANDING_CONTENT.footer, ...(data.footer ?? {}) },
    };
  }
}
