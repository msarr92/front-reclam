// dashboard-services.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ===== RÉCUPÉRER LE TOKEN =====
  private getToken(): string {
    const token = localStorage.getItem('token');
    return token ? token.replace(/^"(.*)"$/, '$1').trim() : '';
  }

  // ===== CRÉER LES HEADERS =====
  private createHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }

  // ===== STATISTIQUES GÉNÉRALES =====
  getStatistiquesGenerales(): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/dashboard/statistiques`, {
        headers: this.createHeaders(),
      })
      .pipe(
        tap((response: any) => {
          console.log('📊 Statistiques reçues:', response);
        }),
        catchError((error) => {
          console.error('❌ Erreur récupération statistiques:', error);
          return throwError(() => error);
        })
      );
  }

  // ===== TICKETS RÉCENTS =====
   getRecentTickets(limit: number = 10): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/dashboard/tickets-recents?limit=${limit}`, {
        headers: this.createHeaders(),
      })
      .pipe(
        tap((response: any) => console.log('🎫 Tickets récents:', response)),
        catchError((error) => {
          console.error('❌ Erreur tickets récents:', error);
          return throwError(() => error);
        })
      );
  }

  // ===== ACTIVITÉS RÉCENTES =====
  getRecentActivities(limit: number = 10): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/dashboard/activite-recente?limit=${limit}`, {
        headers: this.createHeaders(),
      })
      .pipe(
        tap((response: any) => console.log('Activités récentes:', response)),
        catchError((error) => {
          console.error('❌ Erreur activités récentes:', error);
          return throwError(() => error);
        })
      );
  }

  // ===== ACTIVITÉS UTILISATEURS =====
   getUserActivities(limit: number = 10): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/dashboard/activite-utilisateurs?limit=${limit}`, {
        headers: this.createHeaders(),
      })
      .pipe(
        tap((response: any) => console.log('👤 Activités utilisateurs:', response)),
        catchError((error) => {
          console.error('❌ Erreur activités utilisateurs:', error);
          return throwError(() => error);
        })
      );
  }

  // ===== RÉPARTITION DES STATUTS =====
  getRepartitionStatuts(): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/dashboard/repartition-statuts`, {
        headers: this.createHeaders(),
      })
      .pipe(
        tap((response: any) => {
          console.log('📊 Répartition des statuts reçue:', response);
        }),
        catchError((error) => {
          console.error('❌ Erreur récupération répartition statuts:', error);
          return throwError(() => error);
        })
      );
  }

  // ===== ÉVOLUTION DES TICKETS =====
  getEvolutionTickets(): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/dashboard/evolution-tickets`, {
        headers: this.createHeaders(),
      })
      .pipe(
        tap((response: any) => {
          console.log('📈 Évolution des tickets reçue:', response);
        }),
        catchError((error) => {
          console.error('❌ Erreur récupération évolution tickets:', error);
          return throwError(() => error);
        })
      );
  }
}
