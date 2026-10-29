// auth.interceptor.ts
import {
  HttpInterceptorFn,
  HttpErrorResponse,
  HttpEvent,
  HttpRequest,
  HttpHandlerFn,
} from '@angular/common/http';
import { inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  filter,
  switchMap,
  take,
  throwError,
} from 'rxjs';
import { AuthService } from '../services/auth-services';


// ✅ Variables partagées entre toutes les requêtes
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const router = inject(Router);
  const zone = inject(NgZone);
  const authService = inject(AuthService);

  const token = localStorage.getItem('token');

  const isAuthEndpoint =
    req.url.includes('/auth/refresh') ||
    req.url.includes('/auth/login');

  // ✅ Ajouter le header Authorization (sauf pour login/refresh)
  let authReq = req;
  if (token && !isAuthEndpoint) {
    const cleanToken = token.replace(/^"(.*)"$/, '$1').trim();
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthEndpoint) {
        return handle401Error(authReq, next, authService, router, zone, error);
      }
      return throwError(() => error);
    }),
  );
};

/**
 * Gère les erreurs 401 avec un seul refresh à la fois.
 */
function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router,
  zone: NgZone,
  originalError: HttpErrorResponse,
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    // ✅ Premier 401 → lancer le refresh
    isRefreshing = true;
    refreshTokenSubject.next(null);

    console.log('🔄 [Interceptor] 401 détecté → lancement du refresh');

    return authService.refreshToken().pipe(
      switchMap((response: any) => {
        isRefreshing = false;

        const newToken =
          response?.data?.access_token ||
          response?.data?.token ||
          null;

        if (!newToken) {
          console.error('❌ [Interceptor] Refresh réussi mais aucun token reçu');
          return handleLogout(authService, router, zone, originalError);
        }

        console.log('✅ [Interceptor] Token rafraîchi → rejeu de la requête');

        refreshTokenSubject.next(newToken);

        const clonedReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${newToken}`,
          },
        });

        return next(clonedReq);
      }),
      catchError((refreshError) => {
        isRefreshing = false;
        console.error('❌ [Interceptor] Refresh échoué:', refreshError);

        refreshTokenSubject.next(null);
        return handleLogout(authService, router, zone, originalError);
      }),
    );
  } else {
    // ✅ Refresh déjà en cours → attendre le nouveau token
    console.log('⏳ [Interceptor] Refresh déjà en cours → attente');

    return refreshTokenSubject.pipe(
      filter((token): token is string => token !== null),
      take(1),
      switchMap((newToken) => {
        const clonedReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${newToken}`,
          },
        });
        return next(clonedReq);
      }),
    );
  }
}

/**
 * Déconnecte l'utilisateur et redirige vers /login
 */
function handleLogout(
  authService: AuthService,
  router: Router,
  zone: NgZone,
  originalError: HttpErrorResponse,
): Observable<never> {
  authService.logout();

  zone.run(() => {
    router.navigate(['/login'], {
      queryParams: { expired: 'true' },
    });
  });

  return throwError(() => originalError);
}
