import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { DlgasService } from '../../services/dlgas-service';
import { TicketService } from '../../services/ticket-service';
import { forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { HostListener } from '@angular/core';
import { AuthService } from '../../services/auth-services';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dlgas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './dlgas.html',
  styleUrls: ['./dlgas.css'],
})
export class Dlgas implements OnInit {
  // ===== SIGNALS - DONNÉES =====
  dlgas = signal<any[]>([]);
  dlgasMap = signal<Map<number, string>>(new Map());
  tickets = signal<any[]>([]);
  filteredTickets = signal<any[]>([]);
  allTickets = signal<any[]>([]);
  regions = signal<string[]>([]);
  entites = signal<any[]>([]);
  elements = signal<any[]>([]);
  // dlgas.ts - Ajouter cette propriété avec les autres
  private readonly enableDebug = environment.enableDebug;

  private getCurrentUserId(): number {
    const user = this.authService.getCurrentUser()();
    return user?.id || 0;
  }

  // ===== SIGNALS - PAGINATION =====
  currentPage = signal<number>(1);
  itemsPerPage = signal<number>(10);
  totalTickets = signal<number>(0);
  totalPages = signal<number>(0);
  showingFrom = signal<number>(0);
  showingTo = signal<number>(0);

  // ===== SIGNALS - STATISTIQUES TICKETS =====
  ticketsStats = signal<any>({
    total: 0,
    en_cours: 0,
    resolus: 0,
    nouveaux: 0,
    haute_priorite: 0,
    en_cours_pourcentage: 0,
    resolus_pourcentage: 0,
    haute_priorite_pourcentage: 0,
  });

  // ===== SIGNALS - STATISTIQUES DLGAS =====
  dlgasStats = signal<any>({
    total: 0,
    actifs: 0,
    inactifs: 0,
    nouveaux: 0,
    regions: 0,
  });

  // Seuils SLA
  slaThresholds = {
    critique: 24,
    haute: 48,
    moyenne: 72,
    basse: 96,
  };

  // ===== SIGNALS - MODALE DÉTAILS TICKET =====
  showDetailsModal = signal<boolean>(false);
  selectedTicketDetails = signal<any>(null);
  isLoadingDetails = signal<boolean>(false);

  // ===== SIGNALS - ÉTATS =====
  isLoading = signal<boolean>(false);
  searchQuery = signal<string>('');

  private searchSubject = new Subject<string>();

  // Filtres
  filterStatut = signal<string>('tous');
  filterPriorite = signal<string>('toutes');
  filterDlgasId = signal<number>(0);

  sortField = signal<string>('date_creation');
  sortDirection = signal<'asc' | 'desc'>('desc');

  viewMode = signal<'grid' | 'list'>('list');
  submitError = signal<string | null>(null);
  showExportMenu = signal<boolean>(false);

  // ===== SIGNALS - MODAL =====
  isModalOpen = signal<boolean>(false);
  isDeleteModalOpen = signal<boolean>(false);
  isAssignModalOpen = signal<boolean>(false);
  modalTitle = signal<string>('');
  modalMode = signal<'add' | 'edit' | 'view'>('view');
  selectedDlgas = signal<any>(null);
  selectedTicketForAssign = signal<any>(null);
  selectedDlgasForAssign: number | null = null;
  isSaving = signal<boolean>(false);

  // ===== SIGNALS - MODALE DÉTAILS DLGAS =====
  isDetailsModalOpen = signal<boolean>(false);
  selectedDlgasDetails = signal<any>(null);
  isLoadingDlgasDetails = signal<boolean>(false);

  // ===== SIGNALS - CONFIRMATION SUCCÈS =====
  showSuccessModal = signal<boolean>(false);
  successMessage = signal<string>('');

  // ===== SIGNALS - FILTRE MES TICKETS =====
  filterMesTickets = signal<boolean>(false);

  // ===== COMPUTED POUR PAGINATION =====
  pageNumbers = computed<(number | string)[]>(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const delta = 2;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number;

    if (total === 0) return ['1'];

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
  });

  shouldShowPagination = computed(() => {
    return this.filteredTickets().length > 0;
  });

  // ===== FORMULAIRE =====
  dlgasForm: FormGroup;

  statuts = [
    { value: 'tous', label: 'Tous les statuts' },
    { value: 'en_attente', label: 'En attente' },
    { value: 'en_cours', label: 'En cours' },
    { value: 'resolu', label: 'Résolu' },
    { value: 'clos', label: 'Clos' },
  ];

  priorites = [
    { value: 'toutes', label: 'Toutes les priorités' },
    { value: 'haute', label: 'Haute' },
    { value: 'moyenne', label: 'Moyenne' },
    { value: 'basse', label: 'Basse' },
  ];

  constructor(
    private dlgasService: DlgasService,
    private ticketService: TicketService,
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
  ) {
    this.dlgasForm = this.createForm();
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((searchTerm) => {
      this.searchQuery.set(searchTerm);
      this.currentPage.set(1);
      this.applyAllFilters();
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      nom: ['', [Validators.required, Validators.minLength(2)]],
      prenom: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      telephone: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      adresse: [''],
      description: [''],
      statut: ['actif'],
    });
  }

  // ===== MÉTHODES DE VÉRIFICATION DES PROFILS =====
  isSuperAdmin(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'superadmin';
  }

  isBackoffice(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'backoffice';
  }

  isDlgas(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'dlgas';
  }

  showDlgasFilter(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'superadmin' || user?.profil === 'backoffice';
  }

  canEditTicketWithService(ticket: any): boolean {
    const user = this.authService.getCurrentUser()();
    if (!user) return false;

    if (user.profil === 'superadmin' || user.profil === 'backoffice') {
      return true;
    }

    if (user.profil === 'consultation') {
      return ticket.dlgas_id === user.id;
    }

    return false;
  }

  // ===== CHARGEMENT DES DONNÉES =====
  loadData(): void {
    this.isLoading.set(true);

    const params: any = {
      page: this.currentPage(),
      per_page: this.itemsPerPage(),
    };

    if (this.filterStatut() !== 'tous') {
      params.statut = this.filterStatut();
    }

    if (this.filterPriorite() !== 'toutes') {
      params.urgence = this.filterPriorite();
    }

    if (this.filterDlgasId() !== 0) {
      params.dlgas_id = this.filterDlgasId();
    }

    forkJoin({
      dlgas: this.dlgasService.getAllDlgas(),
      tickets: this.dlgasService.getTicketsDlga(params),
      regions: this.dlgasService.getRegions(),
      dlgasStats: this.dlgasService.getDlgasStats(),
      entites: this.ticketService.getEntites(),
      elements: this.ticketService.getElements(),
    }).subscribe({
      next: (response: any) => {
        const { dlgas, tickets, regions, dlgasStats, entites, elements } = response;

        this.entites.set(entites);
        this.elements.set(elements);
        this.dlgas.set(dlgas);

        const dlgasMap = new Map<number, string>();
        dlgas.forEach((d: any) => {
          dlgasMap.set(d.id, d.nom);
        });
        this.dlgasMap.set(dlgasMap);

        const ticketsData = tickets.data || [];

        const transformedTickets = ticketsData.map((ticket: any) => {
          let dlgasNom = 'Non assigné';
          const slaDemarre = ticket.sla_started_at !== null && ticket.sla_started_at !== undefined;
          const slaDateDebut = slaDemarre ? ticket.sla_started_at : null;

          if (ticket.dlgas) {
            dlgasNom = `${ticket.dlgas.prenom || ''} ${ticket.dlgas.nom || ''}`.trim();
          } else if (ticket.dlgas_id) {
            dlgasNom = this.getDlgasNom(ticket.dlgas_id);
          }

          return {
            id: ticket.id,
            num_ticket: ticket.num_ticket || `#${ticket.id}`,
            titre: ticket.type || 'Ticket',
            type: ticket.type || 'declaration',
            description: ticket.detail,
            statut: ticket.statut,
            priorite: ticket.urgence,
            categorie: ticket.categorie,
            date_creation: ticket.date_ouverture || ticket.created_at,
            createur_nom: ticket.utilisateur
              ? `${ticket.utilisateur.prenom} ${ticket.utilisateur.nom}`
              : 'Inconnu',
            entite_nom: ticket.entite?.nom,
            element_nom: ticket.element?.nom,
            dlgas_id: ticket.dlgas_id,
            dlgas_nom: dlgasNom,
            prenom: ticket.prenom,
            nom: ticket.nom,
            email: ticket.email,
            telephone: ticket.telephone,
            adresse: ticket.adresse,
            source_demande: ticket.source_demande,
            sla_ttr: ticket.sla_ttr,
            sla_demarre: slaDemarre,
            sla_date_debut: slaDateDebut,
            demandeur: `${ticket.prenom || ''} ${ticket.nom || ''}`.trim() || 'Non renseigné',
          };
        });

        this.allTickets.set(transformedTickets);
        this.tickets.set(transformedTickets);
        this.applyAllFilters();

        this.regions.set(regions);
        this.dlgasStats.set(dlgasStats);
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('❌ Erreur chargement:', error);
        this.isLoading.set(false);
      },
    });
  }

  // ===== APPLIQUER TOUS LES FILTRES =====

  applyAllFilters(): void {
    let filtered = [...this.allTickets()];

    // Filtre "Mes tickets assignés"
    if (this.filterMesTickets()) {
      const user = this.authService.getCurrentUser()();
      const currentUserId = user?.id;
      if (currentUserId) {
        filtered = filtered.filter((t) => t.dlgas_id === currentUserId);
      }
      if (this.enableDebug) {
        console.log(
          `🔍 Filtre mes tickets: ${filtered.length} tickets assignés à l'utilisateur ${currentUserId}`,
        );
      }
    }

    // Filtre par statut
    if (this.filterStatut() !== 'tous') {
      filtered = filtered.filter((t) => t.statut === this.filterStatut());
    }

    // Filtre par priorité
    if (this.filterPriorite() !== 'toutes') {
      filtered = filtered.filter((t) => t.priorite === this.filterPriorite());
    }

    // Filtre par DLGAS
    if (this.filterDlgasId() !== 0) {
      filtered = filtered.filter((t) => t.dlgas_id === this.filterDlgasId());
    }

    // Filtre par recherche
    if (this.searchQuery()) {
      const query = this.searchQuery().toLowerCase().trim();
      filtered = filtered.filter(
        (ticket) =>
          ticket.num_ticket?.toLowerCase().includes(query) ||
          ticket.titre?.toLowerCase().includes(query) ||
          ticket.type?.toLowerCase().includes(query) ||
          ticket.id.toString().includes(query) ||
          ticket.description?.toLowerCase().includes(query) ||
          ticket.dlgas_nom?.toLowerCase().includes(query) ||
          ticket.prenom?.toLowerCase().includes(query) ||
          ticket.nom?.toLowerCase().includes(query) ||
          ticket.email?.toLowerCase().includes(query) ||
          ticket.categorie?.toLowerCase().includes(query),
      );
    }

    this.filteredTickets.set(filtered);
    this.totalTickets.set(filtered.length);
    this.totalPages.set(Math.ceil(filtered.length / this.itemsPerPage()));

    if (this.currentPage() > this.totalPages()) {
      this.currentPage.set(Math.max(1, this.totalPages()));
    }

    const start = (this.currentPage() - 1) * this.itemsPerPage();
    this.showingFrom.set(filtered.length > 0 ? start + 1 : 0);
    this.showingTo.set(Math.min(start + this.itemsPerPage(), filtered.length));

    this.sortTickets();
  }

  getDlgasNom(dlgasId: number): string {
    if (!dlgasId) return 'Non assigné';
    const dlgasMap = this.dlgasMap();
    return dlgasMap.get(dlgasId) || `DLGAS #${dlgasId}`;
  }

  // ===== PAGINATION =====
  get currentPageItems(): any[] {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return this.filteredTickets().slice(start, start + this.itemsPerPage());
  }

  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      const start = this.itemsPerPage() * (page - 1);
      this.showingFrom.set(this.filteredTickets().length > 0 ? start + 1 : 0);
      this.showingTo.set(Math.min(start + this.itemsPerPage(), this.filteredTickets().length));
    }
  }

  goToFirstPage(): void {
    if (this.currentPage() !== 1) {
      this.changePage(1);
    }
  }

  goToLastPage(): void {
    if (this.currentPage() !== this.totalPages()) {
      this.changePage(this.totalPages());
    }
  }

  changeItemsPerPage(event: any): void {
    const newPerPage = parseInt(event.target.value);
    this.itemsPerPage.set(newPerPage);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  onPageClick(page: number | string): void {
    if (page !== '...') {
      this.changePage(page as number);
    }
  }

  // ===== FILTRES =====
  onSearch(event: any): void {
    const searchTerm = event.target.value;
    this.searchSubject.next(searchTerm);
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

  setFilterDlgasId(dlgasId: number): void {
    this.filterDlgasId.set(dlgasId);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterStatut.set('tous');
    this.filterPriorite.set('toutes');
    this.filterMesTickets.set(false); // Réinitialiser le filtre "Mes tickets"
    this.filterDlgasId.set(0);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  // ===== TRI =====
  sortBy(field: string): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
    this.sortTickets();
  }

  // Dans dlgas.ts, ajouter la gestion du tri pour les nouvelles colonnes

  sortTickets(): void {
    const sorted = [...this.filteredTickets()].sort((a, b) => {
      let fieldA = a[this.sortField()];
      let fieldB = b[this.sortField()];

      // Gestion spéciale pour le champ demandeur
      if (this.sortField() === 'demandeur') {
        fieldA = `${a.prenom || ''} ${a.nom || ''}`.trim().toLowerCase();
        fieldB = `${b.prenom || ''} ${b.nom || ''}`.trim().toLowerCase();
      }

      // Gestion spéciale pour le champ num_ticket
      if (this.sortField() === 'num_ticket') {
        fieldA = (a.num_ticket || a.id).toString();
        fieldB = (b.num_ticket || b.id).toString();
      }

      // Gestion spéciale pour le champ type
      if (this.sortField() === 'type') {
        fieldA = (a.type || '').toLowerCase();
        fieldB = (b.type || '').toLowerCase();
      }

      // Gestion spéciale pour le champ categorie
      if (this.sortField() === 'categorie') {
        fieldA = (a.categorie || '').toLowerCase();
        fieldB = (b.categorie || '').toLowerCase();
      }

      // Gestion spéciale pour le champ sla
      if (this.sortField() === 'sla') {
        fieldA = a.sla_ttr || 0;
        fieldB = b.sla_ttr || 0;
      }

      if (this.sortField() === 'date_creation') {
        fieldA = fieldA ? new Date(fieldA).getTime() : 0;
        fieldB = fieldB ? new Date(fieldB).getTime() : 0;
      }

      if (this.sortField() === 'dlgas_nom') {
        fieldA = (a.dlgas_nom || 'Non assigné').toLowerCase();
        fieldB = (b.dlgas_nom || 'Non assigné').toLowerCase();
      }

      if (typeof fieldA === 'string') fieldA = fieldA.toLowerCase();
      if (typeof fieldB === 'string') fieldB = fieldB.toLowerCase();

      return this.sortDirection() === 'asc'
        ? fieldA < fieldB
          ? -1
          : fieldA > fieldB
            ? 1
            : 0
        : fieldA > fieldB
          ? -1
          : fieldA < fieldB
            ? 1
            : 0;
    });

    this.filteredTickets.set(sorted);
  }

  getSortIcon(field: string): string {
    if (this.sortField() !== field) return '↕️';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  // ===== GESTION DES TICKETS =====
  openTicketDetails(ticket: any): void {
    this.isLoadingDetails.set(true);
    this.showDetailsModal.set(true);

    this.ticketService.getTicketById(ticket.id).subscribe({
      next: (data: any) => {
        const details = {
          id: data.id || ticket.id,
          titre: data.type || ticket.titre || 'Ticket',
          type: data.type || ticket.type,
          statut: data.statut || ticket.statut,
          priorite: data.urgence || ticket.priorite,
          categorie: data.categorie || ticket.categorie,
          date_creation: ticket.date_creation || data.created_at || data.date_creation,
          createur_nom: ticket.createur_nom || 'Inconnu',
          createur_id: data.user_id || ticket.createur_id,
          prenom: data.prenom || ticket.prenom || 'Non renseigné',
          nom: data.nom || ticket.nom || 'Non renseigné',
          email: data.email || ticket.email || 'Non renseigné',
          telephone: data.telephone || ticket.telephone || 'Non renseigné',
          adresse: data.adresse || ticket.adresse || 'Non renseignée',
          source_demande: data.source_demande || ticket.source_demande || '',
          detail: data.detail || ticket.description || '',
          entite_nom: ticket.entite_nom || 'Non spécifié',
          entite_id: data.entite_id || ticket.entite_id,
          element_nom: ticket.element_nom || 'Non spécifié',
          element_id: data.element_id || ticket.element_id,
          dlgas_nom: ticket.dlgas_nom || 'Non assigné',
          dlgas_id: data.dlgas_id?.id || data.dlgas_id || ticket.dlgas_id,
        };

        this.selectedTicketDetails.set(details);
        this.isLoadingDetails.set(false);
      },
      error: (error: any) => {
        console.error('❌ Erreur:', error);
        this.selectedTicketDetails.set({
          id: ticket.id,
          titre: ticket.titre || ticket.type || 'Ticket',
          statut: ticket.statut,
          priorite: ticket.priorite || ticket.urgence,
          categorie: ticket.categorie,
          date_creation: ticket.date_creation || ticket.created_at,
          createur_nom: ticket.createur_nom || 'Inconnu',
          prenom: ticket.prenom || 'Non renseigné',
          nom: ticket.nom || 'Non renseigné',
          entite_nom: ticket.entite_nom || 'Non spécifié',
          element_nom: ticket.element_nom || 'Non spécifié',
          dlgas_nom: ticket.dlgas_nom || 'Non assigné',
        });
        this.isLoadingDetails.set(false);
      },
    });
  }

  closeDetailsModal(): void {
    this.showDetailsModal.set(false);
    this.selectedTicketDetails.set(null);
    this.isLoadingDetails.set(false);
  }

  // ===== GESTION DES TICKETS =====
  goToEditTicketDlgas(ticket: any): void {
    if (!ticket || !ticket.id) {
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

    this.router
      .navigate(['/tickets/modifier', ticket.id], {
        state: { ticket: ticketData },
      })
      .then((success) => {
        if (success) {
          //console.log('✅ Navigation réussie vers modification du ticket #', ticket.id);
        } else {
          console.error('❌ Échec de la navigation');
        }
      })
      .catch((error) => {
        console.error('❌ Erreur de navigation:', error);
      });
  }

  // ===== GESTION DES MODALS DLGAS =====
  openAddModal(): void {
  this.modalMode.set('add');
  this.modalTitle.set('Ajouter un DLGAS');
  this.selectedDlgas.set(null);

  this.dlgasForm.reset({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    adresse: '',
    description: '',
    statut: 'actif',
    // ✅ PAS de entite_id
  });

  Object.keys(this.dlgasForm.controls).forEach((key) => this.dlgasForm.get(key)?.enable());
  this.isModalOpen.set(true);
}

  openEditModal(dlgas: any): void {
    this.modalMode.set('edit');
    this.modalTitle.set('Modifier le DLGAS');
    this.selectedDlgas.set(dlgas);
    this.dlgasForm.patchValue({
      nom: dlgas.nom_famille || '',
      prenom: dlgas.prenom || '',
      email: dlgas.email || '',
      telephone: dlgas.telephone || '',
      adresse: dlgas.adresse || '',
      description: dlgas.description || '',
      statut: dlgas.statut || 'actif',
    });
    Object.keys(this.dlgasForm.controls).forEach((key) => this.dlgasForm.get(key)?.enable());
    this.isModalOpen.set(true);
  }

  openDeleteModal(dlgas: any): void {
    this.selectedDlgas.set(dlgas);
    this.isDeleteModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedDlgas.set(null);
    this.submitError.set(null);
    this.dlgasForm.reset();
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen.set(false);
    this.selectedDlgas.set(null);
  }

  saveDlgas(): void {
    if (this.dlgasForm.invalid) {
      Object.keys(this.dlgasForm.controls).forEach((key) =>
        this.dlgasForm.get(key)?.markAsTouched(),
      );
      return;
    }

    this.isSaving.set(true);
    this.submitError.set(null);
    const formData = this.dlgasForm.getRawValue();

    if (this.modalMode() === 'add') {
      this.dlgasService.addDlgas(formData).subscribe({
        next: (newDlgas) => {
          this.loadData();
          this.isSaving.set(false);
          this.closeModal();
          this.showSuccessModalWithMessage(
            `Le DLGAS "${newDlgas.prenom} ${newDlgas.nom}" a été ajouté avec succès.`,
          );
        },
        error: (error) => {
          console.error('❌ Erreur API:', error);
          this.isSaving.set(false);
          this.handleApiError(error);
        },
      });
    } else if (this.modalMode() === 'edit' && this.selectedDlgas()) {
      const dlgasId = this.selectedDlgas().id;
      this.dlgasService.updateDlgas(dlgasId, formData).subscribe({
        next: (updatedDlgas) => {
          this.loadData();
          this.isSaving.set(false);
          this.closeModal();
          this.showSuccessModalWithMessage(
            `Le DLGAS "${updatedDlgas.prenom} ${updatedDlgas.nom}" a été modifié avec succès.`,
          );
        },
        error: (error) => {
          console.error('❌ Erreur modification:', error);
          this.isSaving.set(false);
          this.handleApiError(error);
        },
      });
    }
  }

  deleteDlgas(): void {
    if (!this.selectedDlgas()) return;
    this.dlgasService.deleteDlgas(this.selectedDlgas().id).subscribe({
      next: () => {
        this.loadData();
        this.closeDeleteModal();
        this.showSuccessModalWithMessage(
          `Le DLGAS "${this.selectedDlgas()?.prenom} ${this.selectedDlgas()?.nom_famille}" a été supprimé avec succès.`,
        );
      },
      error: (error) => {
        console.error('❌ Erreur suppression:', error);
        this.showErrorMessage(error.error?.message || 'Erreur lors de la suppression');
      },
    });
  }

  toggleStatut(dlgas: any): void {
    this.selectedDlgas.set(dlgas);
    this.isSaving.set(true);
    const action$ =
      dlgas.statut === 'actif'
        ? this.dlgasService.desactiverDlgas(dlgas.id)
        : this.dlgasService.activerDlgas(dlgas.id);
    action$.subscribe({
      next: () => {
        this.loadData();
        this.isSaving.set(false);
        const actionMessage = dlgas.statut === 'actif' ? 'désactivé' : 'activé';
        this.showSuccessModalWithMessage(
          `Le DLGAS "${dlgas.prenom} ${dlgas.nom_famille}" a été ${actionMessage} avec succès.`,
        );
      },
      error: (error) => {
        console.error('❌ Erreur changement statut:', error);
        this.isSaving.set(false);
        this.showErrorMessage(error.error?.message || 'Erreur lors du changement de statut');
      },
    });
  }

  private handleApiError(error: any): void {
    if (error.status === 422 && error.error?.errors) {
      const errors = error.error.errors;
      Object.keys(errors).forEach((key) => {
        const control = this.dlgasForm.get(key);
        if (control) control.setErrors({ apiError: errors[key][0] });
      });
      this.submitError.set('Veuillez corriger les erreurs de validation');
    } else {
      this.submitError.set(error.error?.message || "Erreur lors de l'opération");
    }
  }

  showSuccessModalWithMessage(message: string): void {
    this.successMessage.set(message);
    this.showSuccessModal.set(true);
    setTimeout(() => this.closeSuccessModal(), 3000);
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
    this.successMessage.set('');
  }

  showSuccessMessage(message: string): void {
    alert('✅ ' + message);
  }

  showErrorMessage(message: string): void {
    alert('❌ ' + message);
  }

  // ===== BADGES =====
  getStatutClass(statut: string): string {
    switch (statut) {
      case 'nouveau':
        return 'statut-nouveau';
      case 'en_cours':
        return 'statut-en-cours';
      case 'en_attente':
        return 'statut-en-attente';
      case 'resolu':
        return 'statut-resolu';
      case 'clos':
        return 'statut-clos';
      default:
        return '';
    }
  }

  getStatutIcon(statut: string): string {
    switch (statut) {
      case 'nouveau':
        return '🆕';
      case 'en_cours':
        return '🔄';
      case 'en_attente':
        return '⏳';
      case 'resolu':
        return '✅';
      case 'clos':
        return '🔒';
      default:
        return '📌';
    }
  }

  getPrioriteClass(priorite: string): string {
    switch (priorite) {
      case 'haute':
        return 'priorite-haute';
      case 'moyenne':
        return 'priorite-moyenne';
      case 'basse':
        return 'priorite-basse';
      default:
        return '';
    }
  }

  getPrioriteIcon(priorite: string): string {
    switch (priorite) {
      case 'haute':
        return '🔴';
      case 'moyenne':
        return '🟡';
      case 'basse':
        return '🟢';
      default:
        return '⚪';
    }
  }

  getAvatarUrl(dlgas: any): string {
    if (!dlgas) return '';
    const name =
      dlgas.prenom && dlgas.nom_famille
        ? `${dlgas.prenom} ${dlgas.nom_famille}`
        : dlgas.nom || 'DLGAS';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0066b3&color=fff&size=128`;
  }

  formatShortDate(date: string): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // ===== EXPORT =====
  exportData(format: 'excel' | 'pdf' | 'csv'): void {
    try {
      const dataToExport = this.filteredTickets();
      if (dataToExport.length === 0) {
        this.showErrorMessage('Aucune donnée à exporter');
        return;
      }
      switch (format) {
        case 'excel':
          this.exportToExcel(dataToExport);
          break;
        case 'pdf':
          this.exportToPDF(dataToExport);
          break;
        case 'csv':
          this.exportToCSV(dataToExport);
          break;
      }
      this.showSuccessMessage(`Export ${format.toUpperCase()} réussi`);
    } catch (error) {
      console.error('❌ Erreur export:', error);
      this.showErrorMessage("Erreur lors de l'export");
    }
  }

  async exportToExcel(tickets: any[]): Promise<void> {
    const XLSX = await import('xlsx');
    const dataToExport = tickets.map((t) => ({
      ID: t.id,
      Titre: t.titre,
      Catégorie: t.categorie,
      Statut: t.statut,
      Priorité: t.priorite,
      DLGAS: t.dlgas_nom || 'Non assigné',
      'Date création': this.formatShortDate(t.date_creation),
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const { saveAs } = await import('file-saver');
    saveAs(data, `tickets_dlgas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async exportToPDF(tickets: any[]): Promise<void> {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF('landscape', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text('Tickets par DLGAS', 14, 22);
    doc.setFontSize(11);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);
    const headers = [['ID', 'Titre', 'Catégorie', 'Statut', 'Priorité', 'DLGAS', 'Date']];
    const data = tickets.map((t) => [
      t.id.toString(),
      t.titre,
      t.categorie,
      t.statut,
      t.priorite,
      t.dlgas_nom || 'Non assigné',
      this.formatShortDate(t.date_creation),
    ]);
    autoTable(doc, {
      head: headers,
      body: data,
      startY: 40,
      theme: 'striped',
      headStyles: { fillColor: [0, 102, 179] },
    });
    doc.save(`tickets_dlgas_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  exportToCSV(tickets: any[]): void {
    const headers = ['ID', 'Titre', 'Catégorie', 'Statut', 'Priorité', 'DLGAS', 'Date création'];
    const csvData = tickets.map((t) => [
      t.id,
      t.titre,
      t.categorie,
      t.statut,
      t.priorite,
      t.dlgas_nom || 'Non assigné',
      this.formatShortDate(t.date_creation),
    ]);
    let csvContent = headers.join(';') + '\n';
    csvData.forEach((row) => (csvContent += row.join(';') + '\n'));
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tickets_dlgas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  toggleExportMenu(): void {
    this.showExportMenu.update((value) => !value);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown')) this.showExportMenu.set(false);
  }

  printPage(): void {
    window.print();
  }

  // ===== SIGNAL POUR LE COMPTE DES TICKETS ASSIGNÉS =====
  mesTicketsCount = computed(() => {
    const user = this.authService.getCurrentUser()();
    const currentUserId = user?.id;
    if (!currentUserId) return 0;
    return this.allTickets().filter((t) => t.dlgas_id === currentUserId).length;
  });

  // ===== TOGGLE MES TICKETS =====
  toggleMesTickets(): void {
    this.filterMesTickets.update((value) => !value);
    this.currentPage.set(1);
    this.applyAllFilters();
  }

  // ===== VÉRIFIER SI DES FILTRES SONT ACTIFS (mise à jour) =====
  hasActiveFilters(): boolean {
    return (
      this.filterStatut() !== 'tous' ||
      this.filterPriorite() !== 'toutes' ||
      this.filterDlgasId() !== 0 ||
      this.searchQuery() !== '' ||
      this.filterMesTickets()
    );
  }

  // Dans dlgas.ts, ajouter cette méthode
  getTypeLabel(type: string): string {
    if (type === 'declaration') return '📝 Déclaration';
    if (type === 'reclamation') return '⚠️ Réclamation';
    return type || 'Non spécifié';
  }

  // Vérifier si le SLA est démarré
  isSlaDemarre(ticket: any): boolean {
    return ticket.sla_demarre === true;
  }

  // Calculer le pourcentage SLA
  calculateSlaPercentage(ticket: any): number {
    // Si le SLA n'est pas démarré, retourner 0
    if (!ticket.sla_demarre) {
      return 0;
    }

    // Utiliser sla_date_debut comme date de départ du SLA
    const dateDebut = ticket.sla_date_debut;
    if (!dateDebut) return 0;

    const dateDebutObj = new Date(dateDebut);
    const now = new Date();
    const heuresEcoulees = (now.getTime() - dateDebutObj.getTime()) / (1000 * 60 * 60);

    let heuresMax =
      ticket.sla_ttr ||
      this.slaThresholds[ticket.priorite as keyof typeof this.slaThresholds] ||
      48;
    const pourcentage = Math.min((heuresEcoulees / heuresMax) * 100, 100);
    return Math.round(pourcentage);
  }

  // Obtenir la classe CSS du SLA
  getSlaClass(ticket: any): string {
    // Si le SLA n'est pas démarré
    if (!ticket.sla_demarre) {
      return 'sla-non-demarre';
    }

    const pourcentage = this.calculateSlaPercentage(ticket);

    if (pourcentage >= 90) return 'sla-critique';
    if (pourcentage >= 70) return 'sla-warning';
    if (pourcentage >= 50) return 'sla-attention';
    return 'sla-normal';
  }

  // Obtenir le temps restant formaté
  getTempsRestant(ticket: any): string {
    // Si le SLA n'est pas démarré
    if (!ticket.sla_demarre || !ticket.sla_date_debut) {
      return 'Non démarré';
    }

    const dateDebut = new Date(ticket.sla_date_debut);
    const now = new Date();
    const heuresEcoulees = (now.getTime() - dateDebut.getTime()) / (1000 * 60 * 60);

    let heuresMax =
      ticket.sla_ttr ||
      this.slaThresholds[ticket.priorite as keyof typeof this.slaThresholds] ||
      48;
    const heuresRestantes = Math.max(heuresMax - heuresEcoulees, 0);

    if (heuresRestantes <= 0) return 'Délai dépassé';

    const jours = Math.floor(heuresRestantes / 24);
    const heures = Math.floor(heuresRestantes % 24);

    if (jours > 0) {
      return `${jours}j ${heures}h`;
    }
    return `${Math.round(heuresRestantes)}h`;
  }
}
