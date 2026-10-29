import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class RapportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/rapports`;

  // ==========================================================
  // 1. RAPPORT GLOBAL / SYNTHÈSE
  // ==========================================================
  getRapportGlobal(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/global`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getSynthese(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/synthese`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  // ==========================================================
  // 2. RAPPORTS TICKETS
  // ==========================================================
  getRapportTickets(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/tickets`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportTicketsParPeriode(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/par-periode`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportTicketsParStatut(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/par-statut`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportTicketsParCategorie(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/par-categorie`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportTicketsParPriorite(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/par-priorite`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportTicketsParEntite(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/par-entite`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportTicketsParAgent(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/par-agent`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportTicketsSLA(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/tickets/sla`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportTicketsReclamations(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/reclamations`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportTicketsEnRetard(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/tickets/en-retard`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================
  // 3. RAPPORTS UTILISATEURS
  // ==========================================================
  getRapportUtilisateurs(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/utilisateurs`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportUtilisateursParProfil(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/utilisateurs/par-profil`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportUtilisateursParEntite(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/utilisateurs/par-entite`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportUtilisateursActifs(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/utilisateurs/actifs`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportUtilisateursInactifs(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/utilisateurs/inactifs`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================
  // 4. RAPPORTS ENTITÉS
  // ==========================================================
  getRapportEntites(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/entites`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportEntitesPerformance(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/entites/performance`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportEntitesActivite(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/entites/activite`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================
  // 5. RAPPORTS ÉLÉMENTS / MATÉRIELS
  // ==========================================================
  getRapportElements(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/elements`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportElementsParType(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/elements/par-type`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportElementsParEtat(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/elements/par-etat`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportElementsDefectueux(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/elements/defectueux`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportElementsMaintenance(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/elements/maintenance`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================
  // 6. RAPPORTS SLA & PERFORMANCE
  // ==========================================================
  getRapportSLA(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/sla`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportPerformance(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/performance`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportDelais(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/delais`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  // ==========================================================
  // 7. RAPPORTS ACTIVITÉ / LOGS
  // ==========================================================
  getRapportActivite(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/activite`, { params }).pipe(
      catchError(() => of({}))
    );
  }

  getRapportActiviteParUtilisateur(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/activite/par-utilisateur`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  getRapportConnexions(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any[]>(`${this.apiUrl}/activite/connexions`, { params }).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================
  // 8. RAPPORTS PERSONNALISÉS
  // ==========================================================
  getRapportsDisponibles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/disponibles`).pipe(
      catchError(() => of([]))
    );
  }

  genererRapportPersonnalise(config: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/personnalise`, config).pipe(
      catchError(() => of({}))
    );
  }

  // ==========================================================
  // 9. EXPORT
  // ==========================================================
  exporterRapport(type: string, format: string, filters: any = {}): Observable<Blob> {
    const params = this.buildParams({ ...filters, format });
    return this.http.get(`${this.apiUrl}/export/${type}`, {
      params,
      responseType: 'blob',
    });
  }

  // ==========================================================
  // CHARGEMENT GLOBAL
  // ==========================================================
  loadAllRapports(filters: any = {}): Observable<any> {
    return forkJoin({
      global: this.getRapportGlobal(filters),
      synthese: this.getSynthese(filters),
      tickets: this.getRapportTickets(filters),
      ticketsParStatut: this.getRapportTicketsParStatut(filters),
      ticketsParCategorie: this.getRapportTicketsParCategorie(filters),
      ticketsParPriorite: this.getRapportTicketsParPriorite(filters),
      ticketsParEntite: this.getRapportTicketsParEntite(filters),
      ticketsParAgent: this.getRapportTicketsParAgent(filters),
      ticketsSLA: this.getRapportTicketsSLA(filters),
      ticketsReclamations: this.getRapportTicketsReclamations(filters),
      ticketsEnRetard: this.getRapportTicketsEnRetard(filters),
      utilisateurs: this.getRapportUtilisateurs(filters),
      utilisateursParProfil: this.getRapportUtilisateursParProfil(filters),
      utilisateursParEntite: this.getRapportUtilisateursParEntite(filters),
      utilisateursActifs: this.getRapportUtilisateursActifs(filters),
      utilisateursInactifs: this.getRapportUtilisateursInactifs(filters),
      entites: this.getRapportEntites(filters),
      entitesPerformance: this.getRapportEntitesPerformance(filters),
      elements: this.getRapportElements(filters),
      elementsParType: this.getRapportElementsParType(filters),
      elementsParEtat: this.getRapportElementsParEtat(filters),
      elementsDefectueux: this.getRapportElementsDefectueux(filters),
      elementsMaintenance: this.getRapportElementsMaintenance(filters),
      sla: this.getRapportSLA(filters),
      performance: this.getRapportPerformance(filters),
      delais: this.getRapportDelais(filters),
      activite: this.getRapportActivite(filters),
      activiteParUtilisateur: this.getRapportActiviteParUtilisateur(filters),
      connexions: this.getRapportConnexions(filters),
    });
  }

  // ===== MÉTHODES PRIVÉES =====
  private buildParams(filters: any): HttpParams {
    let params = new HttpParams();
    Object.keys(filters).forEach((key) => {
      const value = filters[key];
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }
}
