import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AnalyticService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}`;

  // ==========================================================
  // 1. VUE D'ENSEMBLE DE L'APPLICATION
  // ==========================================================
  getVueEnsemble(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/analytic/vue-ensemble`).pipe(
      map((response: any) => {
        if (!response?.success || !response?.data) {
          return this.emptyVueEnsemble();
        }

        const d = response.data;
        const indicateurs = d.indicateurs || {};

        // ✅ Transformation : adapter la réponse Laravel au format attendu par le template
        return {
          // Champs directs attendus par le template
          total_tickets: indicateurs.total_tickets || 0,
          total_utilisateurs: indicateurs.total_utilisateurs || 0,
          total_entites: indicateurs.total_entites || 0,
          total_elements: indicateurs.total_elements || 0,

          // "tickets_actifs" = en cours + en attente + ouverts + nouveau
          tickets_actifs: (indicateurs.tickets_en_cours || 0) + (indicateurs.tickets_ouverts || 0),

          tickets_resolus: indicateurs.tickets_resolus || 0,
          tickets_fermes: indicateurs.tickets_fermes || 0,
          tickets_en_cours: indicateurs.tickets_en_cours || 0,
          tickets_ouverts: indicateurs.tickets_ouverts || 0,

          // ✅ Conserver les données brutes pour d'autres usages
          tickets_par_statut: d.tickets_par_statut || [],
          tickets_par_urgence: d.tickets_par_urgence || [],
          tickets_recents: d.tickets_recents || [],
        };
      }),
      catchError((error) => {
        console.error('❌ [getVueEnsemble] Erreur:', error);
        return of(this.emptyVueEnsemble());
      }),
    );
  }

  // ==========================================================
  // 2. TICKETS - ANALYSE COMPLÈTE
  // ==========================================================
  getTicketsKPIs(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http
      .get<any>(`${this.apiUrl}/analytic/tickets/kpis`, { params })
      .pipe(catchError(() => of(this.emptyTicketsKPIs())));
  }

  getTicketsEvolution(filters: any = {}, periode: string = 'jour'): Observable<any[]> {
    const params = this.buildParams({ ...filters, periode });
    return this.http
      .get<any[]>(`${this.apiUrl}/analytic/tickets/evolution`, { params })
      .pipe(catchError(() => of([])));
  }

  getTicketsRepartition(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/repartition`, { params }).pipe(
      map((response: any) => {
        const d = response?.data || {};
        return {
          total_tickets: d.total_tickets || 0,
          par_statut: this.normalizeRepartition(d.par_statut),
          par_urgence: this.normalizeRepartition(d.par_urgence),
          par_priorite: this.normalizeRepartition(d.par_priorite || d.par_urgence),
          par_categorie: this.normalizeRepartition(d.par_categorie),
          par_type: this.normalizeRepartition(d.par_type),
        };
      }),
      catchError((error) => {
        console.error('❌ [getTicketsRepartition]', error);
        return of({
          total_tickets: 0,
          par_statut: [],
          par_urgence: [],
          par_priorite: [],
          par_categorie: [],
          par_type: [],
        });
      }),
    );
  }

  getTicketsParEntite(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/par-entite`, { params }).pipe(
      map((response: any) => {
        // Laravel renvoie : [{ entite: 'Dakar', total: 5 }, ...]
        const data = Array.isArray(response) ? response : response?.data || [];

        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getTicketsParEntite]', error);
        return of([]);
      }),
    );
  }

  getTicketsParCategorie(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/par-categorie`, { params }).pipe(
      map((response: any) => {
        // Laravel renvoie : [{ categorie: 'technique', total: 5 }, ...]
        const data = Array.isArray(response) ? response : response?.data || [];

        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getTicketsParCategorie]', error);
        return of([]);
      }),
    );
  }

  getTicketsParPriorite(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/par-priorite`, { params }).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];
        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getTicketsParPriorite]', error);
        return of([]);
      }),
    );
  }

  getTicketsParStatut(filters: any = {}): Observable<any[]> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/par-statut`, { params }).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];
        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getTicketsParStatut]', error);
        return of([]);
      }),
    );
  }

  // ==========================================================
  // 2. TICKETS - ANALYSE COMPLÈTE
  // ==========================================================

  getTicketsSLA(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/sla`, { params }).pipe(
      map((response: any) => {
        // Laravel renvoie : { success, data: { ... } }
        const d = response?.data || response || {};

        const respecte = Number(d.tickets_dans_les_delais || 0);
        const depasse = Number(d.tickets_en_retard || 0);
        const enCours = Number(d.tickets_en_cours_dans_les_delais || 0);
        const total = Number(d.total_tickets_avec_sla || 0);

        const tauxRespect = Number(d.taux_respect_sla || 0);
        const tauxDepassement = total > 0 ? Math.round((depasse / total) * 10000) / 100 : 0;

        return {
          // ✅ Champs attendus par le HTML
          respecte,
          depasse,
          en_cours: enCours,
          reclamations: 0, // Pas fourni par Laravel

          taux_respect: tauxRespect,
          taux_depassement: tauxDepassement,

          total_tickets_avec_sla: total,
          tickets_resolus: Number(d.tickets_resolus || 0),

          // ✅ Pas fourni par Laravel (le HTML gère l'absence)
          par_priorite: [],
        };
      }),
      catchError((error) => {
        console.error('❌ [getTicketsSLA]', error);
        return of({
          respecte: 0,
          depasse: 0,
          en_cours: 0,
          reclamations: 0,
          taux_respect: 0,
          taux_depassement: 0,
          total_tickets_avec_sla: 0,
          tickets_resolus: 0,
          par_priorite: [],
        });
      }),
    );
  }

  getTicketsDelais(filters: any = {}): Observable<any> {
    const params = this.buildParams(filters);
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/delais`, { params }).pipe(
      map((response: any) => {
        // Laravel renvoie : { success, data: { ... } }
        const d = response?.data || response || {};

        const delaiMoyenResolution = Number(d.delai_moyen_resolution_heures || 0);
        const delaiMin = Number(d.delai_minimum_resolution_heures || 0);
        const delaiMax = Number(d.delai_maximum_resolution_heures || 0);
        const delaiEnCours = Number(d.delai_moyen_tickets_en_cours_heures || 0);

        return {
          // ✅ Champs attendus par le HTML
          delai_moyen_global: delaiMoyenResolution,
          resolution: delaiMoyenResolution,

          // ⚠️ Pas fourni par Laravel → on met une valeur par défaut
          premiere_reponse: 0,
          cloture: 0,

          // ✅ Données additionnelles utiles
          delai_moyen_resolution_heures: delaiMoyenResolution,
          delai_minimum_resolution_heures: delaiMin,
          delai_maximum_resolution_heures: delaiMax,
          delai_moyen_tickets_en_cours_heures: delaiEnCours,

          total_tickets: Number(d.total_tickets || 0),
          total_tickets_resolus: Number(d.total_tickets_resolus || 0),
          total_tickets_non_resolus: Number(d.total_tickets_non_resolus || 0),
          tickets_en_retard: Number(d.tickets_en_retard || 0),

          // ✅ Pas fourni par Laravel (le HTML gère l'absence)
          par_priorite: [],
        };
      }),
      catchError((error) => {
        console.error('❌ [getTicketsDelais]', error);
        return of({
          delai_moyen_global: 0,
          premiere_reponse: 0,
          resolution: 0,
          cloture: 0,
          delai_moyen_resolution_heures: 0,
          delai_minimum_resolution_heures: 0,
          delai_maximum_resolution_heures: 0,
          delai_moyen_tickets_en_cours_heures: 0,
          total_tickets: 0,
          total_tickets_resolus: 0,
          total_tickets_non_resolus: 0,
          tickets_en_retard: 0,
          par_priorite: [],
        });
      }),
    );
  }

  getTopAgents(filters: any = {}, limit: number = 10): Observable<any[]> {
    const params = this.buildParams({ ...filters, limit });
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/top-agents`, { params }).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];

        return data.map((agent: any) => {
          const total = Number(agent.total_tickets || 0);
          const resolus = Number(agent.tickets_resolus || 0);
          const taux = total > 0 ? Math.round((resolus / total) * 1000) / 10 : 0;

          return {
            // ✅ Champs attendus par le HTML
            tickets_traites: total,
            tickets_resolus: resolus,
            taux_resolution: taux,
            delai_moyen: 0, // Non fourni par Laravel

            // ✅ Champs utilisateur (pour getFullName)
            agent_id: agent.agent_id,
            user_id: agent.agent_id,
            nom: agent.nom || '',
            prenom: agent.prenom || '',
            nom_complet: agent.nom_complet || `${agent.prenom || ''} ${agent.nom || ''}`.trim(),

            // ✅ Données brutes (au cas où)
            total_tickets: total,
          };
        });
      }),
      catchError((error) => {
        console.error('❌ [getTopAgents]', error);
        return of([]);
      }),
    );
  }

  getTopCreateurs(filters: any = {}, limit: number = 10): Observable<any[]> {
    const params = this.buildParams({ ...filters, limit });
    return this.http.get<any>(`${this.apiUrl}/analytic/tickets/top-createurs`, { params }).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];

        return data.map((createur: any) => {
          const total = Number(createur.total_tickets || 0);

          return {
            // ✅ Champs attendus par le HTML
            tickets_crees: total,
            derniere_activite: null, // Non fourni par Laravel

            // ✅ Champs utilisateur (pour getFullName)
            user_id: createur.user_id,
            nom: createur.nom || '',
            prenom: createur.prenom || '',
            nom_complet:
              createur.nom_complet || `${createur.prenom || ''} ${createur.nom || ''}`.trim(),

            // ✅ Données brutes
            total_tickets: total,
          };
        });
      }),
      catchError((error) => {
        console.error('❌ [getTopCreateurs]', error);
        return of([]);
      }),
    );
  }

  // ==========================================================
  // 3. UTILISATEURS - ANALYSE
  // ==========================================================

  getUtilisateursKPIs(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/analytic/utilisateurs/kpis`).pipe(
      map((response: any) => {
        const d = response?.data || response || {};

        return {
          // ✅ Champs attendus par le HTML
          total: Number(d.total_utilisateurs || 0),
          actifs: Number(d.utilisateurs_actifs_30j || 0),
          inactifs: Number(d.utilisateurs_inactifs_30j || 0),
          nouveaux_mois: Number(d.inscriptions_mois || 0),

          // ✅ Données additionnelles utiles
          nombre_profils: Number(d.nombre_profils || 0),
          taux_activite_30j: Number(d.taux_activite_30j || 0),
        };
      }),
      catchError((error) => {
        console.error('❌ [getUtilisateursKPIs]', error);
        return of({
          total: 0,
          actifs: 0,
          inactifs: 0,
          nouveaux_mois: 0,
          nombre_profils: 0,
          taux_activite_30j: 0,
        });
      }),
    );
  }

  getUtilisateursParProfil(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/utilisateurs/par-profil`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];
        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getUtilisateursParProfil]', error);
        return of([]);
      }),
    );
  }

  getUtilisateursParEntite(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/utilisateurs/par-entite`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];
        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getUtilisateursParEntite]', error);
        return of([]);
      }),
    );
  }

  getUtilisateursActifs(limit: number = 10): Observable<any[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<any>(`${this.apiUrl}/analytic/utilisateurs/actifs`, { params }).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];

        return data.map((user: any) => ({
          // ✅ Champs attendus par le HTML
          tickets_crees: Number(user.tickets_crees || 0), // ← non fourni → 0
          commentaires: Number(user.commentaires || 0), // ← non fourni → 0
          derniere_connexion: user.derniere_connexion || null,

          // ✅ Champs utilisateur (pour getFullName)
          id: user.id,
          user_id: user.id,
          nom: user.nom || '',
          prenom: user.prenom || '',
          nom_complet: user.nom_complet || `${user.prenom || ''} ${user.nom || ''}`.trim(),
          username: user.username || '',
          email: user.email || '',
          profil: user.profil || '',
        }));
      }),
      catchError((error) => {
        console.error('❌ [getUtilisateursActifs]', error);
        return of([]);
      }),
    );
  }

  getUtilisateursEvolution(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/utilisateurs/evolution`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];

        // ✅ Convertir au format { date, crees, resolus, fermes }
        return data.map((item: any) => ({
          date: item.periode || item.mois || '',
          periode: item.periode || '',
          mois: item.mois || '',
          crees: Number(item.total || 0),
          resolus: 0,
          fermes: 0,
          total: Number(item.total || 0),
        }));
      }),
      catchError((error) => {
        console.error('❌ [getUtilisateursEvolution]', error);
        return of([]);
      }),
    );
  }

  // ==========================================================
  // 4. ENTITÉS - ANALYSE
  // ==========================================================

  getEntitesKPIs(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/analytic/entites/kpis`).pipe(
      map((response: any) => {
        const d = response?.data || response || {};

        const total = Number(d.total_entites || 0);
        const avecTickets = Number(d.entites_avec_tickets || 0);

        return {
          // ✅ Champs attendus par le HTML
          total,
          actives: avecTickets, // ← entités qui ont au moins 1 ticket
          total_utilisateurs: 0, // ← non fourni par Laravel
          total_elements: 0, // ← non fourni par Laravel

          // ✅ Données additionnelles utiles
          entites_principales: Number(d.entites_principales || 0),
          sous_entites: Number(d.sous_entites || 0),
          entites_avec_tickets: avecTickets,
          entites_sans_tickets: Number(d.entites_sans_tickets || 0),
        };
      }),
      catchError((error) => {
        console.error('❌ [getEntitesKPIs]', error);
        return of({
          total: 0,
          actives: 0,
          total_utilisateurs: 0,
          total_elements: 0,
          entites_principales: 0,
          sous_entites: 0,
          entites_avec_tickets: 0,
          entites_sans_tickets: 0,
        });
      }),
    );
  }

  getEntitesPerformance(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/entites/performance`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];

        return data.map((item: any) => ({
          // ✅ Champs attendus par le HTML
          entite_id: item.entite_id,
          entite_nom: item.entite || `Entité #${item.entite_id}`,
          entite: item.entite || '',

          total_tickets: Number(item.total_tickets || 0),
          resolus: Number(item.tickets_resolus || 0), // ← renommer
          tickets_resolus: Number(item.tickets_resolus || 0),

          tickets_en_cours: Number(item.tickets_en_cours || 0),
          utilisateurs: 0, // ← non fourni

          taux_resolution: Number(item.taux_resolution || 0),
        }));
      }),
      catchError((error) => {
        console.error('❌ [getEntitesPerformance]', error);
        return of([]);
      }),
    );
  }

  getEntitesParType(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/entites/par-type`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];
        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getEntitesParType]', error);
        return of([]);
      }),
    );
  }

  getTopEntites(limit: number = 10): Observable<any[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<any>(`${this.apiUrl}/analytic/entites/top`, { params }).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];

        return data.map((item: any) => ({
          // ✅ Champs attendus
          entite_id: item.entite_id,
          entite_nom: item.entite || `Entité #${item.entite_id}`,
          entite: item.entite || '',

          total_tickets: Number(item.total_tickets || 0),
          resolus: Number(item.tickets_resolus || 0),
          tickets_resolus: Number(item.tickets_resolus || 0),

          taux_resolution:
            item.total_tickets > 0
              ? Math.round((item.tickets_resolus / item.total_tickets) * 10000) / 100
              : 0,
        }));
      }),
      catchError((error) => {
        console.error('❌ [getTopEntites]', error);
        return of([]);
      }),
    );
  }

  // ==========================================================
  // 5. ÉLÉMENTS / MATÉRIELS - ANALYSE
  // ==========================================================

  getElementsKPIs(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/analytic/elements/kpis`).pipe(
      map((response: any) => {
        const d = response?.data || response || {};
        return {
          // Champs attendus par le HTML
          total: Number(d.total_elements || 0),
          fonctionnels: 0, // ← non fourni
          disponibles: 0, // ← non fourni
          defectueux: 0, // ← non fourni
          en_maintenance: 0, // ← non fourni

          // Champs fournis par Laravel (nouvelle structure)
          elements_principaux: Number(d.elements_principaux || 0),
          sous_elements: Number(d.sous_elements || 0),

          // ⚠️ Non fourni
          taux_defectueux: 0,
        };
      }),
      catchError((error) => {
        console.error('❌ [getElementsKPIs] Échec → valeurs par défaut');
        // ✅ Ne PAS throw : renvoyer un objet complet pour que l'UI affiche 0
        return of({
          total: 0,
          fonctionnels: 0,
          disponibles: 0,
          defectueux: 0,
          en_maintenance: 0,
          elements_principaux: 0,
          sous_elements: 0,
          taux_defectueux: 0,
        });
      }),
    );
  }

  getElementsParType(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/elements/par-type`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];

        console.log('🔍 [getElementsParType] data brute:', data);

        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getElementsParType]', error);
        return of([]);
      }),
    );
  }

  getElementsParEtat(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/elements/par-etat`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];
        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getElementsParEtat]', error);
        return of([]);
      }),
    );
  }



  getElementsParEntite(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/analytic/elements/par-entite`).pipe(
      map((response: any) => {
        const data = Array.isArray(response) ? response : response?.data || [];
        return this.normalizeRepartition(data);
      }),
      catchError((error) => {
        console.error('❌ [getElementsParEntite]', error);
        return of([]);
      }),
    );
  }

  // ==========================================================
  // 6. ACTIVITÉ SYSTÈME / LOGS
  // ==========================================================
  getActiviteKPIs(): Observable<any> {
    return this.http
        .get<any>(`${this.apiUrl}/analytic/activite/kpis`)
        .pipe(
            map((response: any) => {
                const d = response?.data || response || {};

                const totalTickets = Number(d.total_tickets || 0);
                const aujourdhui = Number(d.tickets_aujourdhui || 0);
                const ceMois = Number(d.tickets_ce_mois || 0);
                const resolus = Number(d.tickets_resolus || 0);
                const enAttente = Number(d.tickets_en_attente || 0);
                const enCours = Number(d.tickets_en_cours || 0);

                // ✅ "utilisateurs_actifs" → on utilise "en cours + en attente"
                //    (les tickets en traitement impliquent des utilisateurs actifs)
                const utilisateursActifs = enCours + enAttente;

                // ✅ "actions_heure" → moyenne approximative :
                //    tickets créés aujourd'hui / 24h (arrondi)
                //    (à défaut d'une vraie mesure d'activité par heure)
                const actionsHeure =
                    aujourdhui > 0 ? Math.round((aujourdhui / 24) * 10) / 10 : 0;

                return {
                    // ✅ Champs attendus par le HTML
                    total_actions: totalTickets,          // ← renommer
                    actions_aujourd_hui: aujourdhui,      // ← renommer
                    utilisateurs_actifs: utilisateursActifs,
                    actions_heure: actionsHeure,

                    // ✅ Données additionnelles utiles
                    total_tickets: totalTickets,
                    tickets_aujourdhui: aujourdhui,
                    tickets_ce_mois: ceMois,
                    tickets_resolus: resolus,
                    tickets_en_attente: enAttente,
                    tickets_en_cours: enCours,
                };
            }),
            catchError((error) => {
                console.error('❌ [getActiviteKPIs]', error);
                return of({
                    total_actions: 0,
                    actions_aujourd_hui: 0,
                    utilisateurs_actifs: 0,
                    actions_heure: 0,
                    total_tickets: 0,
                    tickets_aujourdhui: 0,
                    tickets_ce_mois: 0,
                    tickets_resolus: 0,
                    tickets_en_attente: 0,
                    tickets_en_cours: 0,
                });
            }),
        );
}

  getActiviteRecente(limit: number = 20): Observable<any[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http
        .get<any>(`${this.apiUrl}/analytic/activite/recente`, { params })
        .pipe(
            map((response: any) => {
                const data = Array.isArray(response) ? response : response?.data || [];

                return data.map((item: any) => ({
                    // ✅ Champs attendus par le HTML
                    id: item.id,
                    user_nom: item.utilisateur || 'Utilisateur inconnu',  // ← renommer
                    description: item.description || '',
                    action: item.type || 'ticket',                        // ← "type" devient "action"
                    created_at: item.date || item.created_at || null,     // ← "date" devient "created_at"
                    date: item.date || null,

                    // Champs additionnels
                    statut: item.statut || '',
                    urgence: item.urgence || '',
                    type: item.type || 'ticket',
                    utilisateur: item.utilisateur || '',
                }));
            }),
            catchError((error) => {
                console.error('❌ [getActiviteRecente]', error);
                return of([]);
            }),
        );
}

  getActiviteParAction(): Observable<any[]> {
    return this.http
        .get<any>(`${this.apiUrl}/analytic/activite/par-action`)
        .pipe(
            map((response: any) => {
                const data = Array.isArray(response) ? response : response?.data || [];
                return this.normalizeRepartition(data);
            }),
            catchError((error) => {
                console.error('❌ [getActiviteParAction]', error);
                return of([]);
            }),
        );
}

  getActiviteParHeure(): Observable<any[]> {
    return this.http
        .get<any>(`${this.apiUrl}/analytic/activite/par-heure`)
        .pipe(
            map((response: any) => {
                const data = Array.isArray(response) ? response : response?.data || [];

                return data.map((item: any) => ({

                    heure: item.heure || '',           // déjà au format "08:00"
                    value: Number(item.total || 0),    // ← renommer total → value
                    total: Number(item.total || 0),    // conserver pour compatibilité
                }));
            }),
            catchError((error) => {
                console.error('❌ [getActiviteParHeure]', error);
                return of([]);
            }),
        );
}

  // ==========================================================
// 7. CATÉGORIES / RÉFÉRENTIELS
// ==========================================================

getCategories(): Observable<any[]> {
    return this.http
        .get<any>(`${this.apiUrl}/analytic/categories`)
        .pipe(
            map((response: any) => {
                const data = Array.isArray(response) ? response : response?.data || [];
                return this.normalizeRepartition(data);
            }),
            catchError((error) => {
                console.error('❌ [getCategories]', error);
                return of([]);
            }),
        );
}

getSourcesDemande(): Observable<any[]> {
    return this.http
        .get<any>(`${this.apiUrl}/analytic/sources-demande`)
        .pipe(
            map((response: any) => {
                const data = Array.isArray(response) ? response : response?.data || [];
                return this.normalizeRepartition(data);
            }),
            catchError((error) => {
                console.error('❌ [getSourcesDemande]', error);
                return of([]);
            }),
        );
}

// ==========================================================
// 8. PERFORMANCE GLOBALE
// ==========================================================

getPerformanceGlobale(): Observable<any> {
    return this.http
        .get<any>(`${this.apiUrl}/analytic/performance-globale`)
        .pipe(
            map((response: any) => {
                const d = response?.data || response || {};

                const total = Number(d.total_tickets || 0);
                const resolus = Number(d.tickets_resolus || 0);
                const enAttente = Number(d.tickets_en_attente || 0);
                const enCours = Number(d.tickets_en_cours || 0);
                const hautePriorite = Number(d.tickets_haute_priorite || 0);
                const slaDepasse = Number(d.tickets_sla_depasse || 0);
                const tauxResolution = Number(d.taux_resolution || 0);

                // ✅ Calculs dérivés pour compléter les champs manquants
                const chargeTravail = enAttente + enCours;

                // ✅ Taux de respect SLA = (total - sla_depasse) / total
                const tauxRespectSla =
                    total > 0
                        ? Math.round(((total - slaDepasse) / total) * 10000) / 100
                        : 100;

                return {
                    // ✅ Champs attendus par le HTML
                    taux_resolution_global: tauxResolution,
                    taux_respect_sla: tauxRespectSla,
                    delai_moyen_global: 0,    // ← non fourni par Laravel
                    charge_travail: chargeTravail,
                    taux_cloture: 0,          // ← non fourni
                    satisfaction: 0,          // ← non fourni

                    // ✅ Données additionnelles
                    total_tickets: total,
                    tickets_resolus: resolus,
                    tickets_en_attente: enAttente,
                    tickets_en_cours: enCours,
                    tickets_haute_priorite: hautePriorite,
                    tickets_sla_depasse: slaDepasse,
                    taux_resolution: tauxResolution,
                };
            }),
            catchError((error) => {
                console.error('❌ [getPerformanceGlobale]', error);
                return of({
                    taux_resolution_global: 0,
                    taux_respect_sla: 0,
                    delai_moyen_global: 0,
                    charge_travail: 0,
                    taux_cloture: 0,
                    satisfaction: 0,
                    total_tickets: 0,
                    tickets_resolus: 0,
                    tickets_en_attente: 0,
                    tickets_en_cours: 0,
                    tickets_haute_priorite: 0,
                    tickets_sla_depasse: 0,
                    taux_resolution: 0,
                });
            }),
        );
}

getAlertes(): Observable<any[]> {
    return this.http
        .get<any>(`${this.apiUrl}/analytic/alertes`)
        .pipe(
            map((response: any) => {
                const data = Array.isArray(response) ? response : response?.data || [];

                return data.map((item: any) => {
                    // ✅ Déterminer le niveau selon l'urgence
                    let niveau: 'critique' | 'haute' | 'moyenne' | 'basse' = 'moyenne';
                    if (item.urgence === 'critique') niveau = 'critique';
                    else if (item.urgence === 'haute') niveau = 'haute';
                    else if (item.urgence === 'basse') niveau = 'basse';

                    return {
                        // ✅ Champs attendus par le HTML
                        id: item.id,
                        titre: `Ticket ${item.ticket || item.num_ticket || '#' + item.id}`,
                        message:
                            item.message ||
                            `SLA dépassé pour le ticket ${item.ticket}`,
                        niveau,
                        date: item.date_echeance || item.date || null,

                        // ✅ Données additionnelles
                        ticket: item.ticket || item.num_ticket || '',
                        categorie: item.categorie || '',
                        statut: item.statut || '',
                        urgence: item.urgence || '',
                        type: item.type || 'sla_depasse',
                        date_echeance: item.date_echeance || null,
                    };
                });
            }),
            catchError((error) => {
                console.error('❌ [getAlertes]', error);
                return of([]);
            }),
        );
}

  // ==========================================================
  // CHARGEMENT GLOBAL
  // ==========================================================
  loadAllAnalytics(filters: any = {}, periode: string = 'jour'): Observable<any> {
    return forkJoin({
      vueEnsemble: this.getVueEnsemble(),
      ticketsKpis: this.getTicketsKPIs(filters),
      ticketsEvolution: this.getTicketsEvolution(filters, periode),
      ticketsRepartition: this.getTicketsRepartition(filters),
      ticketsParEntite: this.getTicketsParEntite(filters),
      ticketsParCategorie: this.getTicketsParCategorie(filters),
      ticketsParPriorite: this.getTicketsParPriorite(filters),
      ticketsParStatut: this.getTicketsParStatut(filters),
      ticketsSLA: this.getTicketsSLA(filters),
      ticketsDelais: this.getTicketsDelais(filters),
      topAgents: this.getTopAgents(filters, 10),
      topCreateurs: this.getTopCreateurs(filters, 10),
      utilisateursKpis: this.getUtilisateursKPIs(),
      utilisateursParProfil: this.getUtilisateursParProfil(),
      utilisateursParEntite: this.getUtilisateursParEntite(),
      utilisateursActifs: this.getUtilisateursActifs(10),
      utilisateursEvolution: this.getUtilisateursEvolution(),
      entitesKpis: this.getEntitesKPIs(),
      entitesPerformance: this.getEntitesPerformance(),
      entitesParType: this.getEntitesParType(),
      topEntites: this.getTopEntites(10),
      elementsKpis: this.getElementsKPIs(),
      elementsParType: this.getElementsParType(),
      elementsParEtat: this.getElementsParEtat(),
      elementsParEntite: this.getElementsParEntite(),
      activiteKpis: this.getActiviteKPIs(),
      activiteRecente: this.getActiviteRecente(20),
      activiteParAction: this.getActiviteParAction(),
      activiteParHeure: this.getActiviteParHeure(),
      categories: this.getCategories(),
      sourcesDemande: this.getSourcesDemande(),
      performanceGlobale: this.getPerformanceGlobale(),
      alertes: this.getAlertes(),
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

  private emptyVueEnsemble(): any {
    return {
      total_tickets: 0,
      total_utilisateurs: 0,
      total_entites: 0,
      total_elements: 0,
      tickets_actifs: 0,
      tickets_resolus: 0,
      tickets_fermes: 0,
      tickets_en_cours: 0,
      tickets_ouverts: 0,
      tickets_par_statut: [],
      tickets_par_urgence: [],
      tickets_recents: [],
    };
  }

  private emptyTicketsKPIs(): any {
    return {
      total: 0,
      ouverts: 0,
      en_cours: 0,
      resolus: 0,
      fermes: 0,
      haute_priorite: 0,
      reclamations: 0,
      taux_resolution: 0,
      delai_moyen: 0,
      sla_respecte: 0,
      sla_depasse: 0,
    };
  }

  // Helper : normalise les tableaux Laravel en { label, value, pourcentage }
  private normalizeRepartition(rawData: any): any[] {
    if (!Array.isArray(rawData)) {
      console.warn('⚠️ [normalizeRepartition] Non-tableau:', rawData);
      return [];
    }

    const total = rawData.reduce((sum, item) => {
      const v = item.total ?? item.value ?? item.count ?? 0;
      return sum + Number(v);
    }, 0);

    return rawData.map((item: any) => {
      const value = Number(item.total ?? item.value ?? item.count ?? 0);

      const labelKeys = [
        'entite',
        'entite_nom',
        'nom_entite',
        'profil',
        'role',
        'categorie',
        'statut',
        'urgence',
        'priorite',
        'type', // ← ✅ pour par-type
        'etat', // ← ✅ pour par-etat
        'label',
        'name',
        'nom',
        'libelle',
        'titre',
        'mois',
        'periode',
      ];

      let label: any = undefined;
      for (const key of labelKeys) {
        if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
          label = item[key];
          break;
        }
      }

      if (label === undefined) {
        const excluded = [
          'total',
          'value',
          'count',
          'pourcentage',
          'id',
          'entite_id',
          'user_id',
          'agent_id',
        ];
        const found = Object.keys(item).find(
          (k) => !excluded.includes(k) && typeof item[k] === 'string' && item[k] !== '',
        );
        if (found) label = item[found];
      }

      if (label === undefined) label = 'N/A';

      const pourcentage =
        item.pourcentage !== undefined
          ? Number(item.pourcentage)
          : total > 0
            ? Math.round((value / total) * 1000) / 10
            : 0;

      return { label, value, pourcentage };
    });
  }
}
