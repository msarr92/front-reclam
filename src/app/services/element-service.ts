import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ElementService {
  private apiUrl = 'http://127.0.0.1:8000/api';

  constructor(private http: HttpClient) {}

   // ===== RÉCUPÉRER TOUS LES ÉLÉMENTS (ZONES ET LIEUX) =====
  getElements(): Observable<any> {
    return this.http.get(`${this.apiUrl}/elements`).pipe(
      map((response: any) => {
        if (response.success) {
          return response.data; // Retourne { liste, arbre }
        }
        return { liste: [], arbre: [] };
      }),
      catchError((error) => {
        console.error('Erreur API getElements:', error);
        // Fallback vers les données mockées
        return of({
          liste: [...this.generateMockZones(), ...this.generateMockLieux()],
          arbre: []
        });
      })
    );
  }

  // ===== EXTRAIRE LES ZONES DEPUIS LA LISTE =====
  extractZonesFromElements(elements: any[]): any[] {
    // Les zones sont les éléments sans parent (element_principal_id = null)
    return elements.filter(el => !el.element_principal_id);
  }

  // ===== EXTRAIRE LES LIEUX DEPUIS LA LISTE =====
  extractLieuxFromElements(elements: any[]): any[] {
    // Les lieux sont les éléments avec un parent (element_principal_id != null)
    return elements.filter(el => el.element_principal_id);
  }

  // ===== RÉCUPÉRER LES STATISTIQUES =====
  getStats(): Observable<any> {
    return this.getElements().pipe(
      map((data) => {
        const elements = data.liste || [];
        const zones = this.extractZonesFromElements(elements);
        const lieux = this.extractLieuxFromElements(elements);

        return {
          total_zones: zones.length,
          total_lieux: lieux.length,
          zones_actives: zones.filter(z => z.statut === 'actif').length,
          lieux_actifs: lieux.filter(l => l.statut === 'actif').length
        };
      }),
      catchError((error) => {
        console.error('Erreur calcul stats:', error);
        return of({
          total_zones: 0,
          total_lieux: 0,
          zones_actives: 0,
          lieux_actifs: 0
        });
      })
    );
  }

   // ===== AJOUTER UN ÉLÉMENT (ZONE OU LIEU) =====
  ajouterElement(elementData: any): Observable<any> {
    const payload = {
      nom: elementData.nom,
      element_principal_id: elementData.element_principal_id || null
    };

    return this.http.post(`${this.apiUrl}/elements`, payload).pipe(
      map((response: any) => {
        if (response.success) {
          // console.log('✅ Élément ajouté avec succès:', response.data);
          return response.data;
        }
        throw new Error(response.message || 'Erreur lors de l\'ajout');
      }),
      catchError((error) => {
        console.error('❌ Erreur API ajouterElement:', error);
        return throwError(() => error);
      })
    );
  }


  // ===== MODIFIER UN ÉLÉMENT =====
  modifierElement(id: number, elementData: any): Observable<any> {
    const payload = {
      nom: elementData.nom,
      element_principal_id: elementData.element_principal_id || null
    };

    return this.http.put(`${this.apiUrl}/elements/${id}`, payload).pipe(
      map((response: any) => {
        if (response.success) {
          // console.log('✅ Élément modifié avec succès:', response.data);
          return response.data;
        }
        throw new Error(response.message || 'Erreur lors de la modification');
      }),
      catchError((error) => {
        console.error('❌ Erreur API modifierElement:', error);
        return throwError(() => error);
      })
    );
  }


   // ===== SUPPRIMER UN ÉLÉMENT =====
  supprimerElement(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/elements/${id}`).pipe(
      map((response: any) => {
        if (response.success) {
          // console.log('✅ Élément supprimé avec succès:', response.message);
          return response;
        }
        throw new Error(response.message || 'Erreur lors de la suppression');
      }),
      catchError((error) => {
        console.error('❌ Erreur API supprimerElement:', error);
        return throwError(() => error);
      })
    );
  }

  // ===== GÉNÉRER DES DONNÉES EXEMPLE =====
  private generateMockZones(): any[] {
    return [
      // { id: 1, nom: 'DAKAR', description: 'Zone de Dakar', statut: 'actif', created_at: '2025-01-01' },
      // { id: 2, nom: 'THIES', description: 'Zone de Thiès', statut: 'actif', created_at: '2025-01-02' },
      // { id: 3, nom: 'SAINT-LOUIS', description: 'Zone de Saint-Louis', statut: 'actif', created_at: '2025-01-03' },
      // { id: 4, nom: 'ZIGUINCHOR', description: 'Zone de Ziguinchor', statut: 'inactif', created_at: '2025-01-04' },
      // { id: 5, nom: 'DIOURBEL', description: 'Zone de Diourbel', statut: 'actif', created_at: '2025-01-05' }
    ];
  }

  private generateMockLieux(): any[] {
    return [
      // { id: 1, nom: 'MEDINA', zone_id: 1, zone_nom: 'DAKAR', type: 'quartier', statut: 'actif', created_at: '2025-01-10' },
      // { id: 2, nom: 'SANDAGA', zone_id: 1, zone_nom: 'DAKAR', type: 'marché', statut: 'actif', created_at: '2025-01-11' },
      // { id: 3, nom: 'PLATEAU', zone_id: 1, zone_nom: 'DAKAR', type: 'quartier', statut: 'actif', created_at: '2025-01-12' },
      // { id: 4, nom: 'YEUMBEUL', zone_id: 1, zone_nom: 'DAKAR', type: 'quartier', statut: 'actif', created_at: '2025-01-13' },
      // { id: 5, nom: 'PARCELLES ASSAINIES', zone_id: 1, zone_nom: 'DAKAR', type: 'quartier', statut: 'actif', created_at: '2025-01-14' },
      // { id: 6, nom: 'MBOUR', zone_id: 2, zone_nom: 'THIES', type: 'ville', statut: 'actif', created_at: '2025-01-15' },
      // { id: 7, nom: 'TIVAOUANE', zone_id: 2, zone_nom: 'THIES', type: 'ville', statut: 'inactif', created_at: '2025-01-16' },
      // { id: 8, nom: 'KHOMBOLE', zone_id: 3, zone_nom: 'SAINT-LOUIS', type: 'quartier', statut: 'actif', created_at: '2025-01-17' },
      // { id: 9, nom: 'NDAR TOUT', zone_id: 3, zone_nom: 'SAINT-LOUIS', type: 'quartier', statut: 'actif', created_at: '2025-01-18' },
      // { id: 10, nom: 'SOR', zone_id: 3, zone_nom: 'SAINT-LOUIS', type: 'quartier', statut: 'actif', created_at: '2025-01-19' }
    ];
  }


}
