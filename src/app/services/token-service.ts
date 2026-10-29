// token.service.ts
import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth-services';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private tokenCheckInterval: any;
  private refreshAttempts = 0;
  private maxRefreshAttempts = 3;
  private isRefreshing = false;

  // ✅ Seuil de rafraîchissement : 5 minutes avant expiration
  private readonly REFRESH_THRESHOLD_MINUTES = 5;

  // ✅ Intervalle de vérification : 30 secondes
  private readonly CHECK_INTERVAL_MS = 30000;

  constructor(
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone
  ) {}

  /**
   * Démarrer la surveillance du token
   */
  startTokenMonitoring(): void {
    // Arrêter tout intervalle existant pour éviter les doublons
    this.stopTokenMonitoring();

    // Vérification immédiate au démarrage
    this.checkTokenExpiration();

    // Puis vérifier périodiquement
    this.tokenCheckInterval = setInterval(() => {
      this.checkTokenExpiration();
    }, this.CHECK_INTERVAL_MS);

    console.log('✅ [TokenService] Surveillance du token démarrée');
  }

  /**
   * Arrêter la surveillance du token
   */
  stopTokenMonitoring(): void {
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
      this.tokenCheckInterval = null;
      console.log('⏹️ [TokenService] Surveillance du token arrêtée');
    }
  }

  /**
   * Vérifier si le token est expiré ou sur le point d'expirer
   */
  private checkTokenExpiration(): void {
    const token = localStorage.getItem('token');
    if (!token) {
      // Pas de token → pas de surveillance nécessaire
      return;
    }

    try {
      const payload = this.decodeToken(token);

      if (!payload || !payload.exp) {
        console.warn('⚠️ [TokenService] Token sans date d\'expiration');
        return;
      }

      const expirationDate = new Date(payload.exp * 1000);
      const now = new Date();
      const timeUntilExpiry = expirationDate.getTime() - now.getTime();
      const minutesUntilExpiry = timeUntilExpiry / (1000 * 60);

      console.log(
        `⏱️ [TokenService] Token expire dans ${minutesUntilExpiry.toFixed(2)} minutes`
      );

      // ✅ Cas 1 : Token ENCORE VALIDE mais proche de l'expiration → rafraîchir
      if (
        minutesUntilExpiry > 0 &&
        minutesUntilExpiry < this.REFRESH_THRESHOLD_MINUTES
      ) {
        console.log(
          `🔄 [TokenService] Refresh déclenché (${minutesUntilExpiry.toFixed(1)} min restantes)`
        );
        this.attemptTokenRefresh();
        return; // ⚠️ Important : ne pas continuer vers handleTokenExpired
      }

      // ✅ Cas 2 : Token DÉJÀ EXPIRÉ → déconnexion
      if (timeUntilExpiry <= 0) {
        console.log('⏰ [TokenService] Token expiré → déconnexion');
        this.handleTokenExpired();
      }
    } catch (error) {
      console.error('❌ [TokenService] Erreur lors de la vérification du token:', error);
    }
  }

  /**
   * Tenter de rafraîchir le token
   */
  private attemptTokenRefresh(): void {
    // Éviter les rafraîchissements simultanés
    if (this.isRefreshing) {
      console.log('⚠️ [TokenService] Rafraîchissement déjà en cours');
      return;
    }

    if (this.refreshAttempts >= this.maxRefreshAttempts) {
      console.warn('⚠️ [TokenService] Maximum de tentatives atteint → déconnexion');
      this.handleTokenExpired();
      return;
    }

    this.isRefreshing = true;
    this.refreshAttempts++;
    console.log(
      `🔄 [TokenService] Tentative de rafraîchissement #${this.refreshAttempts}/${this.maxRefreshAttempts}`
    );

    this.authService.refreshToken().subscribe({
      next: (response) => {
        console.log('✅ [TokenService] Token rafraîchi avec succès');
        this.refreshAttempts = 0;
        this.isRefreshing = false;
      },
      error: (error) => {
        console.error(
          `❌ [TokenService] Échec du rafraîchissement (tentative ${this.refreshAttempts}/${this.maxRefreshAttempts}):`,
          error
        );
        this.isRefreshing = false;

        // ✅ Si erreur 401 → token définitivement invalide → déconnexion
        if (error.status === 401) {
          console.warn('🚪 [TokenService] 401 reçu → token invalide, déconnexion');
          this.handleTokenExpired();
          return;
        }

        // ✅ Erreur réseau/500 → réessayer après un délai
        if (this.refreshAttempts < this.maxRefreshAttempts) {
          console.log('🔁 [TokenService] Nouvelle tentative dans 2 secondes...');
          setTimeout(() => this.attemptTokenRefresh(), 2000);
        } else {
          console.warn('⚠️ [TokenService] Max tentatives atteint → déconnexion');
          this.handleTokenExpired();
        }
      },
    });
  }

  /**
   * Gérer l'expiration du token (déconnexion)
   */
  private handleTokenExpired(): void {
    this.ngZone.run(() => {
      console.log('🚪 [TokenService] Déconnexion automatique...');

      // Arrêter la surveillance
      this.stopTokenMonitoring();

      // Réinitialiser les compteurs
      this.refreshAttempts = 0;
      this.isRefreshing = false;

      // Vider le localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('token_expires_in');

      // Rediriger vers login
      this.router.navigate(['/login'], {
        queryParams: {
          expired: 'true',
          message: 'Votre session a expiré. Veuillez vous reconnecter.',
        },
      });
    });
  }

  /**
   * Décoder un token JWT
   */
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch (error) {
      console.error('❌ [TokenService] Erreur décodage token:', error);
      return null;
    }
  }

  /**
   * Forcer la réinitialisation des compteurs (utile après login)
   */
  resetRefreshAttempts(): void {
    this.refreshAttempts = 0;
    this.isRefreshing = false;
  }
}
