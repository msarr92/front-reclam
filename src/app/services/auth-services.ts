import { Injectable, signal, Injector, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  tap,
  map,
  catchError,
  of,
  throwError,
  BehaviorSubject,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { TokenService } from './token-service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  // ✅ Injector pour résoudre TokenService paresseusement (évite la dépendance circulaire)
  private readonly injector = inject(Injector);

  // Signal pour l'utilisateur connecté
  private currentUserSignal = signal<any>(null);

  // Signal pour la hiérarchie complète de l'entité
  private userEntiteHierarchySignal = signal<any>(null);

  // Subject pour l'entité courante
  private currentEntitySubject = new BehaviorSubject<any>(null);
  currentEntity$ = this.currentEntitySubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
    //  NE PAS démarrer la surveillance ici
    // Elle sera démarrée :
    //   - soit après login()
    //   - soit par MainLayout.ngOnInit() si l'utilisateur est déjà authentifié (F5)
  }

  // ============================================================
  // ACCÈS PARESSEUX À TokenService (évite la dépendance circulaire)
  // ============================================================
  private getTokenService(): any {
    try {
      return this.injector.get(TokenService);
    } catch (e) {
      console.warn('⚠️ [AuthService] TokenService non disponible', e);
      return null;
    }
  }

  // ===== HEADERS =====
  getAuthHeaders(): HttpHeaders {
    const token = this.getCleanToken();
    let headers = new HttpHeaders()
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  getToken(): string | null {
    return this.getCleanToken();
  }

  getCleanToken(): string | null {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return token.replace(/^"(.*)"$/, '$1').trim();
  }

  // ============================================================
  // CHARGEMENT INITIAL
  // ============================================================
  private loadUserFromStorage(): void {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!token || !userStr) {
      if (token && !userStr) localStorage.removeItem('token');
      if (!token && userStr) localStorage.removeItem('user');
      return;
    }

    try {
      const cleanToken = token.replace(/^"(.*)"$/, '$1').trim();
      const payload = this.decodeToken(cleanToken);

      if (!payload || !payload.exp) {
        this.clearSession();
        return;
      }

      const expirationDate = new Date(payload.exp * 1000);
      const now = new Date();

      if (expirationDate <= now) {
        this.clearSession();
        return;
      }

      const user = JSON.parse(userStr);
      this.currentUserSignal.set(user);

      const savedEntity = this.getCurrentEntity();
      if (savedEntity) {
        this.currentEntitySubject.next(savedEntity);
      }

      if (user.entite_id) {
        this.loadUserEntiteHierarchy(user.entite_id);
      }
    } catch (e) {
      this.clearSession();
    }
  }

  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (error) {
      return null;
    }
  }

  // ============================================================
  // VÉRIFICATION DU TOKEN
  // ============================================================
  checkTokenValidity(): Observable<boolean> {
    const token = this.getCleanToken();
    if (!token) {
      return of(false);
    }
    return this.http
      .get(`${this.apiUrl}/auth/me`, { headers: this.getAuthHeaders() })
      .pipe(
        map(() => true),
        catchError(() => {
          this.clearSession();
          return of(false);
        }),
      );
  }

  checkToken(): Observable<boolean> {
    return this.checkTokenValidity();
  }

  isAuthenticated(): boolean {
    const token = this.getCleanToken();
    return !!token;
  }

  // ============================================================
  // SESSION
  // ============================================================
  private clearSession(): void {
    // ✅ Arrêter la surveillance si elle tourne encore
    const tokenService = this.getTokenService();
    if (tokenService && typeof tokenService.stopTokenMonitoring === 'function') {
      try {
        tokenService.stopTokenMonitoring();
      } catch (e) {
        // ignore
      }
    }

    this.currentUserSignal.set(null);
    this.userEntiteHierarchySignal.set(null);
    this.currentEntitySubject.next(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('token_expires_in');
    localStorage.removeItem('current_entity');
    localStorage.removeItem('currentEntity');
  }

  // ============================================================
  // HIÉRARCHIE DE L'ENTITÉ
  // ============================================================
  private loadUserEntiteHierarchy(entiteId: number): void {
    if (!entiteId) return;

    const token = this.getCleanToken();
    if (!token) {
      console.warn('⚠️ [loadUserEntiteHierarchy] Pas de token, skip');
      return;
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });

    this.http
      .get(`${this.apiUrl}/entites/${entiteId}`, { headers })
      .pipe(
        map((response: any) => response.data),
        catchError((error) => {
          console.warn(
            `⚠️ [loadUserEntiteHierarchy] Erreur entité #${entiteId}:`,
            error.status,
          );
          return of(null);
        }),
      )
      .subscribe((entiteDetails) => {
        if (entiteDetails) {
          this.userEntiteHierarchySignal.set(entiteDetails);
        }
      });
  }

  loadConnectedUserEntiteHierarchy(): void {
    const user = this.currentUserSignal();
    if (user?.entite_id) {
      this.loadUserEntiteHierarchy(user.entite_id);
    }
  }

  // ============================================================
  // LOGIN
  // ============================================================
  login(username: string, password: string): Observable<any> {
    return this.http
      .post(`${this.apiUrl}/auth/login`, { username, password })
      .pipe(
        tap((response: any) => {
          if (response.success && response.data && response.data.tokens) {
            const token = response.data.tokens.access_token;
            const user = response.data.user;

            localStorage.setItem('token', token);
            localStorage.setItem(
              'token_expires_in',
              response.data.tokens.expires_in.toString(),
            );
            localStorage.setItem('user', JSON.stringify(user));
            this.currentUserSignal.set(user);

            // Initialiser l'entité sélectionnée
            const mainEntity =
              user.entites?.find((e: any) => e.is_principal === true) ||
              (user.entites?.length > 0 ? user.entites[0] : null);
            if (mainEntity) {
              this.setCurrentEntity(mainEntity);
            }

            if (user.entite_id) {
              this.loadUserEntiteHierarchy(user.entite_id);
            }

            // ✅ DÉMARRER LA SURVEILLANCE APRÈS UN LOGIN RÉUSSI
            const tokenService = this.getTokenService();
            if (tokenService && typeof tokenService.startTokenMonitoring === 'function') {
              try {
                if (typeof tokenService.resetRefreshAttempts === 'function') {
                  tokenService.resetRefreshAttempts();
                }
                tokenService.startTokenMonitoring();
                console.log('✅ [AuthService] Surveillance du token démarrée après login');
              } catch (e) {
                console.warn('⚠️ [AuthService] Impossible de démarrer la surveillance', e);
              }
            }
          }
        }),
      );
  }

  // ============================================================
  // LOGOUT
  // ============================================================
  logout(): void {
    // ✅ Arrêter la surveillance AVANT de vider la session
    const tokenService = this.getTokenService();
    if (tokenService && typeof tokenService.stopTokenMonitoring === 'function') {
      try {
        tokenService.stopTokenMonitoring();
        console.log('⏹️ [AuthService] Surveillance du token arrêtée après logout');
      } catch (e) {
        // ignore
      }
    }

    this.clearSession();
  }

  // ============================================================
  // REFRESH TOKEN
  // ============================================================
  refreshToken(): Observable<any> {
    const token = this.getCleanToken();

    if (!token) {
      console.warn('⚠️ [AuthService] Aucun token à rafraîchir');
      return throwError(() => new Error('Aucun token à rafraîchir'));
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    return this.http
      .post(`${this.apiUrl}/auth/refresh`, {}, { headers })
      .pipe(
        tap((response: any) => {
          if (response.success && response.data?.access_token) {
            localStorage.setItem('token', response.data.access_token);

            if (response.data.expires_in) {
              localStorage.setItem(
                'token_expires_in',
                response.data.expires_in.toString(),
              );
            }

            if (response.data.user) {
              localStorage.setItem(
                'user',
                JSON.stringify(response.data.user),
              );
              this.currentUserSignal.set(response.data.user);
            }

            console.log('✅ [AuthService] Token rafraîchi et sauvegardé');
          }
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('❌ [AuthService] Échec du refresh:', {
            status: error.status,
            message: error.message,
            laravelMessage: error.error?.message,
            laravelError: error.error?.error,
          });
          return throwError(() => error);
        }),
      );
  }

  // ============================================================
  // UTILISATEUR
  // ============================================================
  setUser(user: any): void {
    this.currentUserSignal.set(user);
    localStorage.setItem('user', JSON.stringify(user));
  }

  getCurrentUser() {
    const currentValue = this.currentUserSignal();
    if (!currentValue) {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          this.currentUserSignal.set(user);
          return this.currentUserSignal.asReadonly();
        } catch (e) {}
      }
    }
    return this.currentUserSignal.asReadonly();
  }

  getCurrentUserId(): number | null {
    const user = this.currentUserSignal();
    return user ? user.id : null;
  }

  getCurrentUserFullName(): string {
    const user = this.currentUserSignal();
    return user ? `${user.prenom} ${user.nom}` : '';
  }

  getUserProfile(): string {
    const user = this.currentUserSignal();
    return user ? user.profil : '';
  }

  getUserAvatar(): string {
    const user = this.currentUserSignal();
    if (user) {
      return `https://ui-avatars.com/api/?name=${user.prenom}+${user.nom}&background=0066b3&color=fff&size=40`;
    }
    return 'https://ui-avatars.com/api/?name=Admin+User&background=0066b3&color=fff&size=40';
  }

  // ============================================================
  // ENTITÉ DE L'UTILISATEUR
  // ============================================================
  getUserEntiteNom(): string {
    const user = this.currentUserSignal();
    return user?.entite?.nom || user?.entite_nom || 'Non défini';
  }

  getUserEntite(): any {
    const user = this.currentUserSignal();
    return user?.entite || null;
  }

  getUserEntiteId(): number | null {
    const user = this.currentUserSignal();
    return user?.entite_id || null;
  }

  getUserEntiteHierarchy() {
    return this.userEntiteHierarchySignal.asReadonly();
  }

  getUserEntiteFullPath(): string {
    const hierarchy = this.userEntiteHierarchySignal();
    if (!hierarchy) return this.getUserEntiteNom();
    return hierarchy.chemin_complet || this.buildPathFromHierarchy(hierarchy);
  }

  getConnectedUserEntite(): any {
    const user = this.currentUserSignal();
    return user?.entite || null;
  }

  getConnectedUserEntiteNom(): string {
    const user = this.currentUserSignal();
    return user?.entite?.nom || user?.entite_nom || 'Non défini';
  }

  getConnectedUserEntiteId(): number | null {
    const user = this.currentUserSignal();
    return user?.entite_id || null;
  }

  getConnectedUserEntiteHierarchy() {
    return this.userEntiteHierarchySignal.asReadonly();
  }

  getConnectedUserEntiteFullPath(): string {
    const hierarchy = this.userEntiteHierarchySignal();
    const user = this.currentUserSignal();
    if (hierarchy) {
      return hierarchy.chemin_complet || this.buildPathFromHierarchy(hierarchy);
    } else if (user?.entite) {
      return user.entite.nom;
    }
    return this.getConnectedUserEntiteNom();
  }

  private buildPathFromHierarchy(hierarchy: any): string {
    const path: string[] = [];
    let current = hierarchy;
    while (current) {
      path.unshift(current.nom);
      current = current.parent;
    }
    return path.join(' → ');
  }

  // ============================================================
  // ENTITÉS DE L'UTILISATEUR
  // ============================================================
  getAllUserEntities(): any[] {
    const user = this.getCurrentUser()();

    if (user && user.entites && Array.isArray(user.entites)) {
      return user.entites;
    }

    if (user && (user.entite || user.entite_id)) {
      const singleEntity = {
        id: user.entite_id || user.entite?.id,
        nom: user.entite?.nom || user.entite_nom || 'Entité par défaut',
        role: user.profil || 'user',
        is_principal: true,
        fullPath: user.entite?.chemin_complet || user.entite_nom,
      };
      return [singleEntity];
    }

    return [];
  }

  getUserEntities(): any[] {
    return this.getAllUserEntities();
  }

  debugUserStructure(): void {
    const user = this.getCurrentUser()();
    console.log('🔍 Structure utilisateur complète:', user);
    console.log('📋 Entités trouvées:', user?.entites);
    console.log('🏢 Entité unique:', user?.entite);
    console.log('📛 Nom entité:', user?.entite_nom);
  }

  // ============================================================
  // ENTITÉ COURANTE (sélectionnée dans la sidebar)
  // ============================================================
  getCurrentEntity(): any {
    const entityStr =
      localStorage.getItem('currentEntity') ||
      localStorage.getItem('current_entity');

    if (entityStr) {
      try {
        return JSON.parse(entityStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  setCurrentEntity(entity: any): void {
    if (entity) {
      localStorage.setItem('currentEntity', JSON.stringify(entity));
      localStorage.setItem('current_entity', JSON.stringify(entity));
      this.currentEntitySubject.next(entity);
    } else {
      localStorage.removeItem('currentEntity');
      localStorage.removeItem('current_entity');
      this.currentEntitySubject.next(null);
    }
  }
}
