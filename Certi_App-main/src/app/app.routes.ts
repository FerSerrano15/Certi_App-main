import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'registro',
    loadComponent: () => import('./auth/registro/registro').then(m => m.RegistroComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'verificar',
    loadComponent: () => import('./pages/verify-certificate/verify-certificate').then(m => m.VerifyCertificateComponent)
  },
  {
    path: 'verificar/:ref',
    loadComponent: () => import('./pages/verify-certificate/verify-certificate').then(m => m.VerifyCertificateComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
