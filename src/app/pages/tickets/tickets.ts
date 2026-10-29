import { Component, OnInit, OnDestroy, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TicketService } from '../../services/ticket-service';
import { FormsModule } from '@angular/forms';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  takeUntil,
  finalize,
  interval,
  Subscription,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth-services';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tickets.html',
  styleUrls: ['./tickets.css'],
})
export class Tickets implements OnInit, OnDestroy {
  // ===== INJECTIONS =====
  private readonly ticketsService = inject(TicketService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  // ===== CONSTANTES =====
  private readonly DEBOUNCE_TIME = 300;
  private readonly SLA_CHECK_INTERVAL = 300000; // 5 minutes
  private readonly SLA_FIRST_CHECK_DELAY = 30000; // 30 secondes
  private readonly enableDebug = environment.enableDebug;

  // ===== SIGNALS =====
  readonly tickets = signal<any[]>([]);
  readonly filteredTickets = signal<any[]>([]);
  readonly allTickets = signal<any[]>([]);

  readonly stats = signal<any>({
    total: 0,
    ouverts: 0,
    en_cours: 0,
    resolus: 0,
    fermes: 0,
    haute_priorite: 0,
  });

  readonly isLoading = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly filterStatut = signal<string>('tous');
  readonly filterPriorite = signal<string>('toutes');
  readonly filterCategorie = signal<string>('toutes');
  readonly filterType = signal<string>('tous');
  readonly filterMesTickets = signal<boolean>(false);

  readonly sortField = signal<string>('date_creation');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  // Pagination
  readonly currentPage = signal<number>(1);
  readonly itemsPerPage = signal<number>(10);
  readonly totalPages = signal<number>(0);
  readonly totalItems = signal<number>(0);
  readonly showingFrom = signal<number>(0);
  readonly showingTo = signal<number>(0);

  // Modales
  readonly showSuccessModal = signal<boolean>(false);
  readonly successMessage = signal<string>('');
  readonly successTicketId = signal<number | null>(null);
  readonly successTicketNum = signal<string | null>(null);
  readonly showDetailsModal = signal<boolean>(false);
  readonly selectedTicket = signal<any>(null);
  readonly isLoadingDetails = signal<boolean>(false);
  readonly showDeleteModal = signal<boolean>(false);
  readonly ticketToDelete = signal<any>(null);
  readonly isDeleting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);

  // SLA
  readonly slaVerificationActive = signal<boolean>(true);
  private slaVerificationSubscription: Subscription | null = null;

  // Sujet pour le debounce
  private readonly searchSubject = new Subject<string>();

  readonly statsError = signal<string | null>(null);

  // Options pour les filtres
  readonly statuts = [
    { value: 'tous', label: 'Tous les statuts' },
    { value: 'en_attente', label: 'En attente' },
    { value: 'en_cours', label: 'En cours' },
    { value: 'resolu', label: 'Résolu' },
    { value: 'clos', label: 'Clos' },
  ];

  readonly priorites = [
    { value: 'toutes', label: 'Toutes les priorités' },
    { value: 'haute', label: 'Haute' },
    { value: 'moyenne', label: 'Moyenne' },
    { value: 'basse', label: 'Basse' },
  ];

  readonly categories = [
    { value: 'toutes', label: 'Toutes les catégories' },
    { value: 'technique', label: 'Technique' },
    { value: 'fonctionnel', label: 'Fonctionnel' },
    { value: 'materiel', label: 'Matériel' },
    { value: 'logiciel', label: 'Logiciel' },
    { value: 'reseau', label: 'Réseau' },
    { value: 'securite', label: 'Sécurité' },
    { value: 'autre', label: 'Autre' },
  ];

  readonly types = [
    { value: 'tous', label: 'Tous les types' },
    { value: 'declaration', label: 'Déclaration' },
    { value: 'reclamation', label: 'Réclamation' },
  ];

  readonly slaThresholds = {
    critique: 24,
    haute: 48,
    moyenne: 72,
    basse: 96,
  };

  isSelfservice(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'selfservice';
  }

  isSuperAdmin(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'superadmin';
  }

  // ===== COMPUTED =====
  readonly currentPageItems = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return this.filteredTickets().slice(start, start + this.itemsPerPage());
  });

  readonly shouldShowPagination = computed(() => this.filteredTickets().length > 0);

  readonly mesTicketsCount = computed(() => {
    const currentUserId = this.getCurrentUserId();
    return this.allTickets().filter((t) => t.createur_id === currentUserId).length;
  });

  // ===== CONSTRUCTEUR =====
  constructor() {
    this.setupSearchDebounce();
  }

  ngOnInit(): void {
    this.loadData();
    this.startSlaVerification();
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
    this.stopSlaVerification();
  }

  // ===== INITIALISATION =====
  private setupSearchDebounce(): void {
    this.searchSubject
      .pipe(
        debounceTime(this.DEBOUNCE_TIME),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((searchTerm) => {
        this.searchQuery.set(searchTerm);
        this.currentPage.set(1);
        this.applyAllFilters();
      });
  }

  // ===== MÉTHODES UTILITAIRES =====
  private getCurrentUserId(): number {
    const user = this.authService.getCurrentUser()();
    return user?.id ?? 0;
  }

  private logDebug(...args: any[]): void {
    if (this.enableDebug) {
      console.log(...args);
    }
  }

  // ===== GESTION SLA =====
  private startSlaVerification(): void {
    this.stopSlaVerification();
    this.logDebug('⏱️ Démarrage de la vérification périodique des SLA...');

    this.slaVerificationSubscription = interval(this.SLA_CHECK_INTERVAL)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.verifierTousLesSla());

    setTimeout(() => this.verifierTousLesSla(), this.SLA_FIRST_CHECK_DELAY);
  }

  private stopSlaVerification(): void {
    if (this.slaVerificationSubscription) {
      this.slaVerificationSubscription.unsubscribe();
      this.slaVerificationSubscription = null;
      this.logDebug('⏹️ Vérification SLA arrêtée');
    }
  }

  private verifierTousLesSla(): void {
    if (!this.slaVerificationActive()) return;

    const ticketsAvecSla = this.allTickets().filter((ticket) => ticket.sla_demarre);
    if (ticketsAvecSla.length === 0) return;

    this.logDebug(`📊 Vérification de ${ticketsAvecSla.length} tickets...`);

    ticketsAvecSla.forEach((ticket) => {
      this.ticketsService
        .verifierSLA(ticket.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            if (result.type !== ticket.type) {
              this.allTickets.update((tickets) =>
                tickets.map((t) => (t.id === ticket.id ? { ...t, type: result.type } : t)),
              );
              this.applyAllFilters();
            }
          },
          error: (error) => {
            if (error.status !== 400) {
              console.error(`❌ Erreur vérification ticket #${ticket.id}:`, error);
            }
          },
        });
    });
  }

  // ===== CHARGEMENT DES DONNÉES =====
  loadData(): void {
    this.isLoading.set(true);

    const params = { page: 1, per_page: 100 };

    this.ticketsService
      .getTickets(params)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: (response) => {
          console.log('📥 [loadData] Response reçue:', response);
          if (response?.data) {
            console.log('📋 [loadData] Premier ticket:', response.data[0]);
            this.allTickets.set(response.data);
            this.tickets.set(response.data);
            this.applyAllFilters();
            this.totalItems.set(response.total || 0);
            this.totalPages.set(response.last_page || 1);
            this.showingFrom.set(response.from || 0);
            this.showingTo.set(response.to || 0);
          } else {
            this.resetTicketsData();
          }
          this.loadStats();
        },
        error: (error) => {
          console.error('❌ Erreur chargement tickets:', error);
          this.resetTicketsData();
        },
      });
  }

  private resetTicketsData(): void {
    this.allTickets.set([]);
    this.tickets.set([]);
    this.filteredTickets.set([]);
    this.totalItems.set(0);
    this.totalPages.set(1);
    this.showingFrom.set(0);
    this.showingTo.set(0);
  }

  private loadStats(): void {
    this.statsError.set(null);

    this.ticketsService
      .getStatistiques()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => {
          console.log('📊 [loadStats] Statistiques reçues:', stats);
          this.stats.set({
            total: stats.total_tickets || 0,
            ouverts: this.calculerTicketsOuverts(stats),
            en_cours: stats.en_cours?.total || 0,
            resolus: stats.resolus?.total || 0,
            fermes: stats.fermes?.total || 0,
            haute_priorite: stats.haute_priorite?.total || 0,
          });
          this.statsError.set(null);
        },
        error: (err) => {
          console.error('❌ [loadStats] Erreur chargement stats:', err);
          this.statsError.set(err.error?.message || 'Impossible de charger les statistiques.');
          // ✅ Remettre les stats à zéro pour ne pas afficher de valeurs obsolètes
          this.stats.set({
            total: 0,
            ouverts: 0,
            en_cours: 0,
            resolus: 0,
            fermes: 0,
            haute_priorite: 0,
          });
        },
      });
  }

  retryLoadStats(): void {
    this.loadStats();
  }

  private calculerTicketsOuverts(stats: any): number {
    const total = stats.total_tickets || 0;
    const resolus = stats.resolus?.total || 0;
    const fermes = stats.fermes?.total || 0;
    return total - (resolus + fermes);
  }

  // ===== FILTRES =====
  applyAllFilters(): void {
    let filtered = [...this.allTickets()];

    // Filtre "Mes tickets"
    if (this.filterMesTickets()) {
      const currentUserId = this.getCurrentUserId();
      filtered = filtered.filter((t) => t.createur_id === currentUserId);
    }

    // Filtres
    if (this.filterStatut() !== 'tous') {
      filtered = filtered.filter((t) => t.statut === this.filterStatut());
    }
    if (this.filterPriorite() !== 'toutes') {
      filtered = filtered.filter((t) => t.priorite === this.filterPriorite());
    }
    if (this.filterCategorie() !== 'toutes') {
      filtered = filtered.filter((t) => t.categorie === this.filterCategorie());
    }
    if (this.filterType() !== 'tous') {
      filtered = filtered.filter((t) => t.type === this.filterType());
    }

    // Recherche
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(
        (ticket) =>
          ticket.titre?.toLowerCase().includes(query) ||
          ticket.description?.toLowerCase().includes(query) ||
          ticket.createur_nom?.toLowerCase().includes(query),
      );
    }

    this.filteredTickets.set(filtered);
    this.totalItems.set(filtered.length);
    this.totalPages.set(Math.ceil(filtered.length / this.itemsPerPage()));

    if (this.currentPage() > this.totalPages()) {
      this.currentPage.set(Math.max(1, this.totalPages()));
    }

    const start = (this.currentPage() - 1) * this.itemsPerPage();
    this.showingFrom.set(filtered.length > 0 ? start + 1 : 0);
    this.showingTo.set(Math.min(start + this.itemsPerPage(), filtered.length));

    this.sortTickets();
  }

  onSearch(event: any): void {
    this.searchSubject.next(event.target.value);
  }

  setFilterStatut(statut: string): void {
    this.filterStatut.set(statut);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  setFilterPriorite(priorite: string): void {
    this.filterPriorite.set(priorite);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  setFilterCategorie(categorie: string): void {
    this.filterCategorie.set(categorie);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  setFilterType(type: string): void {
    this.filterType.set(type);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  toggleMesTickets(): void {
    this.filterMesTickets.update((value) => !value);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterStatut.set('tous');
    this.filterPriorite.set('toutes');
    this.filterCategorie.set('toutes');
    this.filterType.set('tous');
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  // ===== TRI =====
  sortBy(field: string): void {
    if (field === 'sla') {
      this.sortBySla();
    } else {
      if (this.sortField() === field) {
        this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
      } else {
        this.sortField.set(field);
        this.sortDirection.set('asc');
      }
      this.sortTickets();
    }
  }

  private sortBySla(): void {
    const sorted = [...this.filteredTickets()].sort((a, b) => {
      if (!a.sla_demarre && !b.sla_demarre) return 0;
      if (!a.sla_demarre) return 1;
      if (!b.sla_demarre) return -1;
      const slaA = this.calculateSlaPercentage(a);
      const slaB = this.calculateSlaPercentage(b);
      return this.sortDirection() === 'asc' ? slaA - slaB : slaB - slaA;
    });
    this.filteredTickets.set(sorted);
  }

  private sortTickets(): void {
    const sorted = [...this.filteredTickets()].sort((a, b) => {
      let fieldA = a[this.sortField()];
      let fieldB = b[this.sortField()];

      if (this.sortField() === 'date_creation') {
        fieldA = fieldA ? new Date(fieldA).getTime() : 0;
        fieldB = fieldB ? new Date(fieldB).getTime() : 0;
      }

      if (typeof fieldA === 'string') fieldA = fieldA.toLowerCase();
      if (typeof fieldB === 'string') fieldB = fieldB.toLowerCase();

      const comparison = fieldA < fieldB ? -1 : fieldA > fieldB ? 1 : 0;
      return this.sortDirection() === 'asc' ? comparison : -comparison;
    });

    this.filteredTickets.set(sorted);
  }

  getSortIcon(field: string): string {
    if (this.sortField() !== field) return '↕️';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  // ===== PAGINATION =====
  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      const start = this.itemsPerPage() * (page - 1);
      this.showingFrom.set(this.filteredTickets().length > 0 ? start + 1 : 0);
      this.showingTo.set(Math.min(start + this.itemsPerPage(), this.filteredTickets().length));
    }
  }

  goToFirstPage(): void {
    if (this.currentPage() !== 1) this.changePage(1);
  }

  goToLastPage(): void {
    if (this.currentPage() !== this.totalPages()) this.changePage(this.totalPages());
  }

  changeItemsPerPage(event: any): void {
    this.itemsPerPage.set(parseInt(event.target.value, 10));
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  onPageClick(page: number | string): void {
    if (page !== '...') this.changePage(page as number);
  }

  getPageNumbers(): (number | string)[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const delta = 2;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    });

    return rangeWithDots;
  }

  // ===== NAVIGATION =====
  goToAddTicket(): void {
    this.router.navigate(['/tickets/ajouter']);
  }

  goToEditTicket(ticket: any): void {
    if (!ticket?.id) {
      console.error('❌ Erreur: Ticket ou ID manquant', ticket);
      return;
    }

    const ticketData = {
      id: ticket.id,
      type: ticket.type,
      categorie: ticket.categorie,
      statut: ticket.statut,
      priorite: ticket.priorite,
      source_demande: ticket.source_demande,
      prenom: ticket.prenom,
      nom: ticket.nom,
      email: ticket.email,
      adresse: ticket.adresse,
      description: ticket.description || ticket.detail,
      element_id: ticket.element_id,
      observateur_id: ticket.observateur_id,
      dlgas_id: ticket.dlgas_id,
      createur_id: ticket.createur_id,
      entite_id: ticket.entite_id,
      commentaires: ticket.commentaires || [],
    };

    this.router.navigate(['/tickets/modifier', ticket.id], { state: { ticket: ticketData } });
  }

  // ===== MODALES =====
  showSuccess(message: string, ticket?: any): void {
    this.successMessage.set(message);
    if (ticket) {
      this.successTicketId.set(ticket.id);
      this.successTicketNum.set(ticket.num_ticket || null);
    }
    this.showSuccessModal.set(true);
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
    this.successMessage.set('');
    this.successTicketId.set(null);
    this.successTicketNum.set(null);
  }

  redirectToTicketDetails(): void {
    const ticketId = this.successTicketId();
    if (ticketId) {
      this.router.navigate(['/tickets', ticketId]);
    } else {
      this.router.navigate(['/tickets']);
    }
    this.closeSuccessModal();
  }

  openTicketDetails(ticket: any): void {
    this.isLoadingDetails.set(true);
    this.showDetailsModal.set(true);

    this.ticketsService
      .getTicketById(ticket.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoadingDetails.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.selectedTicket.set(this.mergeTicketData(ticket, data));
        },
        error: (error) => {
          console.error('❌ Erreur chargement détails ticket:', error);
          this.selectedTicket.set(this.createFallbackTicket(ticket));
        },
      });
  }

  private mergeTicketData(original: any, apiData: any): any {
    return {
      id: apiData.id,
      num_ticket: apiData.num_ticket || original.num_ticket,
      titre: apiData.type || original.titre || 'Ticket',
      description: apiData.detail || original.description,
      statut: apiData.statut || original.statut,
      priorite: apiData.urgence || original.priorite,
      categorie: apiData.categorie || original.categorie,
      date_creation: apiData.created_at || apiData.date_creation || original.date_creation,
      createur_nom:
        original.createur_nom || (apiData.user_id ? `Utilisateur #${apiData.user_id}` : 'Inconnu'),
      createur_id: apiData.user_id || original.createur_id,
      entite_nom:
        original.entite_nom ||
        (apiData.entite_id ? `Entité #${apiData.entite_id}` : 'Non spécifié'),
      entite_id: apiData.entite_id,
      element_nom:
        original.element_nom ||
        (apiData.element_id ? `Élément #${apiData.element_id}` : 'Non spécifié'),
      element_id: apiData.element_id,
      prenom: apiData.prenom || original.prenom || 'Non renseigné',
      nom: apiData.nom || original.nom || 'Non renseigné',
      email: apiData.email || original.email || 'Non renseigné',
      telephone: this.formatTelephone(apiData.telephone || original.telephone),
      adresse: apiData.adresse || original.adresse || 'Non renseignée',
      source_demande: apiData.source_demande || original.source_demande || 'Non spécifié',
      type: apiData.type || original.type || 'Non spécifié',
      urgence: apiData.urgence || original.urgence,
      dlgas: apiData.dlgas
        ? `${apiData.dlgas.prenom || ''} ${apiData.dlgas.nom || ''}`.trim()
        : original.dlgas_nom || null,
      commentaires: apiData.commentaires || original.commentaires || [],
    };
  }

  private createFallbackTicket(ticket: any): any {
    return {
      id: ticket.id,
      num_ticket: ticket.num_ticket,
      titre: ticket.titre || ticket.type || 'Ticket',
      description: ticket.description || ticket.detail,
      statut: ticket.statut,
      priorite: ticket.priorite || ticket.urgence,
      categorie: ticket.categorie,
      date_creation: ticket.date_creation || ticket.created_at,
      createur_nom: ticket.createur_nom || 'Inconnu',
      createur_id: ticket.user_id,
      entite_nom: ticket.entite_nom || 'Non spécifié',
      element_nom: ticket.element_nom || 'Non spécifié',
      prenom: ticket.prenom || 'Non renseigné',
      nom: ticket.nom || 'Non renseigné',
      email: ticket.email || 'Non renseigné',
      telephone: this.formatTelephone(ticket.telephone),
      adresse: ticket.adresse || 'Non renseignée',
      source_demande: ticket.source_demande || 'Non spécifié',
      type: ticket.type || 'Non spécifié',
      urgence: ticket.urgence,
      dlgas: ticket.dlgas_nom || null,
      commentaires: ticket.commentaires || [],
    };
  }

  closeDetailsModal(): void {
    this.showDetailsModal.set(false);
    this.selectedTicket.set(null);
  }

  confirmDeleteTicket(ticket: any): void {
    this.ticketToDelete.set(ticket);
    this.showDeleteModal.set(true);
  }

  cancelDelete(): void {
    this.showDeleteModal.set(false);
    this.ticketToDelete.set(null);
  }

  deleteTicket(): void {
    const ticket = this.ticketToDelete();
    if (!ticket?.id) return;

    this.isDeleting.set(true);

    this.ticketsService
      .supprimerTicket(ticket.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDeleting.set(false)),
      )
      .subscribe({
        next: () => {
          this.allTickets.update((tickets) => tickets.filter((t) => t.id !== ticket.id));
          this.applyAllFilters();
          this.showDeleteModal.set(false);
          this.ticketToDelete.set(null);
          this.showSuccess(`Le ticket #${ticket.id} a été supprimé avec succès.`);
        },
        error: (error) => {
          console.error('❌ Erreur suppression:', error);
          this.submitError.set(error.error?.message || 'Erreur lors de la suppression du ticket.');
          setTimeout(() => this.submitError.set(null), 3000);
        },
      });
  }

  // ===== DROITS =====
  canEditTicketWithService(ticket: any): boolean {
    const user = this.authService.getCurrentUser()();
    if (!user) return false;
    if (user.profil === 'superadmin' || user.profil === 'backoffice') return true;
    return ticket.createur_id === user.id;
  }

  canDeleteTicket(ticket: any): boolean {
    const user = this.authService.getCurrentUser()();
    if (!user) return false;
    if (user.profil === 'superadmin' || user.profil === 'backoffice') return true;
    return ticket.createur_id === user.id;
  }

  canViewBoutonMesTickets(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'selfservice';
  }

  // ===== SLA =====
  isSlaDemarre(ticket: any): boolean {
    return ticket.sla_demarre === true;
  }

  calculateSlaPercentage(ticket: any): number {
    if (!ticket.sla_demarre || !ticket.sla_date_debut) return 0;

    const dateDebut = new Date(ticket.sla_date_debut);
    const now = new Date();
    const heuresEcoulees = (now.getTime() - dateDebut.getTime()) / (1000 * 60 * 60);

    const heuresMax =
      ticket.sla_ttr ||
      this.slaThresholds[ticket.priorite as keyof typeof this.slaThresholds] ||
      48;
    return Math.min(Math.round((heuresEcoulees / heuresMax) * 100), 100);
  }

  getSlaClass(ticket: any): string {
    if (!ticket.sla_demarre) return 'sla-non-demarre';
    const pourcentage = this.calculateSlaPercentage(ticket);
    if (pourcentage >= 90) return 'sla-critique';
    if (pourcentage >= 70) return 'sla-warning';
    if (pourcentage >= 50) return 'sla-attention';
    return 'sla-normal';
  }

  getTempsRestant(ticket: any): string {
    if (!ticket.sla_demarre || !ticket.sla_date_debut) return 'Non démarré';

    const dateDebut = new Date(ticket.sla_date_debut);
    const now = new Date();
    const heuresEcoulees = (now.getTime() - dateDebut.getTime()) / (1000 * 60 * 60);

    const heuresMax =
      ticket.sla_ttr ||
      this.slaThresholds[ticket.priorite as keyof typeof this.slaThresholds] ||
      48;
    const heuresRestantes = Math.max(heuresMax - heuresEcoulees, 0);

    if (heuresRestantes <= 0) return 'Délai dépassé';

    const jours = Math.floor(heuresRestantes / 24);
    const heures = Math.floor(heuresRestantes % 24);

    return jours > 0 ? `${jours}j ${heures}h` : `${Math.round(heuresRestantes)}h`;
  }

  // ===== FORMATAGE =====
  formatTelephone(telephone: string | null | undefined): string {
    if (!telephone) return '-';
    const cleaned = telephone.replace(/\D/g, '');
    if (cleaned.length === 9) return cleaned.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
    if (cleaned.length === 10)
      return cleaned.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
    if (cleaned.length === 8) return cleaned.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
    return telephone;
  }

  formatShortDate(date: string): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // ===== UTILITAIRES =====
  getStatutClass(statut: string): string {
    if (!statut) return 'statut-inconnu';

    const normalizedStatut = statut.toLowerCase().trim();

    const classes: Record<string, string> = {
      // Statuts principaux
      en_attente: 'statut-en-attente',
      en_cours: 'statut-en-cours',
      resolu: 'statut-resolu',
      clos: 'statut-clos',
      cloture: 'statut-clos',
      ferme: 'statut-clos',

      // Alias pour compatibilité
      ouvert: 'statut-en-attente',
      active: 'statut-en-cours',
      termine: 'statut-resolu',
      terminee: 'statut-resolu',
      suspendu: 'statut-suspendu',
    };

    return classes[normalizedStatut] || 'statut-inconnu';
  }

  getStatutLabel(statut: string): string {
    if (!statut) return 'Inconnu';

    const normalizedStatut = statut.toLowerCase().trim();

    const labels: Record<string, string> = {
      en_attente: 'En attente',
      en_cours: 'En cours',
      resolu: 'Résolu',
      clos: 'Clos',
      cloture: 'Clôturé',
      ferme: 'Fermé',

      // Alias pour compatibilité
      ouvert: 'Ouvert',
      active: 'Actif',
      termine: 'Terminé',
      terminee: 'Terminée',
      suspendu: 'Suspendu',
    };

    return labels[normalizedStatut] || statut;
  }

  getStatutIcon(statut: string): string {
    if (!statut) return 'fa-question';

    const normalizedStatut = statut.toLowerCase().trim();

    const icons: Record<string, string> = {
      en_attente: 'fa-clock',
      en_cours: 'fa-spinner',
      resolu: 'fa-check-circle',
      clos: 'fa-lock',
      cloture: 'fa-lock',
      ferme: 'fa-lock',

      // Alias
      ouvert: 'fa-clock',
      active: 'fa-spinner',
      termine: 'fa-check-circle',
      terminee: 'fa-check-circle',
      suspendu: 'fa-pause',
    };

    return icons[normalizedStatut] || 'fa-question';
  }

  getPrioriteClass(priorite: string): string {
    const classes: Record<string, string> = {
      haute: 'priorite-haute',
      moyenne: 'priorite-moyenne',
      basse: 'priorite-basse',
    };
    return classes[priorite] || '';
  }

  getPrioriteIcon(priorite: string): string {
    const icons: Record<string, string> = {
      haute: '🔴',
      moyenne: '🟡',
      basse: '🟢',
    };
    return icons[priorite] || '⚪';
  }

  // ===== ACTIONS =====
  exportData(): void {
    this.logDebug('Export des données');
  }

  printPage(): void {
    window.print();
  }

  refreshData(): void {
    this.loadData();
  }
}
