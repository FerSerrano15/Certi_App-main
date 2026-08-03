import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Contenido dinámico por token/folio — no se puede prerenderizar en build time.
  {
    path: 'verificar',
    renderMode: RenderMode.Server
  },
  {
    path: 'verificar/:ref',
    renderMode: RenderMode.Server
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
