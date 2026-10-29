import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EntitesService } from '../../services/entites-services';

@Component({
  selector: 'app-entites',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './entites.html',
  styleUrls: ['./entites.css']
})
export class Entites implements OnInit {
  @ViewChild('entiteModal') entiteModal!: ElementRef;
  @ViewChild('deleteModal') deleteModal!: ElementRef;

  // ===== DONNÉES =====
  entites: any[] = [];           // Liste plate pour le tableau
  entitesArbre: any[] = [];       // Arbre pour la vue hiérarchique
  filteredEntites: any[] = [];    // Entités filtrées
  entiteStats: any = {
    total: 0,
    racines: 0,
    avec_tickets: 0,
    total_tickets: 0
  };

  // ===== CONFIRMATION =====
showConfirmModal: boolean = false;
confirmMessage: string = '';
confirmType: 'success' | 'error' | 'info' = 'success';

  // ===== OPTIONS DU PARENT =====
  private _parentOptions: any[] = [];
  parentOptions: any[] = [];

  // ===== ÉTATS =====
  isLoading = false;
  searchQuery = '';
  viewMode: 'tableau' | 'arbre' = 'tableau';
  expandedNodes: Set<number> = new Set();

  // ===== TRI =====
  sortField = 'nom';
  sortDirection: 'asc' | 'desc' = 'asc';

  // ===== MODAL =====
  isModalOpen = false;
  isDeleteModalOpen = false;
  modalTitle = '';
  modalMode: 'add' | 'edit' | 'view' = 'view';
  selectedEntite: any = null;
  entiteForm: FormGroup;
  isSaving = false;
  isViewModalOpen: boolean = false;
  // ===== PAGINATION =====
  currentPage = 1;
  itemsPerPage = 15;
  totalPages = 0;

  // ===== UTILITAIRES =====
  Math = Math;

  constructor(
    private entitesService: EntitesService,
    private fb: FormBuilder,
     private cd: ChangeDetectorRef,
  ) {
    this.entiteForm = this.createEntiteForm();
  }

  ngOnInit(): void {
    this.loadData(); // Charger les données au démarrage
  }

  private createEntiteForm(): FormGroup {
    return this.fb.group({
      nom: ['', [Validators.required, Validators.minLength(2)]],
      parent_id: [null],
      description: ['']
    });
  }

  // ===== CHARGER LES DONNÉES =====
  loadData(): void {
    this.isLoading = true;

    // Appel API pour récupérer les entités
    this.entitesService.getEntites().subscribe({
      next: (entites) => {
        // console.log('✅ Entités reçues:', entites);

        // Stocker l'arbre pour la vue arborescente
        this.entitesArbre = entites;

        // Aplatir l'arbre pour la vue tableau
        this.entites = this.flattenTree(entites);

        // Appliquer les filtres
        this.applyFilters();

        // Calculer les statistiques
        this.calculerStats();

        this.isLoading = false;
        this.cd.markForCheck();
      },
      error: (error) => {
        console.error('❌ Erreur chargement entités:', error);
        this.isLoading = false;
        this.cd.markForCheck();
        this.showErrorMessage('Erreur lors du chargement des entités');
      }
    });
  }

  // ===== APLATIR L'ARBRE POUR LE TABLEAU =====
  private flattenTree(entites: any[], niveau: number = 0, parentNom: string = ''): any[] {
    let result: any[] = [];

    entites.forEach(entite => {
      // Ajouter l'entité courante
      result.push({
        ...entite,
        niveau,
        parent_nom: parentNom,
        indent: '—'.repeat(niveau) + ' ' + entite.nom
      });

      // Ajouter récursivement les enfants
      if (entite.enfants && entite.enfants.length > 0) {
        result = result.concat(
          this.flattenTree(entite.enfants, niveau + 1, entite.nom)
        );
      }
    });

    return result;
  }

  // ===== CALCULER LES STATISTIQUES =====
  private calculerStats(): void {
    this.entiteStats = {
      total: this.entites.length,
      racines: this.entites.filter(e => !e.entite_principale_id).length,
      avec_tickets: this.entites.filter(e => e.nb_tickets > 0).length,
      total_tickets: this.entites.reduce((acc, e) => acc + (e.nb_tickets || 0), 0)
    };
  }

  // ===== METTRE À JOUR LES OPTIONS DU PARENT =====
  private updateParentOptions(): void {
    const options = [
      { id: null, nom: 'Aucun (Racine)' }
    ];

    this.entites
      .filter(e => !this.selectedEntite || e.id !== this.selectedEntite.id)
      .forEach(e => options.push({ id: e.id, nom: e.nom }));

    this._parentOptions = options;
    this.parentOptions = [...options];
  }

  // ===== GETTER POUR LES OPTIONS =====
  getParentOptions(): any[] {
    return this.parentOptions;
  }

  // ===== GESTIONNAIRE DE READONLY =====
  isFieldReadonly(): boolean {
    return this.modalMode === 'view';
  }

  // ===== OUVRIR LA MODALE D'AJOUT =====
  openAddModal(): void {
    this.modalMode = 'add';
    this.modalTitle = 'Ajouter une entité';
    this.selectedEntite = null;
    this.updateParentOptions();
    this.entiteForm.reset({
      nom: '',
      parent_id: null,
      description: ''
    });
    this.isModalOpen = true;
  }

  // ===== OUVRIR LA MODALE DE MODIFICATION =====
  openEditModal(entite: any): void {
    this.modalMode = 'edit';
    this.modalTitle = 'Modifier l\'entité';
    this.selectedEntite = entite;
    this.updateParentOptions();
    this.entiteForm.patchValue({
      nom: entite.nom,
      parent_id: entite.entite_principale_id,
      description: entite.description || ''
    });
    this.isModalOpen = true;
  }

  // ===== OUVRIR LA MODALE DE VISUALISATION =====
  openViewModal(entite: any): void {
    this.selectedEntite = entite;

    // Récupérer les détails supplémentaires si nécessaire
    this.chargerDetailsEntite(entite.id);

    this.isViewModalOpen = true;
  }

  // ===== FERMER LA MODALE DE VISUALISATION =====
  closeViewModal(): void {
    this.isViewModalOpen = false;
    this.selectedEntite = null;
  }

  // ===== CHARGER LES DÉTAILS COMPLETS D'UNE ENTITÉ =====
  chargerDetailsEntite(id: number): void {
    // Vous pouvez appeler une API spécifique si nécessaire
    // this.entitesService.getEntiteById(id).subscribe(...)

    // Sinon, les détails sont déjà dans selectedEntite
    // console.log('Détails de l\'entité:', this.selectedEntite);
  }

  // ===== SAUVEGARDER UNE ENTITÉ =====
  saveEntite(): void {
    if (this.entiteForm.invalid) {
      Object.keys(this.entiteForm.controls).forEach(key => {
        this.entiteForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSaving = true;

    const entiteData = {
      nom: this.entiteForm.value.nom,
      entite_principale_id: this.entiteForm.value.parent_id || null
    };

    // console.log('📤 Envoi des données:', entiteData);

    if (this.modalMode === 'add') {
      this.entitesService.addEntite(entiteData).subscribe({
        next: (newEntite) => {
          // console.log('✅ Entité ajoutée:', newEntite);

          // Fermer la modale d'ajout
          this.closeModal();

          // Désactiver l'état de sauvegarde
          this.isSaving = false;

          // Afficher la modal de confirmation
          this.showConfirmModal = true;
          this.confirmMessage = `L'entité "${newEntite.nom}" a été ajoutée avec succès.`;
          this.confirmType = 'success';

          // Recharger les données
          this.loadData();
        },
        error: (error) => {
          console.error('❌ Erreur API:', error);
          this.isSaving = false;

          if (error.status === 422 && error.error?.errors) {
            const errors = error.error.errors;
            if (errors.nom) {
              this.entiteForm.get('nom')?.setErrors({ apiError: errors.nom[0] });
            }

            // Afficher modal d'erreur
            this.showConfirmModal = true;
            this.confirmMessage = 'Veuillez corriger les erreurs de validation.';
            this.confirmType = 'error';
          } else {
            this.showErrorMessage(error.error?.message || 'Erreur lors de l\'ajout');
          }
        }
      });
    }
  }

// ===== FERMER LA MODALE DE CONFIRMATION =====
closeConfirmModal(): void {
  this.showConfirmModal = false;
  this.confirmMessage = '';
}

  // ===== FERMER LA MODALE =====
  closeModal(): void {
    this.isModalOpen = false;
    this.selectedEntite = null;
    this.entiteForm.reset({
      nom: '',
      parent_id: null,
      description: ''
    });
    Object.keys(this.entiteForm.controls).forEach(key => {
      const control = this.entiteForm.get(key);
      if (control) {
        control.setErrors(null);
        control.markAsPristine();
        control.markAsUntouched();
      }
    });
    this.parentOptions = [];
  }


 // ===== SUPPRIMER UNE ENTITÉ (AVEC FORCE) =====
  deleteEntite(): void {
    if (!this.selectedEntite) {
      return;
    }

    this.isSaving = true;
    const entiteId = this.selectedEntite.id;
    const entiteNom = this.selectedEntite.nom;

    // console.log('🗑️ Suppression forcée de l\'entité:', entiteNom);

    // Utiliser UNIQUEMENT deleteEntiteForce
    this.entitesService.deleteEntiteForce(entiteId).subscribe({
      next: (response) => {
        // console.log('✅ Réponse suppression:', response);

        // 1. Fermer la modale de suppression
        this.closeDeleteModal();

        // 2. Désactiver l'état de sauvegarde
        this.isSaving = false;

        // 3. Afficher la modale de confirmation de succès
        this.showConfirmModal = true;
        this.confirmType = 'success';
        this.confirmMessage = `✅ L'entité "${entiteNom}" et toutes ses sous-entités ont été supprimées avec succès.`;

        // 4. Recharger la liste des entités
        this.loadData();
      },
      error: (error) => {
        console.error('❌ Erreur suppression:', error);

        // 1. Fermer la modale de suppression
        this.closeDeleteModal();

        // 2. Désactiver l'état de sauvegarde
        this.isSaving = false;

        // 3. Afficher la modale de confirmation d'erreur
        this.showConfirmModal = true;
        this.confirmType = 'error';

        // 4. Gestion des erreurs détaillées
        if (error.status === 422 && error.error?.data) {
          const errorData = error.error.data;

          if (errorData.type === 'has_users') {
            const utilisateursListe = errorData.utilisateurs?.join('\n• ') || '';
            this.confirmMessage =
              `❌ Suppression impossible\n\n` +
              `L'entité "${entiteNom}" contient ${errorData.count} utilisateur(s) associé(s) :\n` +
              `• ${utilisateursListe}\n\n` +
              `Veuillez d'abord réaffecter ou supprimer ces utilisateurs.`;
          } else {
            this.confirmMessage = error.error.message || 'Erreur lors de la suppression';
          }
        } else {
          this.confirmMessage = error.error?.message || '❌ Erreur lors de la suppression';
        }
      }
    });
  }

  // ===== MODIFIER UNE ENTITÉ (FONCTION SÉPARÉE) =====
  modifierEntite(): void {
    if (this.entiteForm.invalid) {
      Object.keys(this.entiteForm.controls).forEach(key => {
        this.entiteForm.get(key)?.markAsTouched();
      });
      return;
    }

    if (!this.selectedEntite) {
      this.showErrorMessage('Aucune entité sélectionnée pour la modification');
      return;
    }

    this.isSaving = true;
    const entiteId = this.selectedEntite.id;
    const ancienNom = this.selectedEntite.nom;

    const entiteData = {
      nom: this.entiteForm.value.nom,
      entite_principale_id: this.entiteForm.value.parent_id || null
    };

    // console.log('📤 Modification de l\'entité ID:', entiteId);
    // console.log('📤 Ancien nom:', ancienNom);
    // console.log('📤 Nouvelles données:', entiteData);

    this.entitesService.updateEntite(entiteId, entiteData).subscribe({
      next: (updatedEntite) => {
        // console.log('✅ Entité modifiée avec succès:', updatedEntite);

        // Fermer la modale
        this.closeModal();
        this.isSaving = false;

        // Afficher la modale de confirmation de succès
        this.showConfirmModal = true;
        this.confirmType = 'success';
        this.confirmMessage = `✅ L'entité "${updatedEntite.nom}" a été modifiée avec succès.`;

        // Recharger les données
        this.loadData();
      },
      error: (error) => {
        console.error('❌ Erreur lors de la modification:', error);
        this.isSaving = false;

        // Gestion des erreurs spécifiques
        if (error.status === 422) {
          if (error.error?.errors) {
            // Erreurs de validation (nom déjà existant, etc.)
            const errors = error.error.errors;

            // Afficher l'erreur sur le champ concerné
            if (errors.nom) {
              this.entiteForm.get('nom')?.setErrors({ apiError: errors.nom[0] });
            }

            // Message global
            this.showConfirmModal = true;
            this.confirmType = 'error';
            this.confirmMessage = '❌ Erreur de validation. Veuillez corriger les champs.';
          }
          else if (error.error?.message) {
            // Autres erreurs métier (boucle hiérarchique, auto-parent)
            this.showConfirmModal = true;
            this.confirmType = 'error';
            this.confirmMessage = `❌ ${error.error.message}`;
          }
          else {
            this.showConfirmModal = true;
            this.confirmType = 'error';
            this.confirmMessage = '❌ Erreur lors de la modification (validation).';
          }
        }
        else {
          // Erreur serveur ou autre
          this.showConfirmModal = true;
          this.confirmType = 'error';
          this.confirmMessage = error.error?.message || '❌ Erreur lors de la modification';
        }
      }
    });
  }

//   openEditModal(entite: any): void {
//   this.modalMode = 'edit';
//   this.modalTitle = 'Modifier l\'entité';
//   this.selectedEntite = entite;

//   // Mettre à jour les options du parent
//   this.updateParentOptions();

//   // Remplir le formulaire avec les données existantes
//   this.entiteForm.patchValue({
//     nom: entite.nom,
//     parent_id: entite.entite_principale_id,
//     description: entite.description || ''
//   });

//   this.isModalOpen = true;
// }


  // ===== OUVRIR LA MODALE DE SUPPRESSION =====
  openDeleteModal(entite: any): void {
    this.selectedEntite = entite;
    this.isDeleteModalOpen = true;
  }

  // ===== FERMER LA MODALE DE SUPPRESSION =====
  closeDeleteModal(): void {
    this.isDeleteModalOpen = false;
    this.selectedEntite = null;
  }

  // ===== FILTRES ET RECHERCHE =====
  applyFilters(): void {
    let filtered = [...this.entites];

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.nom.toLowerCase().includes(query) ||
        (e.parent_nom && e.parent_nom.toLowerCase().includes(query))
      );
    }

    filtered.sort((a, b) => {
      let fieldA = a[this.sortField] || '';
      let fieldB = b[this.sortField] || '';

      if (this.sortField === 'niveau') {
        fieldA = a.niveau || 0;
        fieldB = b.niveau || 0;
      }

      if (typeof fieldA === 'string') fieldA = fieldA.toLowerCase();
      if (typeof fieldB === 'string') fieldB = fieldB.toLowerCase();

      if (this.sortDirection === 'asc') {
        return fieldA < fieldB ? -1 : fieldA > fieldB ? 1 : 0;
      } else {
        return fieldA > fieldB ? -1 : fieldA < fieldB ? 1 : 0;
      }
    });

    this.filteredEntites = filtered;
    this.totalPages = Math.ceil(this.filteredEntites.length / this.itemsPerPage);
  }

  onSearch(event: any): void {
    this.searchQuery = event.target.value;
    this.currentPage = 1;
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.currentPage = 1;
    this.applyFilters();
  }

  // ===== TRI =====
  sortBy(field: string): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  getSortIcon(field: string): string {
    if (this.sortField !== field) return '↕️';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  // ===== VUE ARBRE =====
  toggleNode(id: number): void {
    if (this.expandedNodes.has(id)) {
      this.expandedNodes.delete(id);
    } else {
      this.expandedNodes.add(id);
    }
  }

  isNodeExpanded(id: number): boolean {
    return this.expandedNodes.has(id);
  }

  // ===== PAGINATION =====
  get paginatedEntites(): any[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredEntites.slice(start, start + this.itemsPerPage);
  }

  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  // ===== UTILITAIRES =====
  getNiveauLabel(niveau: number): string {
    switch(niveau) {
      case 0: return '🏢 Entite principal';
      case 1: return '📂 Entite';
      case 2: return '📄 sous entite';
      default: return '📌 Sous-service';
    }
  }

  getNiveauIcon(niveau: number): string {
    switch(niveau) {
      case 0: return '🏢';
      case 1: return '📂';
      case 2: return '📄';
      default: return '📌';
    }
  }

  getNbTicketsClass(nb: number): string {
    if (nb === 0) return 'tickets-zero';
    if (nb < 10) return 'tickets-few';
    if (nb < 20) return 'tickets-medium';
    return 'tickets-many';
  }

  // ===== MESSAGES =====
  showSuccessMessage(message: string): void {
    alert('✅ ' + message);
  }

  showErrorMessage(message: string): void {
    alert('❌ ' + message);
  }

  // ===== ACTIONS =====
  exportData(): void {
    // console.log('Export des données');
  }

  printPage(): void {
    window.print();
  }

  refreshData(): void {
    this.loadData();
  }
}
