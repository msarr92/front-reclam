import { Component, OnInit, ViewChild, ElementRef, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ElementService } from '../../services/element-service';

@Component({
  selector: 'app-elements',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './elements.html',
  styleUrls: ['./elements.css']
})
export class Elements implements OnInit {
  @ViewChild('lieuModal') lieuModal!: ElementRef;
  @ViewChild('zoneModal') zoneModal!: ElementRef;
  @ViewChild('deleteModal') deleteModal!: ElementRef;

  // ===== SIGNALS =====
  // Données
  expandedZoneId = signal<number | null>(null);
  zones = signal<any[]>([]);
  lieux = signal<any[]>([]);
  filteredZones = signal<any[]>([]);
  filteredLieux = signal<any[]>([]);
  stats = signal<any>({
    total_zones: 0,
    total_lieux: 0,
    zones_actives: 0,
    lieux_actifs: 0
  });

  // ===== SIGNALS POUR LA SUPPRESSION =====
  isDeleting = signal<boolean>(false);
  deleteSuccess = signal<boolean>(false);
  deleteError = signal<string | null>(null);
  // Vue active
  activeView = signal<'zones' | 'lieux'>('zones');

  // États
  isLoading = signal<boolean>(false);
  searchQuery = signal<string>('');

  // Tri
  sortField = signal<string>('nom');
  sortDirection = signal<'asc' | 'desc'>('asc');

  // Pagination
  currentPage = signal<number>(1);
  itemsPerPage = signal<number>(10);
  totalPages = signal<number>(0);

  // Computed values
  paginatedItems = computed(() => {
    const items = this.activeView() === 'zones' ? this.filteredZones() : this.filteredLieux();
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    return items.slice(start, start + this.itemsPerPage());
  });

  shouldShowPagination = computed(() => {
    const totalItems = this.activeView() === 'zones' ? this.filteredZones().length : this.filteredLieux().length;
    return totalItems > this.itemsPerPage();
  });

  // ===== MODAL ZONE =====
  isZoneModalOpen = signal<boolean>(false);
  zoneModalMode = signal<'add' | 'edit' | 'view'>('add');
  zoneModalTitle = signal<string>('');
  selectedZone = signal<any>(null);
  zoneForm: FormGroup;

  // ===== MODAL LIEU =====
  isLieuModalOpen = signal<boolean>(false);
  lieuModalMode = signal<'add' | 'edit' | 'view'>('add');
  lieuModalTitle = signal<string>('');
  selectedLieu = signal<any>(null);
  lieuForm: FormGroup;

  // ===== MODAL SUPPRESSION =====
  isDeleteModalOpen = signal<boolean>(false);
  deleteType = signal<'zone' | 'lieu'>('zone');
  itemToDelete = signal<any>(null);

  // ===== MODAL CONFIRMATION =====
  showConfirmModal = signal<boolean>(false);
  confirmMessage = signal<string>('');
  confirmType = signal<'success' | 'error' | 'info'>('success');

  // ===== UTILITAIRES =====
  Math = Math;
  // ===== SIGNALS POUR LA MODIFICATION =====
  isUpdating = signal<boolean>(false);
  updateSuccess = signal<boolean>(false);
  updateError = signal<string | null>(null);

  constructor(
    private geographieService: ElementService,
    private fb: FormBuilder
  ) {
    this.zoneForm = this.createZoneForm();
    this.lieuForm = this.createLieuForm();

    // Effect pour appliquer les filtres quand searchQuery change
    effect(() => {
      this.applyFilters();
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.loadData();
  }

  // ===== TOGGLE AFFICHAGE DE LA LISTE =====
  toggleLieuxList(zoneId: number): void {
    if (this.expandedZoneId() === zoneId) {
      this.expandedZoneId.set(null);
    } else {
      this.expandedZoneId.set(zoneId);
    }
  }

  private createZoneForm(): FormGroup {
    return this.fb.group({
      nom: ['', [Validators.required, Validators.minLength(2)]],
      element_principal_id: [null], // Toujours null pour les zones
      description: [''],
      statut: ['actif', Validators.required]
    });
  }

  private createLieuForm(): FormGroup {
    return this.fb.group({
      nom: ['', [Validators.required, Validators.minLength(2)]],
      element_principal_id: [null, Validators.required], // ID de la zone parente
      type: ['quartier'],
      description: [''],
      statut: ['actif', Validators.required]
    });
  }

  // ===== CHARGER LES DONNÉES =====
  loadData(): void {
    this.isLoading.set(true);

    // Appel API unique pour récupérer tous les éléments
    this.geographieService.getElements().subscribe({
      next: (data) => {
        const elements = data.liste || [];

        // Extraire les zones et les lieux
        const toutesZones = elements.filter((el: any) => !el.element_principal_id);
        const tousLieux = elements.filter((el: any) => el.element_principal_id);

        // Ajouter le champ zone_nom pour les lieux
        const lieuxAvecZoneNom = tousLieux.map((lieu: any) => {
          const zone = toutesZones.find((z: any) => z.id === lieu.element_principal_id);
          return {
            ...lieu,
            zone_nom: zone ? zone.nom : 'Inconnue',
            zone_id: lieu.element_principal_id
          };
        });

        this.zones.set(toutesZones);
        this.lieux.set(lieuxAvecZoneNom);
        this.filteredZones.set(toutesZones);
        this.filteredLieux.set(lieuxAvecZoneNom);

        this.applyFilters();
        this.checkLoadingComplete();
      },
      error: (error) => {
        console.error('Erreur chargement éléments:', error);
        this.checkLoadingComplete();
      }
    });

    // Charger les stats
    this.geographieService.getStats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
      }
    });
  }

 processElements(elements: any[]): void {
 // console.log('🔄 Traitement des éléments reçus:', elements);

  const zones: any[] = [];
  const lieux: any[] = [];

  const parcourir = (items: any[], niveau: number = 0, parentNom: string = '') => {
    for (const item of items) {
      if (item.element_principal_id === null) {
        // C'est une ZONE
       // console.log('🏢 ZONE trouvée:', item.nom);
        zones.push({
          id: item.id,
          nom: item.nom,
          element_principal_id: null,
          description: item.description || '',
          statut: item.statut || 'actif',
          created_at: item.created_at || new Date().toISOString().split('T')[0],
          niveau: niveau
        });
      } else {
        // C'est un LIEU
       // console.log('📍 LIEU trouvé:', item.nom, 'dans', parentNom);
        lieux.push({
          id: item.id,
          nom: item.nom,
          element_principal_id: item.element_principal_id,
          zone_id: item.element_principal_id,
          zone_nom: parentNom,
          type: item.type || 'quartier',
          description: item.description || '',
          statut: item.statut || 'actif',
          created_at: item.created_at || new Date().toISOString().split('T')[0]
        });
      }

      if (item.enfants && item.enfants.length > 0) {
        parcourir(item.enfants, niveau + 1, item.nom);
      }
    }
  };

  parcourir(elements);

 // console.log('✅ Zones extraites:', zones);
 // console.log('✅ Lieux extraits:', lieux);

  this.zones.set(zones);
  this.lieux.set(lieux);
  this.filteredZones.set(zones);
  this.filteredLieux.set(lieux);
  this.applyFilters();
}

  private checkLoadingComplete(): void {
    if (this.zones().length > 0 || this.lieux().length > 0) {
      this.isLoading.set(false);
    }
  }

  // ===== FILTRES ET RECHERCHE =====
  applyFilters(): void {
    const query = this.searchQuery().toLowerCase();

    // Filtrer les zones
    const filteredZones = this.zones().filter(zone =>
      zone.nom.toLowerCase().includes(query) ||
      (zone.description && zone.description.toLowerCase().includes(query))
    );
    this.filteredZones.set(filteredZones);

    // Filtrer les lieux
    const filteredLieux = this.lieux().filter(lieu =>
      lieu.nom.toLowerCase().includes(query) ||
      (lieu.zone_nom && lieu.zone_nom.toLowerCase().includes(query)) ||
      (lieu.type && lieu.type.toLowerCase().includes(query))
    );
    this.filteredLieux.set(filteredLieux);

    // Mettre à jour la pagination
    this.updatePagination();
  }

  private updatePagination(): void {
    const totalItems = this.activeView() === 'zones' ? this.filteredZones().length : this.filteredLieux().length;
    this.totalPages.set(Math.ceil(totalItems / this.itemsPerPage()));
    this.currentPage.set(1);
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.target.value);
  }

  clearFilters(): void {
    this.searchQuery.set('');
  }

  // ===== CHANGER DE VUE =====
  setActiveView(view: 'zones' | 'lieux'): void {
    this.activeView.set(view);
    this.updatePagination();
    this.applyFilters();
  }

  // ===== TRI =====
  sortBy(field: string): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
    this.applyFilters();
  }

  getSortIcon(field: string): string {
    if (this.sortField() !== field) return '↕️';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  // ===== PAGINATION =====
  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  // ===== GESTION ZONES AVEC AJOUTERELEMENT =====
  openAddZoneModal(): void {
    this.zoneModalMode.set('add');
    this.zoneModalTitle.set('Ajouter une zone');
    this.selectedZone.set(null);

    // Réinitialiser le formulaire avec les bons champs
    this.zoneForm.reset({
      nom: '',
      element_principal_id: null,  // Important : null pour une zone
      description: '',
      statut: 'actif'
    });

    this.isZoneModalOpen.set(true);
  }

  // ===== OUVRIR MODALE DE MODIFICATION ZONE =====

  openEditZoneModal(zone: any): void {
    this.zoneModalMode.set('edit');
    this.zoneModalTitle.set('Modifier la zone');
    this.selectedZone.set(zone);

    // Réinitialiser les états
    this.isUpdating.set(false);
    this.updateError.set(null);

    // Pré-remplir le formulaire
    this.zoneForm.patchValue({
      nom: zone.nom || '',
      element_principal_id: null,
      description: zone.description || '',
      statut: zone.statut || 'actif'
    });

    this.isZoneModalOpen.set(true);

   // console.log('📝 Ouverture modification zone:', zone);
  }

  openViewZoneModal(zone: any): void {
    this.zoneModalMode.set('view');
    this.zoneModalTitle.set('Détails de la zone');
    this.selectedZone.set(zone);
    this.zoneForm.patchValue({
      nom: zone.nom,
      description: zone.description || '',
      statut: zone.statut || 'actif'
    });
    this.isZoneModalOpen.set(true);
  }

  closeZoneModal(): void {
    this.isZoneModalOpen.set(false);
    this.selectedZone.set(null);
    this.zoneForm.reset();
  }

 saveZone(): void {
  if (this.zoneForm.invalid) {
    Object.keys(this.zoneForm.controls).forEach(key => {
      this.zoneForm.get(key)?.markAsTouched();
    });
    return;
  }

  const zoneData = {
    nom: this.zoneForm.value.nom,
    element_principal_id: null // Une zone n'a pas de parent
  };

  if (this.zoneModalMode() === 'add') {
    // Mode AJOUT
    this.geographieService.ajouterElement(zoneData).subscribe({
      next: (newZone) => {
       // console.log('✅ Nouvelle zone créée:', newZone);

        // Créer l'objet zone avec les bonnes propriétés
        const zoneComplete = {
          id: newZone.id,
          nom: newZone.nom,
          element_principal_id: null,
          description: this.zoneForm.value.description || '',
          statut: this.zoneForm.value.statut || 'actif',
          created_at: new Date().toISOString().split('T')[0],
          niveau: 0,
          enfants: [] // Important pour la structure
        };

        // Mettre à jour le signal des zones
        this.zones.update(zones => [...zones, zoneComplete]);

        // IMPORTANT : Recharger les données depuis l'API pour être synchronisé
        this.loadData();

        this.closeZoneModal();
        this.showConfirmModal.set(true);
        this.confirmType.set('success');
        this.confirmMessage.set(`✅ La zone "${newZone.nom}" a été ajoutée avec succès.`);
      },
      error: (error) => {
        console.error('❌ Erreur API:', error);
        this.showConfirmModal.set(true);
        this.confirmType.set('error');
        this.confirmMessage.set(error.error?.message || '❌ Erreur lors de l\'ajout');
      }
    });
  } else if (this.zoneModalMode() === 'edit') {
    // Mode MODIFICATION - AJOUTER CETTE PARTIE
    this.updateZone();
  }
}

  // ===== GESTION LIEUX AVEC AJOUTERELEMENT =====
  openAddLieuModal(): void {
    this.lieuModalMode.set('add');
    this.lieuModalTitle.set('Ajouter un lieu');
    this.selectedLieu.set(null);

    // Réinitialiser le formulaire
    this.lieuForm.reset({
      nom: '',
      element_principal_id: null,  // Sera sélectionné par l'utilisateur
      type: 'quartier',
      description: '',
      statut: 'actif'
    });

    this.isLieuModalOpen.set(true);
  }

  // ===== OUVRIR MODALE DE MODIFICATION LIEU =====
  openEditLieuModal(lieu: any): void {
    this.lieuModalMode.set('edit');
    this.lieuModalTitle.set('Modifier le lieu');
    this.selectedLieu.set(lieu);

    // Réinitialiser les états
    this.isUpdating.set(false);
    this.updateError.set(null);

    // Pré-remplir le formulaire
    this.lieuForm.patchValue({
      nom: lieu.nom || '',
      element_principal_id: lieu.element_principal_id,
      type: lieu.type || 'quartier',
      description: lieu.description || '',
      statut: lieu.statut || 'actif'
    });

    this.isLieuModalOpen.set(true);

   // console.log('📝 Ouverture modification lieu:', lieu);
  }

 // ===== OUVRIR MODALE DÉTAILS LIEU =====
  openViewLieuModal(lieu: any): void {
    this.lieuModalMode.set('view');
    this.lieuModalTitle.set(`Détails du lieu : ${lieu.nom}`);
    this.selectedLieu.set(lieu);

    // Pré-remplir le formulaire (optionnel)
    this.lieuForm.patchValue({
      nom: lieu.nom || '',
      element_principal_id: lieu.element_principal_id,
      type: lieu.type || 'quartier',
      description: lieu.description || '',
      statut: lieu.statut || 'actif'
    });

    this.isLieuModalOpen.set(true);
  }
  // ===== FERMETURE AVEC RAFRAÎCHISSEMENT =====

  closeLieuModal(): void {
    this.isLieuModalOpen.set(false);
    this.selectedLieu.set(null);
    this.lieuForm.reset();
  }

  saveLieu(): void {
  if (this.lieuForm.invalid) {
    Object.keys(this.lieuForm.controls).forEach(key => {
      this.lieuForm.get(key)?.markAsTouched();
    });
    return;
  }

  const lieuData = {
    nom: this.lieuForm.value.nom,
    element_principal_id: this.lieuForm.value.element_principal_id // ID de la zone parente
  };

  if (this.lieuModalMode() === 'add') {
    // Mode AJOUT
    this.geographieService.ajouterElement(lieuData).subscribe({
      next: (newLieu) => {
        // Récupérer le nom de la zone pour l'affichage
        const zone = this.zones().find(z => z.id === this.lieuForm.value.element_principal_id);

        const lieuComplete = {
          ...newLieu,
          zone_id: this.lieuForm.value.element_principal_id,
          zone_nom: zone ? zone.nom : 'Inconnue',
          type: this.lieuForm.value.type || 'quartier',
          description: this.lieuForm.value.description,
          statut: this.lieuForm.value.statut || 'actif',
          created_at: new Date().toISOString().split('T')[0]
        };

        this.lieux.update(lieux => [...lieux, lieuComplete]);
        this.applyFilters();
        this.closeLieuModal();
        this.showConfirmModal.set(true);
        this.confirmType.set('success');
        this.confirmMessage.set(`✅ Le lieu "${newLieu.nom}" a été ajouté avec succès.`);
        this.loadData();
      },
      error: (error) => {
        this.showConfirmModal.set(true);
        this.confirmType.set('error');
        this.confirmMessage.set(error.error?.message || '❌ Erreur lors de l\'ajout');
      }
    });
  } else if (this.lieuModalMode() === 'edit') {
    // Mode MODIFICATION - AJOUTER CETTE PARTIE
    this.updateLieu();
  }
}

  // ===== AJOUTER UN LIEU DANS UNE ZONE SPÉCIFIQUE =====
  addLieuToZone(zone: any): void {
    this.activeView.set('lieux');

    this.lieuModalMode.set('add');
    this.lieuModalTitle.set(`Ajouter un lieu dans ${zone.nom}`);
    this.selectedLieu.set(null);

    // Réinitialiser et pré-sélectionner la zone
    this.lieuForm.reset({
      type: 'quartier',
      statut: 'actif',
      element_principal_id: zone.id, // Pré-sélectionner la zone
      description: ''
    });

    this.isLieuModalOpen.set(true);
  }

  // ===== GESTION SUPPRESSION =====
  openDeleteModal(type: 'zone' | 'lieu', item: any): void {
    this.deleteType.set(type);
    this.itemToDelete.set(item);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen.set(false);
    this.itemToDelete.set(null);
  }

  // ===== CONFIRM DELETE =====
  confirmDelete(): void {
    const item = this.itemToDelete();
    if (!item) return;

    // Activer l'état de suppression
    this.isDeleting.set(true);
    this.deleteError.set(null);

   // console.log(`🗑️ Suppression en cours de ${this.deleteType()} "${item.nom}" (ID: ${item.id})`);

    this.geographieService.supprimerElement(item.id).subscribe({
      next: (response) => {
       // console.log('✅ Suppression réussie:', response);

        // Mise à jour des listes avec signals
        if (this.deleteType() === 'zone') {
          // Mettre à jour la liste des zones
          this.zones.update(zones => {
            const nouvellesZones = zones.filter(z => z.id !== item.id);
           // console.log(`📊 Zones: ${zones.length} → ${nouvellesZones.length}`);
            return nouvellesZones;
          });

          // Mettre à jour les zones filtrées
          this.filteredZones.update(zones => {
            return zones.filter(z => z.id !== item.id);
          });

        } else {
          // Mettre à jour la liste des lieux
          this.lieux.update(lieux => {
            const nouveauxLieux = lieux.filter(l => l.id !== item.id);
           // console.log(`📊 Lieux: ${lieux.length} → ${nouveauxLieux.length}`);
            return nouveauxLieux;
          });

          // Mettre à jour les lieux filtrés
          this.filteredLieux.update(lieux => {
            return lieux.filter(l => l.id !== item.id);
          });
        }

        // Mettre à jour les statistiques avec signals
        this.updateStatsAfterDelete();

        // Fermer la modale de suppression
        this.closeDeleteModal();

        // Désactiver l'état de suppression
        this.isDeleting.set(false);
        this.deleteSuccess.set(true);

        // Afficher la confirmation avec signal
        this.showConfirmModal.set(true);
        this.confirmType.set('success');
        this.confirmMessage.set(response.message || `✅ L'élément "${item.nom}" a été supprimé avec succès.`);

        // Optionnel : Recharger complètement les données
        // this.loadData();

        // Auto-fermeture de la confirmation après 3 secondes (optionnel)
        // setTimeout(() => this.closeConfirmModal(), 3000);
      },
      error: (error) => {
        console.error('❌ Erreur suppression:', error);

        // Gestion des erreurs avec signals
        this.isDeleting.set(false);
        this.deleteError.set(error.error?.message || 'Erreur lors de la suppression');
        this.deleteSuccess.set(false);

        // Fermer la modale de suppression
        this.closeDeleteModal();

        // Afficher l'erreur dans la modale de confirmation
        this.showConfirmModal.set(true);
        this.confirmType.set('error');
        this.confirmMessage.set(this.deleteError() || '❌ Erreur lors de la suppression');
      }
    });
  }

  // ===== METTRE À JOUR LES STATISTIQUES APRÈS SUPPRESSION =====
  private updateStatsAfterDelete(): void {
    // Récupérer les valeurs actuelles des signals
    const currentZones = this.zones();
    const currentLieux = this.lieux();

    // Calculer les nouvelles statistiques
    const newStats = {
      total_zones: currentZones.length,
      total_lieux: currentLieux.length,
      zones_actives: currentZones.filter(z => z.statut === 'actif').length,
      lieux_actifs: currentLieux.filter(l => l.statut === 'actif').length
    };

    // Mettre à jour le signal stats
    this.stats.set(newStats);

   // console.log('📊 Statistiques mises à jour:', newStats);
  }

  // ===== RÉCUPÉRER LA ZONE PARENTE D'UN LIEU =====
  getZoneParente(zoneId: number): any {
    if (!zoneId) return null;
    return this.zones().find(z => z.id === zoneId);
  }

  // ===== FERMER MODALE DE CONFIRMATION =====
  closeConfirmModal(): void {
    this.showConfirmModal.set(false);
    this.confirmMessage.set('');
  }

  // ===== MODIFIER UNE ZONE =====
 updateZone(): void {
    if (this.zoneForm.invalid) {
      Object.keys(this.zoneForm.controls).forEach(key => {
        this.zoneForm.get(key)?.markAsTouched();
      });
      return;
    }

    const zone = this.selectedZone();
    if (!zone) return;

    this.isUpdating.set(true);
    this.updateError.set(null);

    const zoneData = {
      nom: this.zoneForm.value.nom,
      element_principal_id: null // Une zone n'a pas de parent
    };

   // console.log(`📝 Modification de la zone ID ${zone.id}:`, zoneData);

    this.geographieService.modifierElement(zone.id, zoneData).subscribe({
      next: (updatedZone) => {
       // console.log('✅ Zone modifiée avec succès:', updatedZone);

        // Créer l'objet complet avec les propriétés supplémentaires
        const zoneComplete = {
          ...updatedZone,
          description: this.zoneForm.value.description,
          statut: this.zoneForm.value.statut || 'actif'
        };

        // Mettre à jour la liste des zones
        this.zones.update(zones =>
          zones.map(z => z.id === zone.id ? zoneComplete : z)
        );

        // Mettre à jour les zones filtrées
        this.filteredZones.update(zones =>
          zones.map(z => z.id === zone.id ? zoneComplete : z)
        );

        // Fermer la modale
        this.closeZoneModal();
        this.isUpdating.set(false);
        this.updateSuccess.set(true);

        // Afficher la confirmation
        this.showConfirmModal.set(true);
        this.confirmType.set('success');
        this.confirmMessage.set(`✅ La zone "${updatedZone.nom}" a été modifiée avec succès.`);

        // Recharger les données pour être sûr
        this.loadData();
      },
      error: (error) => {
        console.error('❌ Erreur modification zone:', error);
        this.isUpdating.set(false);
        this.updateError.set(error.error?.message || 'Erreur lors de la modification');

        // Gestion des erreurs spécifiques
        if (error.status === 422) {
          if (error.error?.message?.includes('propre parent')) {
            this.updateError.set('❌ Une zone ne peut pas être son propre parent');
          } else if (error.error?.errors?.nom) {
            this.zoneForm.get('nom')?.setErrors({ apiError: error.error.errors.nom[0] });
            this.updateError.set('❌ Erreur de validation');
          }
        }

        this.showConfirmModal.set(true);
        this.confirmType.set('error');
        this.confirmMessage.set(this.updateError() || '❌ Erreur lors de la modification');
      }
    });
  }

    // ===== MODIFIER UN LIEU =====
  updateLieu(): void {
    if (this.lieuForm.invalid) {
      Object.keys(this.lieuForm.controls).forEach(key => {
        this.lieuForm.get(key)?.markAsTouched();
      });
      return;
    }

    const lieu = this.selectedLieu();
    if (!lieu) return;

    this.isUpdating.set(true);
    this.updateError.set(null);

    const lieuData = {
      nom: this.lieuForm.value.nom,
      element_principal_id: this.lieuForm.value.element_principal_id
    };

   // console.log(`📝 Modification du lieu ID ${lieu.id}:`, lieuData);

    this.geographieService.modifierElement(lieu.id, lieuData).subscribe({
      next: (updatedLieu) => {
       // console.log('✅ Lieu modifié avec succès:', updatedLieu);

        // Récupérer le nom de la zone pour l'affichage
        const zone = this.zones().find(z => z.id === this.lieuForm.value.element_principal_id);

        // Créer l'objet complet avec les propriétés supplémentaires
        const lieuComplete = {
          ...updatedLieu,
          zone_id: this.lieuForm.value.element_principal_id,
          zone_nom: zone ? zone.nom : 'Inconnue',
          type: this.lieuForm.value.type || 'quartier',
          description: this.lieuForm.value.description,
          statut: this.lieuForm.value.statut || 'actif'
        };

        // Mettre à jour la liste des lieux
        this.lieux.update(lieux =>
          lieux.map(l => l.id === lieu.id ? lieuComplete : l)
        );

        // Mettre à jour les lieux filtrés
        this.filteredLieux.update(lieux =>
          lieux.map(l => l.id === lieu.id ? lieuComplete : l)
        );

        // Fermer la modale
        this.closeLieuModal();
        this.isUpdating.set(false);
        this.updateSuccess.set(true);

        // Afficher la confirmation
        this.showConfirmModal.set(true);
        this.confirmType.set('success');
        this.confirmMessage.set(`✅ Le lieu "${updatedLieu.nom}" a été modifié avec succès.`);

        // Recharger les données pour être sûr
        this.loadData();
      },
      error: (error) => {
        console.error('❌ Erreur modification lieu:', error);
        this.isUpdating.set(false);
        this.updateError.set(error.error?.message || 'Erreur lors de la modification');

        // Gestion des erreurs spécifiques
        if (error.status === 422) {
          if (error.error?.message?.includes('propre parent')) {
            this.updateError.set('❌ Un lieu ne peut pas être son propre parent');
          } else if (error.error?.errors?.nom) {
            this.lieuForm.get('nom')?.setErrors({ apiError: error.error.errors.nom[0] });
          } else if (error.error?.errors?.element_principal_id) {
            this.lieuForm.get('element_principal_id')?.setErrors({
              apiError: error.error.errors.element_principal_id[0]
            });
          }
        }

        this.showConfirmModal.set(true);
        this.confirmType.set('error');
        this.confirmMessage.set(this.updateError() || '❌ Erreur lors de la modification');
      }
    });
  }

  // ===== UTILITAIRES =====
  getZoneName(zoneId: number): string {
    const zone = this.zones().find(z => z.id === zoneId);
    return zone ? zone.nom : 'Inconnue';
  }

  getLieuxCount(zoneId: number): number {
    return this.lieux().filter(lieu => lieu.zone_id === zoneId).length;
  }

  getTypeIcon(type: string): string {
    switch(type) {
      case 'ville': return '🏙️';
      case 'quartier': return '🏘️';
      case 'marché': return '🏪';
      case 'village': return '🏡';
      default: return '📍';
    }
  }

  getStatutClass(statut: string): string {
    return statut === 'actif' ? 'statut-actif' : 'statut-inactif';
  }

  getStatutIcon(statut: string): string {
    return statut === 'actif' ? '✅' : '⏸️';
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

  // ===== RÉCUPÉRER LES LIEUX D'UNE ZONE =====
getLieuxDeZone(zoneId: number): any[] {
  if (!zoneId) return [];
  return this.lieux().filter(lieu => lieu.element_principal_id === zoneId);
}





}
