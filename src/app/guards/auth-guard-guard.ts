import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth-services';


export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

   const isAuth = authService.isAuthenticated();
  // console.log('🛡️ authGuard - isAuthenticated:', isAuth);
  // console.log('🛡️ authGuard - token:', localStorage.getItem('token'));
  // console.log('🛡️ authGuard - user:', localStorage.getItem('user'));

  if (isAuth) {
    //console.log('🛡️ authGuard - ACCÈS AUTORISÉ à', state.url);
    return true;
  }

  //console.log('🛡️ authGuard - REDIRECTION VERS LOGIN');
  return router.parseUrl('/login');
};

// Guard pour les routes publiques (login)
export const publicGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Si l'utilisateur est déjà connecté, rediriger vers dashboard
  if (authService.isAuthenticated()) {
    return router.parseUrl('/dashboard');
  }

  return true;
};


