import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DlgasService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getToken(): string {
    const token = localStorage.getItem('token');
    return token ? token.replace(/^"(.*)"$/, '$1').trim() : '';
  }

  private createHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }

  // ============================================================
  // ✅ Récupérer TOUS les DLGAS (profil = 'dlgas')
  // ============================================================
  getAllDlgas(): Observable<any[]> {
    const params = new HttpParams()
      .set('per_page', '100')
      .set('profil', 'dlgas');

    return this.http.get(`${this.apiUrl}/users`, {
      headers: this.createHeaders(),
      params: params,
    }).pipe(
      map((response: any) => {
        if (response.success) {
          const usersData = response.data.users;
          const usersList = usersData?.data || usersData || [];

          return usersList
            .filter((user: any) => user.profil === 'dlgas')
            .map((user: any) => ({
              id: user.id,
              nom: `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email || `DLGAS #${user.id}`,
              prenom: user.prenom || '',
              nom_famille: user.nom || '',
              email: user.email,
              username: user.username,
              telephone: user.telephone || '',
              profil: user.profil,
              statut: user.statut || 'actif',
            }));
        }
        return [];
      }),
      catchError((error) => {
        console.error('❌ Erreur getAllDlgas:', error);
        return of([]);
      })
    );
  }

  // ============================================================
  // ✅ Ajouter un DLGAS (SANS entite_id)
  // ============================================================
  addDlgas(data: any): Observable<any> {
    const password = 'password123';

    const payload = {
      nom: data.nom,
      prenom: data.prenom,
      username: this.generateUsername(data.nom, data.prenom),
      email: data.email,
      password: password,
      password_confirmation: password,
      telephone: data.telephone || null,
      // ✅ 'entite_id' RETIRÉ
    };

    console.log('📤 [addDlgas] Payload:', payload);

    return this.http.post(`${this.apiUrl}/users/dlgas`, payload, {
      headers: this.createHeaders(),
    }).pipe(
      map((response: any) => {
        if (response.success) {
          return response.data;
        }
        throw new Error(response.message);
      }),
      catchError((error) => {
        console.error('❌ Erreur addDlgas:', error);
        throw error;
      })
    );
  }

  private generateUsername(nom: string, prenom: string): string {
    const base = (nom + prenom).toLowerCase().replace(/[^a-z0-9]/g, '');
    const random = Math.floor(Math.random() * 1000);
    return `${base}${random}`;
  }

  // ============================================================
  // ✅ Mettre à jour un DLGAS
  // ============================================================
  updateDlgas(id: number, data: any): Observable<any> {
    const payload = {
      nom: data.nom,
      prenom: data.prenom,
      telephone: data.telephone,
      statut: data.statut,
      // ✅ PAS d'entite_id
    };

    return this.http.put(`${this.apiUrl}/users/${id}`, payload, {
      headers: this.createHeaders(),
    }).pipe(
      map((response: any) => {
        if (response.success) {
          return response.data;
        }
        throw new Error(response.message);
      }),
      catchError((error) => {
        console.error('❌ Erreur updateDlgas:', error);
        throw error;
      })
    );
  }

  // ============================================================
  // ✅ Supprimer un DLGAS
  // ============================================================
  deleteDlgas(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${id}`, {
      headers: this.createHeaders(),
    });
  }

  // ============================================================
  // ✅ Activer / Désactiver
  // ============================================================
  activerDlgas(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/activer`, {}, {
      headers: this.createHeaders(),
    });
  }

  desactiverDlgas(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/desactiver`, {}, {
      headers: this.createHeaders(),
    });
  }

  // ============================================================
  // ✅ Statistiques
  // ============================================================
  getDlgasStats(): Observable<any> {
    const params = new HttpParams()
      .set('per_page', '100')
      .set('profil', 'dlgas');

    return this.http.get(`${this.apiUrl}/users`, {
      headers: this.createHeaders(),
      params: params,
    }).pipe(
      map((response: any) => {
        if (response.success) {
          const usersData = response.data.users;
          const usersList = usersData?.data || usersData || [];
          const dlgasOnly = usersList.filter((u: any) => u.profil === 'dlgas');

          const actifs = dlgasOnly.filter((u: any) => u.statut === 'actif').length;
          const inactifs = dlgasOnly.filter((u: any) => u.statut === 'inactif').length;

          return {
            total: dlgasOnly.length,
            actifs: actifs,
            inactifs: inactifs,
            nouveaux: 0,
            regions: 14,
          };
        }
        return { total: 0, actifs: 0, inactifs: 0, nouveaux: 0, regions: 0 };
      }),
      catchError(() => of({ total: 0, actifs: 0, inactifs: 0, nouveaux: 0, regions: 0 }))
    );
  }

  // ============================================================
  // ✅ Tickets DLGAS
  // ============================================================
  getTicketsDlga(params?: any): Observable<any> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.per_page) httpParams = httpParams.set('per_page', params.per_page.toString());
      if (params.statut && params.statut !== 'Tous') {
        httpParams = httpParams.set('statut', params.statut);
      }
      if (params.urgence && params.urgence !== 'Toutes') {
        httpParams = httpParams.set('urgence', params.urgence);
      }
      if (params.dlgas_id && params.dlgas_id !== 0) {
        httpParams = httpParams.set('dlgas_id', params.dlgas_id.toString());
      }
      if (params.search && params.search.trim() !== '') {
        httpParams = httpParams.set('search', params.search);
      }
    }

    return this.http.get(`${this.apiUrl}/tickets/dlgas`, {
      headers: this.createHeaders(),
      params: httpParams,
    }).pipe(
      map((response: any) => {
        if (response.success) {
          return response.data;
        }
        return { data: [], current_page: 1, last_page: 1, total: 0 };
      }),
      catchError((error) => {
        console.error('❌ Erreur getTicketsDlga:', error);
        return of({ data: [], current_page: 1, last_page: 1, total: 0 });
      })
    );
  }

  // ============================================================
  // ✅ Récupérer un DLGAS par ID
  // ============================================================
  getDlgasById(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/users/${id}`, {
      headers: this.createHeaders(),
    }).pipe(
      map((response: any) => {
        if (response.success) {
          const user = response.data;
          return {
            id: user.id,
            nom: `${user.prenom} ${user.nom}`,
            prenom: user.prenom,
            nom_famille: user.nom,
            email: user.email,
            telephone: user.telephone || 'Non renseigné',
            statut: user.statut || 'actif',
            username: user.username,
          };
        }
        return null;
      }),
      catchError(() => of(null))
    );
  }

  // ============================================================
  // ✅ Régions (statique)
  // ============================================================
  getRegions(): Observable<string[]> {
    return of([
      'Dakar', 'Thiès', 'Diourbel', 'Fatick', 'Kaolack', 'Kaffrine',
      'Kolda', 'Sédhiou', 'Ziguinchor', 'Saint-Louis', 'Louga',
      'Matam', 'Tambacounda', 'Kédougou',
    ]);
  }
}
