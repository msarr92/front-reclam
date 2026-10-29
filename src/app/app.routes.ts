import { Routes } from '@angular/router';
import { Login } from './auth/login/login';
import { AuthLayout } from './auth-layout/auth-layout';
import { MainLayout } from './layout/main-layout/main-layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { authGuard, publicGuard } from './guards/auth-guard-guard';
import { Users } from './pages/users/users';
import { Entites } from './pages/entites/entites';
import { Elements } from './pages/elements/elements';
import { Tickets } from './pages/tickets/tickets';
import { AjoutTicket } from './pages/tickets/ajout-ticket/ajout-ticket';
import { Dlgas } from './pages/dlgas/dlgas';
import { Analytic } from './pages/analytic/analytic';
import { Rapport } from './pages/rapport/rapport';

export const routes: Routes = [
  // Routes publiques (layout sans authentification)
  {
    path: '',
    component: AuthLayout,
    canActivate: [publicGuard],
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: 'login', component: Login }
    ]
  },

  // Routes protégées (layout avec sidebar)
  {
    path: 'dashboard',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: Dashboard }
    ]
  },

  {
    path: 'users',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: Users }
    ]
  },

  {
    path: 'entites',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: Entites }
    ]
  },

  {
    path: 'elements',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: Elements }
    ]
  },

  {
    path: 'dlgas',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: Dlgas }
    ]
  },

  {
    path: 'analytic',
    component: MainLayout,
    canActivate: [authGuard],
    children:[
      {path: '', component: Analytic},
    ]
  },
  {
    path: 'rapport',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      {path: '', component: Rapport}
    ]
  },

  {
    path: 'tickets',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: Tickets },
      { path: 'ajouter', component: AjoutTicket },
       { path: 'modifier/:id', component: AjoutTicket }, // NOUVELLE ROUTE
    ]
  },

  // Redirection par défaut
  { path: '**', redirectTo: '/login' }
];
