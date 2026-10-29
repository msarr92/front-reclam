import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, throwError, timeout, retry } from 'rxjs';
import { environment } from '../../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class EntitesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly enableDebug = environment.enableDebug;
  private readonly timeoutDuration = environment.timeout;
  private readonly retryAttempts = environment.retryAttempts;

  // ===== CONSTANTES =====
  private readonly TOKEN_KEY = environment.tokenKey;

  // ===== MÉTHODES PRIVÉES =====

  /**
   * Récupère le token d'authentification depuis le localStorage
   */
  private getToken(): string {
    const token = localStorage.getItem(this.TOKEN_KEY);
    return token ? token.replace(/^"(.*)"$/, '$1').trim() : '';
  }

  /**
   * Crée les headers HTTP avec le token d'authentification
   */
  private createHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }

  /**
   * Gestionnaire d'erreurs centralisé
   */
  private handleError<T>(operation: string, fallbackValue?: T) {
    return (error: HttpErrorResponse): Observable<T> => {
      if (this.enableDebug) {
        console.error(`❌ Erreur ${operation}:`, error);
        if (error.status) console.error('📡 Status:', error.status);
        if (error.message) console.error('📝 Message:', error.message);
        if (error.error?.message) console.error('💬 Détail:', error.error.message);
      }
      return fallbackValue !== undefined ? of(fallbackValue) : throwError(() => error);
    };
  }

  /**
   * Construit la hiérarchie des entités
   */
  private buildHierarchy(entites: any[]): any[] {
    const map = new Map();
    const racines: any[] = [];

    entites.forEach(entite => {
      map.set(entite.id, { ...entite, enfants: [] });
    });

    entites.forEach(entite => {
      const entiteAvecEnfants = map.get(entite.id);
      if (entite.parent_id && map.has(entite.parent_id)) {
        const parent = map.get(entite.parent_id);
        parent.enfants.push(entiteAvecEnfants);
      } else {
        racines.push(entiteAvecEnfants);
      }
    });

    return racines;
  }

  /**
   * Génère des données mockées pour le fallback
   */
  private generateMockEntites(): any[] {
    if (this.enableDebug) {
      console.log('📦 Utilisation des données mockées pour les entités');
    }
    return [];
  }

  // ===== MÉTHODES PUBLIQUES =====

  /**
   * Récupère toutes les entités (arbre hiérarchique)
   */
  getEntites(): Observable<any[]> {
    if (this.enableDebug) {
      console.log('📤 Récupération des entités');
    }

    return this.http.get(`${this.apiUrl}/entites`, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) {
            console.log('✅ Entités récupérées avec succès');
          }
          return response.data?.arbre || [];
        }
        return [];
      }),
      catchError((error) => {
        if (this.enableDebug) {
          console.error('❌ Erreur API getEntites, fallback vers données mockées');
        }
        return of(this.generateMockEntites()).pipe(
          map(entites => this.buildHierarchy(entites))
        );
      })
    );
  }

  /**
   * Ajoute une nouvelle entité
   */
  addEntite(entiteData: any): Observable<any> {
    const payload = {
      nom: entiteData.nom,
      entite_principale_id: entiteData.entite_principale_id || null
    };

    if (this.enableDebug) {
      console.log('📤 Ajout entité:', payload);
    }

    return this.http.post(`${this.apiUrl}/entites`, payload, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) {
            console.log('✅ Entité ajoutée avec succès:', response.data);
          }
          return response.data;
        }
        throw new Error(response.message || "Erreur lors de l'ajout");
      }),
      catchError(this.handleError('addEntite'))
    );
  }

  /**
   * Modifie une entité existante
   */
  updateEntite(id: number, entiteData: any): Observable<any> {
    const payload = {
      nom: entiteData.nom,
      entite_principale_id: entiteData.entite_principale_id || null
    };

    if (this.enableDebug) {
      console.log(`📤 Modification entité #${id}:`, payload);
    }

    return this.http.put(`${this.apiUrl}/entites/${id}`, payload, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) {
            console.log('✅ Entité modifiée avec succès:', response.data);
          }
          return response.data;
        }
        throw new Error(response.message || 'Erreur lors de la modification');
      }),
      catchError(this.handleError('updateEntite'))
    );
  }

  /**
   * Supprime une entité de façon forcée
   */
  deleteEntiteForce(id: number): Observable<any> {
    if (this.enableDebug) {
      console.log(`📤 Suppression forcée entité #${id}`);
    }

    return this.http.delete(`${this.apiUrl}/entites/${id}/force`, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) {
            console.log('✅ Entité supprimée:', response.message);
          }
          return response;
        }
        throw new Error(response.message || 'Erreur lors de la suppression');
      }),
      catchError(this.handleError('deleteEntiteForce'))
    );
  }

  /**
   * Supprime une entité (version douce - si l'API la supporte)
   */
  deleteEntite(id: number): Observable<any> {
    if (this.enableDebug) {
      console.log(`📤 Suppression entité #${id}`);
    }

    return this.http.delete(`${this.apiUrl}/entites/${id}`, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) {
            console.log('✅ Entité supprimée:', response.message);
          }
          return response;
        }
        throw new Error(response.message || 'Erreur lors de la suppression');
      }),
      catchError(this.handleError('deleteEntite'))
    );
  }

  /**
   * Aplatit la hiérarchie des entités pour les selects
   */
  flattenHierarchy(entites: any[], niveau: number = 0, parentNom: string = ''): any[] {
    let result: any[] = [];

    entites.forEach(entite => {
      const indent = '—'.repeat(niveau);
      const displayName = niveau > 0 ? `${indent} ${entite.nom}` : entite.nom;

      result.push({
        ...entite,
        niveau,
        parent_nom: parentNom,
        indent: displayName,
        displayNom: displayName,
        cheminComplet: parentNom ? `${parentNom} → ${entite.nom}` : entite.nom
      });

      if (entite.enfants && entite.enfants.length > 0) {
        result = result.concat(
          this.flattenHierarchy(entite.enfants, niveau + 1, entite.nom)
        );
      }
    });

    return result;
  }

  /**
   * Récupère une entité par son ID
   */
  getEntiteById(id: number): Observable<any> {
    if (this.enableDebug) {
      console.log(`📤 Récupération entité #${id}`);
    }

    return this.http.get(`${this.apiUrl}/entites/${id}`, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          return response.data;
        }
        throw new Error(response.message || 'Erreur lors de la récupération');
      }),
      catchError(this.handleError('getEntiteById'))
    );
  }

  /**
   * Récupère la liste plate des entités (sans hiérarchie)
   */
  getEntitesListe(): Observable<any[]> {
    if (this.enableDebug) {
      console.log('📤 Récupération liste plate des entités');
    }

    return this.http.get(`${this.apiUrl}/entites`, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          return response.data?.liste || [];
        }
        return [];
      }),
      catchError(this.handleError('getEntitesListe', []))
    );
  }

  /**
   * Récupère les statistiques des entités
   */
  getEntitesStats(): Observable<any> {
    if (this.enableDebug) {
      console.log('📤 Récupération statistiques entités');
    }

    return this.http.get(`${this.apiUrl}/entites/stats`, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          return response.data;
        }
        return {
          total: 0,
          par_niveau: {},
          avec_enfants: 0,
          sans_enfants: 0
        };
      }),
      catchError(this.handleError('getEntitesStats', {
        total: 0,
        par_niveau: {},
        avec_enfants: 0,
        sans_enfants: 0
      }))
    );
  }

  /**
   * Vérifie si une entité peut être supprimée
   */
  canDeleteEntite(id: number): Observable<boolean> {
    if (this.enableDebug) {
      console.log(`📤 Vérification suppression entité #${id}`);
    }

    return this.http.get(`${this.apiUrl}/entites/${id}/can-delete`, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      map((response: any) => {
        if (response.success) {
          return response.data?.can_delete || false;
        }
        return false;
      }),
      catchError(this.handleError('canDeleteEntite', false))
    );
  }

  /**
   * Déplace une entité (change son parent)
   */
  moveEntite(id: number, newParentId: number | null): Observable<any> {
    if (this.enableDebug) {
      console.log(`📤 Déplacement entité #${id} vers parent #${newParentId}`);
    }

    return this.http.patch(`${this.apiUrl}/entites/${id}/move`, {
      entite_principale_id: newParentId
    }, {
      headers: this.createHeaders()
    }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) {
            console.log('✅ Entité déplacée avec succès');
          }
          return response.data;
        }
        throw new Error(response.message || 'Erreur lors du déplacement');
      }),
      catchError(this.handleError('moveEntite'))
    );
  }
}
