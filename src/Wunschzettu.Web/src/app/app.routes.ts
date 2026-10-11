import { Routes } from '@angular/router';
import { loggedIn, requireLogin } from './core/auth';

export const routes: Routes = [
  { path: '', canMatch: [loggedIn], loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
  { path: '', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  { path: 'login', loadComponent: () => import('./features/auth/login').then((m) => m.Login) },
  { path: 'confirm', loadComponent: () => import('./features/auth/confirm').then((m) => m.Confirm) },
  // Web Share Target (manifest.webmanifest): another app shared a link with Wunschzettu.
  { path: 'share', canActivate: [requireLogin], loadComponent: () => import('./features/share/share').then((m) => m.Share) },
  { path: 'app', loadComponent: () => import('./features/install/install-page').then((m) => m.InstallPage) },
  { path: 'profile', canActivate: [requireLogin], loadComponent: () => import('./features/profile/profile').then((m) => m.Profile) },
  {
    path: 'lists/:id/edit',
    canActivate: [requireLogin],
    loadComponent: () => import('./features/list-editor/list-editor').then((m) => m.ListEditor),
  },
  {
    path: 'lists/:id/thanks',
    canActivate: [requireLogin],
    loadComponent: () => import('./features/thanks/thanks').then((m) => m.Thanks),
  },
  { path: 'l/:token', loadComponent: () => import('./features/list-view/list-view').then((m) => m.ListView) },
  { path: 'impressum', loadComponent: () => import('./features/legal/imprint').then((m) => m.Imprint) },
  { path: 'datenschutz', loadComponent: () => import('./features/legal/privacy').then((m) => m.Privacy) },
  { path: 'nutzungsbedingungen', loadComponent: () => import('./features/legal/terms').then((m) => m.Terms) },
  { path: '**', loadComponent: () => import('./features/not-found').then((m) => m.NotFound) },
];
