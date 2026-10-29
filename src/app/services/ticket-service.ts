import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, throwError, timeout, retry } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth-services';

@Injectable({
  providedIn: 'root',
})
export class TicketService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;
  private readonly enableDebug = environment.enableDebug;
  private readonly timeoutDuration = environment.timeout;
  private readonly retryAttempts = environment.retryAttempts;
  private readonly tokenKey = environment.tokenKey;

  // ===== MÉTHODES PRIVÉES =====

  private getToken(): string {
    const token = localStorage.getItem(this.tokenKey);
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

  private handleError<T>(operation: string, fallbackValue?: T) {
    return (error: HttpErrorResponse): Observable<T> => {
      if (this.enableDebug) {
        console.error(`❌ Erreur ${operation}:`, error);
      }
      return fallbackValue !== undefined ? of(fallbackValue) : throwError(() => error);
    };
  }

  private getCurrentUserId(): number {
    const userStr = localStorage.getItem(environment.userKey);
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user?.id || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  // ============================================================
  // TICKETS
  // ============================================================

  getTickets(params?: any): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.per_page) httpParams = httpParams.set('per_page', params.per_page.toString());
      if (params.statut && params.statut !== 'tous')
        httpParams = httpParams.set('statut', params.statut);
      if (params.urgence && params.urgence !== 'toutes')
        httpParams = httpParams.set('urgence', params.urgence);
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.type && params.type !== 'tous') httpParams = httpParams.set('type', params.type);
    }

    return this.http
      .get(`${this.apiUrl}/tickets`, {
        headers: this.createHeaders(),
        params: httpParams,
      })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          // ✅ Structure Laravel paginate : response.data.data
          if (response.success && response.data) {
            const rawTickets = response.data.data || [];

            // ✅ Transformer chaque ticket
            const transformedTickets = Array.isArray(rawTickets)
              ? rawTickets.map((t: any) => this.transformTicket(t))
              : [];

            console.log('📥 [getTickets] Tickets transformés:', transformedTickets.length);
            if (transformedTickets.length > 0) {
              console.log('📋 Premier ticket transformé:', transformedTickets[0]);
            }

            return {
              data: transformedTickets,
              current_page: response.data.current_page,
              last_page: response.data.last_page,
              total: response.data.total,
              per_page: response.data.per_page,
              from: response.data.from,
              to: response.data.to,
            };
          }
          return { data: [], total: 0, last_page: 1, current_page: 1 };
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('❌ [getTickets] Erreur:', {
            status: error.status,
            message: error.message,
            laravelError: error.error?.error,
            laravelFile: error.error?.file,
            laravelLine: error.error?.line,
          });
          return of({ data: [], total: 0, last_page: 1, current_page: 1 });
        }),
      );
  }

  /**
   * Transforme un ticket brut de l'API vers le format attendu par le composant
   */
  private transformTicket(ticket: any): any {
    // ✅ Calculer si le SLA est démarré
    const slaDemarre = ticket.sla_started_at !== null && ticket.sla_started_at !== undefined;
    const slaDateDebut = slaDemarre ? ticket.sla_started_at : null;

    // ✅ Construire le nom du créateur (priorité à utilisateur)
    let createurNom = 'Inconnu';
    if (ticket.utilisateur) {
      const user = ticket.utilisateur;
      createurNom = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.username || 'Inconnu';
    } else if (ticket.prenom && ticket.nom) {
      createurNom = `${ticket.prenom} ${ticket.nom}`;
    }

    // ✅ Date : priorité à date_ouverture puis created_at
    const dateCreation = ticket.date_ouverture || ticket.created_at || null;

    return {
      // Identifiants
      id: ticket.id,
      num_ticket: ticket.num_ticket || `#${ticket.id}`,

      // Type et titre
      titre: ticket.type || 'Ticket', // ✅ Type → titre
      type: ticket.type || 'declaration', // ✅ Type original

      // Description
      description: ticket.detail || ticket.description || '',

      // Statut
      statut: ticket.statut || 'en_attente',

      // Priorité (mapping urgence → priorite)
      priorite: ticket.urgence || 'moyenne', // ✅ urgence → priorite
      urgence: ticket.urgence,

      // Catégorie
      categorie: ticket.categorie || 'autre',

      // Date
      date_creation: dateCreation, // ✅ Date correcte

      // Créateur
      createur_nom: createurNom, // ✅ Nom complet
      createur_id: ticket.user_id,

      // Relations
      entite_nom: ticket.entite?.nom || 'Non spécifiée',
      entite_id: ticket.entite_id,
      element_nom: ticket.element?.nom || 'Non spécifié',
      element_id: ticket.element_id,
      dlgas_id: ticket.dlgas_id,

      // Demandeur
      prenom: ticket.prenom,
      nom: ticket.nom,
      email: ticket.email,
      telephone: ticket.telephone,
      adresse: ticket.adresse,
      source_demande: ticket.source_demande,

      // SLA
      sla_ttr: ticket.sla_ttr,
      sla_demarre: slaDemarre, // ✅ SLA démarré calculé
      sla_date_debut: slaDateDebut, // ✅ Date début SLA
      sla_started_at: ticket.sla_started_at,
      sla_due_at: ticket.sla_due_at,

      // Commentaires
      commentaires: ticket.commentaires || ticket.discussions || [],
    };
  }

  getTicketById(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/tickets/${id}`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          const t = response.data;
          return {
            id: t.id,
            num_ticket: t.num_ticket,
            type: t.type,
            categorie: t.categorie,
            statut: t.statut,
            urgence: t.urgence,
            source_demande: t.source_demande,
            prenom: t.prenom,
            nom: t.nom,
            telephone: t.telephone,
            email: t.email,
            adresse: t.adresse,
            detail: t.detail,
            user_id: t.user_id,
            observateur_id: t.observateur_id,
            entite_id: t.entite_id,
            sous_entite_id: t.sous_entite_id || null,
            element_id: t.element_id || null,
            dlgas_id: t.dlgas_id,
            date_creation: t.created_at,
            discussions: t.discussions || [],
          };
        }
        throw new Error(response.message);
      }),
      catchError(this.handleError('getTicketById')),
    );
  }

  ajouterTicket(ticketData: any): Observable<any> {
    const payload = {
      type: ticketData.type,
      categorie: ticketData.categorie,
      urgence: ticketData.urgence,
      source_demande: ticketData.source_demande,
      sla_ttr: ticketData.sla_ttr,
      prenom: ticketData.prenom,
      nom: ticketData.nom,
      telephone: ticketData.telephone,
      email: ticketData.email,
      adresse: ticketData.adresse,
      detail: ticketData.detail,
      sous_entite_id: ticketData.sous_entite_id ? parseInt(ticketData.sous_entite_id, 10) : null,
      element_id: ticketData.element_id ? parseInt(ticketData.element_id, 10) : null,
      observateur_id: ticketData.observateur_id ? parseInt(ticketData.observateur_id, 10) : null,
      dlgas_id: ticketData.dlgas_id ? parseInt(ticketData.dlgas_id.toString(), 10) : null, // ✅ corrigé
      entite_id: ticketData.entite_id ? parseInt(ticketData.entite_id, 10) : null,
    };

    console.log('📤 [ajouterTicket] Payload envoyé:', payload);

    return this.http
      .post(`${this.apiUrl}/tickets`, payload, { headers: this.createHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        // ⚠️ Retirer le retry sur POST : un POST ne doit PAS être retenté
        map((response: any) => (response.success ? response.data : null)),
        catchError((error: HttpErrorResponse) => {
          console.error('❌ [ajouterTicket] Erreur détaillée:', {
            status: error.status,
            message: error.message,
            laravelError: error.error?.error,
            laravelMessage: error.error?.message,
            laravelFile: error.error?.file,
            laravelLine: error.error?.line,
            validation: error.error?.errors,
          });
          return throwError(() => error);
        }),
      );
  }

  modifierTicket(id: number, ticketData: any): Observable<any> {
    const payload = {
      ...ticketData,
      sous_entite_id: ticketData.sous_entite_id ? parseInt(ticketData.sous_entite_id, 10) : null,
      element_id: ticketData.element_id ? parseInt(ticketData.element_id, 10) : null,
      observateur_id: ticketData.observateur_id ? parseInt(ticketData.observateur_id, 10) : null,
      dlgas_id: ticketData.dlgas_id ? parseInt(ticketData.dlgas_id.toString(), 10) : null,
      entite_id: ticketData.entite_id ? parseInt(ticketData.entite_id.toString(), 10) : null,
    };

    return this.http
      .put(`${this.apiUrl}/tickets/${id}`, payload, { headers: this.createHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        map((response: any) => (response.success ? response.data : null)),
        catchError(this.handleError('modifierTicket')),
      );
  }

  supprimerTicket(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/tickets/${id}`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => response),
      catchError(this.handleError('supprimerTicket')),
    );
  }

  changerStatut(id: number, statut: string): Observable<any> {
    return this.http
      .patch(`${this.apiUrl}/tickets/${id}/statut`, { statut }, { headers: this.createHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => (response?.success ? response.data : null)),
        catchError(this.handleError('changerStatut')),
      );
  }

  getStatistiques(): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/tickets/statistiques`, { headers: this.createHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        map((response: any) => {
          if (response?.success) {
            return response.data;
          }
          throw new Error(response?.message || 'Erreur lors du chargement des statistiques');
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('❌ [getStatistiques] Erreur:', {
            status: error.status,
            message: error.message,
            laravelMessage: error.error?.message,
          });
          return throwError(() => error);
        }),
      );
  }

  verifierSLA(ticketId: number): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/tickets/verifier-sla/${ticketId}`, { headers: this.createHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response?.success) return response.data;
          throw new Error(response?.message || 'Erreur SLA');
        }),
        catchError(this.handleError('verifierSLA')),
      );
  }

  // ============================================================
  // DISCUSSIONS / MESSAGES
  // ============================================================

  envoyerMessage(ticketId: number, message: string, type: string = 'information'): Observable<any> {
    return this.http
      .post(
        `${this.apiUrl}/discussions`,
        { ticket_id: ticketId, message, type },
        { headers: this.createHeaders() },
      )
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) return response.data;
          throw new Error(response.message);
        }),
        catchError(this.handleError('envoyerMessage')),
      );
  }

  getMessages(ticketId: number): Observable<any[]> {
    return this.http
      .get(`${this.apiUrl}/tickets/${ticketId}/discussions`, { headers: this.createHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) {
            return response.data.map((msg: any) => ({
              id: msg.id,
              message: msg.message,
              type: msg.type || '',
              user_id: msg.user_id,
              user_nom: msg.user_nom,
              created_at: msg.created_at,
              is_current_user: msg.user_id === this.getCurrentUserId(),
              attachments: msg.attachments || [],
              accepted_at: msg.accepted_at || null,
              accepted_by: msg.accepted_by || null,
              accepted_by_name: msg.accepted_by_name || null,
              rejected_at: msg.rejected_at || null,
              rejected_by: msg.rejected_by || null,
              rejected_by_name: msg.rejected_by_name || null,
              rejection_reason: msg.rejection_reason || null,
              accepted: !!msg.accepted_at,
              rejected: !!msg.rejected_at,
            }));
          }
          return [];
        }),
        catchError(this.handleError('getMessages', [])),
      );
  }

  envoyerMessageAvecFichiers(formData: FormData): Observable<any> {
    const token = this.getToken();
    const cleanToken = token ? token.replace(/^"(.*)"$/, '$1').trim() : '';

    const headers = new HttpHeaders({
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    });

    return this.http.post(`${this.apiUrl}/discussions/with-files`, formData, { headers }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) return response.data;
        throw new Error(response.message);
      }),
      catchError(this.handleError('envoyerMessageAvecFichiers')),
    );
  }

  accepterSolution(discussionId: number): Observable<any> {
    return this.http
      .post(
        `${this.apiUrl}/discussions/${discussionId}/accepter`,
        {},
        { headers: this.createHeaders() },
      )
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) return response.data;
          throw new Error(response.message);
        }),
        catchError(this.handleError('accepterSolution')),
      );
  }

  refuserSolution(discussionId: number, motif: string): Observable<any> {
    return this.http
      .post(
        `${this.apiUrl}/discussions/${discussionId}/refuser`,
        { motif },
        { headers: this.createHeaders() },
      )
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) return response.data;
          throw new Error(response.message);
        }),
        catchError(this.handleError('refuserSolution')),
      );
  }

  // ============================================================
  // UTILISATEURS
  // ============================================================

  getAllUsers(): Observable<any[]> {
    return this.http.get(`${this.apiUrl}/users`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success && response.data?.users) {
          return response.data.users.data || [];
        }
        return [];
      }),
      catchError(this.handleError('getAllUsers', [])),
    );
  }

  getDlgas(): Observable<any[]> {
    // ✅ Filtrer sur "dlgas" (pas "consultation")
    const params = new HttpParams().set('per_page', '100').set('profil', 'dlgas'); // ✅ CHANGÉ

    return this.http
      .get(`${this.apiUrl}/users`, {
        headers: this.createHeaders(),
        params: params,
      })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success && response.data?.users) {
            const usersList = response.data.users.data || [];
            // ✅ Filtrer côté client aussi
            return usersList.filter((u: any) => u.profil === 'dlgas');
          }
          return [];
        }),
        catchError(this.handleError('getDlgas', [])),
      );
  }

  // ============================================================
  // ENTITÉS
  // ============================================================

  getEntites(): Observable<any[]> {
    return this.http.get(`${this.apiUrl}/entites`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response?.success && response.data?.arbre) {
          return response.data.arbre || [];
        }
        if (response?.success && response.data?.liste) {
          return response.data.liste || [];
        }
        return [];
      }),
      catchError(this.handleError('getEntites', [])),
    );
  }

  getEntitesListe(): Observable<any[]> {
    return this.http.get(`${this.apiUrl}/entites`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => (response.success ? response.data.liste || [] : [])),
      catchError(this.handleError('getEntitesListe', [])),
    );
  }

  getEntitesHierarchie(): Observable<any[]> {
    return this.http.get(`${this.apiUrl}/entites`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => (response.success ? response.data.arbre || [] : [])),
      catchError(this.handleError('getEntitesHierarchie', [])),
    );
  }

  getToutesLesEntites(): Observable<any[]> {
    return this.http.get(`${this.apiUrl}/entites`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response?.success && response.data?.liste) {
          const liste = response.data.liste || [];

          const normalized = liste.map((e: any) => {
            const parentId = e.entite_principale_id;
            const parentIdNumber =
              parentId !== null && parentId !== undefined ? Number(parentId) : null;

            return {
              id: Number(e.id),
              nom: e.nom || '',
              entite_principale_id: parentIdNumber,
              entite_principale_nom: e.entite_principale_nom || null,
              niveau: parentIdNumber === null ? 0 : Number(e.niveau ?? 1),
              chemin_complet: e.chemin_complet || e.nom,
              has_enfants: Boolean(e.has_enfants),
            };
          });

          const parents = normalized.filter((e: any) => e.entite_principale_id === null);
          const enfants = normalized.filter((e: any) => e.entite_principale_id !== null);

          console.log(
            `✅ [getToutesLesEntites] ${normalized.length} entités (${parents.length} parents, ${enfants.length} enfants)`,
          );

          return normalized;
        }

        if (response?.success && Array.isArray(response.data)) {
          return response.data.map((e: any) => ({
            id: Number(e.id),
            nom: e.nom || '',
            entite_principale_id:
              e.entite_principale_id !== null && e.entite_principale_id !== undefined
                ? Number(e.entite_principale_id)
                : null,
            entite_principale_nom: e.entite_principale_nom || null,
            niveau: Number(e.niveau ?? 0),
            chemin_complet: e.chemin_complet || e.nom,
            has_enfants: Boolean(e.has_enfants),
          }));
        }

        return [];
      }),
      catchError(this.handleError('getToutesLesEntites', [])),
    );
  }

  getSousEntitesParEntite(entiteId: number): Observable<any> {
    const fallback = {
      entite_principale: null,
      sous_entites: [],
      nombre_sous_entites: 0,
    };

    return this.http
      .get(`${this.apiUrl}/entites/${entiteId}/sous-entites`, {
        headers: this.createHeaders(),
      })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response?.success) {
            const sousEntites = (response.sous_entites || []).map((se: any) => ({
              id: Number(se.id),
              nom: se.nom || '',
              entite_principale_id:
                se.entite_principale_id !== null && se.entite_principale_id !== undefined
                  ? Number(se.entite_principale_id)
                  : null,
              niveau: se.niveau !== null && se.niveau !== undefined ? Number(se.niveau) : 1,
              chemin_complet: se.chemin_complet || se.nom,
            }));

            console.log(
              `✅ [getSousEntitesParEntite] ${sousEntites.length} sous-entités pour "${response.entite_principale?.nom}"`,
            );

            return {
              entite_principale: response.entite_principale || null,
              sous_entites: sousEntites,
              nombre_sous_entites: sousEntites.length,
            };
          }
          return fallback;
        }),
        catchError(this.handleError('getSousEntitesParEntite', fallback)),
      );
  }

  getMesSousEntites(): Observable<any> {
    return this.http.get(`${this.apiUrl}/mes-sous-entites`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response?.success) {
          return {
            entite_utilisateur: response.entite_utilisateur,
            sous_entites: response.sous_entites || [],
            nombre_sous_entites: response.nombre_sous_entites || 0,
          };
        }
        return null;
      }),
      catchError(this.handleError('getMesSousEntites', null)),
    );
  }

  getElements(): Observable<any[]> {
    return this.http.get(`${this.apiUrl}/elements`, { headers: this.createHeaders() }).pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => (response.success ? response.data.arbre || [] : [])),
      catchError(this.handleError('getElements', [])),
    );
  }
}
