import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  signal,
  computed,
  inject,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { UsersService } from '../../services/user-service';
import { forkJoin, Subject, debounceTime, distinctUntilChanged, takeUntil, finalize } from 'rxjs';
import { HostListener } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './users.html',
  styleUrls: ['./users.css'],
})
export class Users implements OnInit, OnDestroy {
  @ViewChild('userModal') userModal!: ElementRef;
  @ViewChild('deleteModal') deleteModal!: ElementRef;

  // ===== INJECTIONS =====
  private readonly usersService = inject(UsersService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // ===== SIGNALS - DONNÉES =====
  readonly users = signal<any[]>([]);
  readonly filteredUsers = signal<any[]>([]);
  readonly entites = signal<any[]>([]);
  readonly profils = signal<string[]>([]);

  // ===== SIGNALS - PAGINATION =====
  readonly currentPage = signal<number>(1);
  readonly itemsPerPage = signal<number>(5);
  readonly totalItems = signal<number>(0);
  readonly totalPages = signal<number>(0);

  // ===== SIGNALS - STATISTIQUES =====
  readonly userStats = signal<any>({
    total: 0,
    actifs: 0,
    inactifs: 0,
    nouveaux: 0,
    admins: 0,
    backoffice: 0,
    selfservice: 0,
    consultation: 0,
  });

  // ===== SIGNALS - ÉTATS =====
  readonly isLoading = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly selectedProfil = signal<string>('Tous');
  readonly selectedStatut = signal<string>('Tous');
  readonly selectedEntite = signal<string>('Toutes');
  readonly sortField = signal<string>('prenom');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly viewMode = signal<'grid' | 'list'>('list');
  readonly submitError = signal<string | null>(null);
  readonly showExportMenu = signal<boolean>(false);

  // ===== SIGNALS - MODAL =====
  readonly isModalOpen = signal<boolean>(false);
  readonly isDeleteModalOpen = signal<boolean>(false);
  readonly modalTitle = signal<string>('');
  readonly modalMode = signal<'add' | 'edit' | 'view'>('view');
  readonly selectedUser = signal<any>(null);
  readonly isSaving = signal<boolean>(false);
  readonly isStatusConfirmModalOpen = signal<boolean>(false);

  // ===== SIGNALS - MODALE DÉTAILS =====
  readonly isDetailsModalOpen = signal<boolean>(false);
  readonly selectedUserDetails = signal<any>(null);
  readonly isLoadingDetails = signal<boolean>(false);

  // ===== SIGNALS - SÉLECTION ENTITÉ =====
  readonly selectedEntiteId = signal<number | null>(null);
  readonly selectedEntiteDetails = signal<any>(null);
  readonly selectedEntiteForTooltip = signal<number | null>(null);
  readonly connectedUserEntite = signal<any>(null);
  readonly connectedUserEntiteFullPath = signal<string>('');

  // ===== SIGNALS - CONFIRMATION SUCCÈS =====
  readonly showSuccessModal = signal<boolean>(false);
  readonly successMessage = signal<string>('');

  // ===== SUBJECTS POUR LA GESTION DES ANNULATIONS =====
  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  // ===== FORMULAIRE =====
  userForm!: FormGroup;
  // ===== SIGNALS POUR L'AFFICHAGE DU MOT DE PASSE =====
showPassword = signal<boolean>(false);
showPasswordConfirm = signal<boolean>(false);

// ===== SIGNAL POUR LA FORCE DU MOT DE PASSE =====
passwordStrength = signal<number>(0);

// ===== SIGNALS EXISTANTS (à ajouter si manquants) =====
selectedEntites = signal<number[]>([]);



  // ===== CONSTANTES =====
  private readonly DEBOUNCE_TIME = 300;
  private readonly SUCCESS_MODAL_DURATION = 3000;
  private readonly DEFAULT_ITEMS_PER_PAGE = 5;

  // ===== COMPUTED =====
  readonly shouldShowPagination = computed(() => this.totalPages() > 1);

  readonly pageNumbers = computed<(number | string)[]>(() => {
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

  readonly currentPageUsers = computed(() => this.users());

  readonly actifsPercentage = computed(() => {
    const total = this.userStats().total;
    if (!total) return '0.0';
    return ((this.userStats().actifs / total) * 100).toFixed(1);
  });

  readonly adminsPercentage = computed(() => {
    const total = this.userStats().total;
    if (!total) return '0.0';
    return ((this.userStats().admins / total) * 100).toFixed(1);
  });

  readonly inactifsPercentage = computed(() => {
    const total = this.userStats().total;
    if (!total) return '0.0';
    return ((this.userStats().inactifs / total) * 100).toFixed(1);
  });

  readonly backofficePercentage = computed(() => {
    const total = this.userStats().total;
    if (!total) return '0.0';
    return ((this.userStats().backoffice / total) * 100).toFixed(1);
  });

  readonly selfservicePercentage = computed(() => {
    const total = this.userStats().total;
    if (!total) return '0.0';
    return ((this.userStats().selfservice / total) * 100).toFixed(1);
  });

  readonly consultationPercentage = computed(() => {
    const total = this.userStats().total;
    if (!total) return '0.0';
    return ((this.userStats().consultation / total) * 100).toFixed(1);
  });

  readonly selectedEntiteFullPath = computed(() => {
    const id = this.selectedEntiteId();
    if (!id) return '';
    const entite = this.entites().find((e) => e.id === id);
    return entite?.cheminComplet ?? '';
  });

  // ===== CONSTRUCTEUR =====
  constructor() {
    this.initForm();
    this.setupSearchDebounce();
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== INITIALISATION =====
private initForm(): void {
  this.userForm = this.fb.group(
    {
      nom: ['', [Validators.required, Validators.minLength(2)]],
      prenom: ['', [Validators.required, Validators.minLength(2)]],
      username: [
        '',
        [Validators.required, Validators.minLength(3), Validators.pattern('^[a-z0-9._]+$')],
      ],
      email: ['', [Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      password_confirmation: ['', [Validators.required]],
      profil: ['', Validators.required],
      entite_ids: [[]],  // ✅ Pas de validateur required ici
      statut: ['actif'],
      telephone: ['', [Validators.required, Validators.pattern('^[0-9]{9,10}$')]],
    },
    { validators: this.passwordMatchValidator.bind(this) },
  );

  // ✅ Écouter les changements de profil pour ajuster les validateurs
  this.userForm.get('profil')?.valueChanges
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((profil) => {
      this.updateEntiteValidator(profil);
    });
}

/**
 * ✅ Met à jour le validateur du champ entite_ids selon le profil
 */
private updateEntiteValidator(profil: string): void {
  const entiteControl = this.userForm.get('entite_ids');
  if (!entiteControl) return;

  if (profil === 'consultation') {
    // DLGAS → pas d'entité requise
    entiteControl.setValidators([]);
    entiteControl.setValue([]);
    this.selectedEntites.set([]);
  } else {
    // Autres profils → entités requises
    entiteControl.setValidators([Validators.required, Validators.minLength(1)]);
  }

  entiteControl.updateValueAndValidity();
}

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
        this.loadData();
      });
  }

  // ===== VALIDATEUR =====
  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password');
  const confirm = group.get('password_confirmation');

  if (password?.value && confirm?.value && password.value !== confirm.value) {
    return { passwordMismatch: true };
  }
  return null;
}

  // ===== MÉTHODES DE GÉNÉRATION USERNAME =====
  onNomPrenomChange(): void {
    if (this.modalMode() === 'add') {
      this.generateUsername();
    }
  }

  private generateUsername(): void {
    const nom = this.userForm.get('nom')?.value || '';
    const prenom = this.userForm.get('prenom')?.value || '';

    if (nom && prenom) {
      const prenomPrefix = prenom.substring(0, 3).toLowerCase();
      const nomSlug = this.slugify(nom);
      const username = `${nomSlug}.${prenomPrefix}`;
      this.userForm.get('username')?.setValue(username);
    } else if (nom) {
      const username = this.slugify(nom);
      this.userForm.get('username')?.setValue(username);
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
  }

  // ===== MÉTHODES ENTITÉ =====
  getEntiteFullPath(entiteId: number): string {
  const entite = this.entites().find((e) => e.id === entiteId);
  return entite?.chemin_complet || entite?.nom || '';
}

  showEntiteTooltip(entiteId: number): void {
    if (this.selectedEntiteForTooltip() === entiteId) {
      this.selectedEntiteForTooltip.set(null);
    } else {
      this.selectedEntiteForTooltip.set(entiteId);
      setTimeout(() => this.selectedEntiteForTooltip.set(null), 3000);
    }
  }

  getEntiteNiveau(entiteId: number): number {
    const entite = this.entites().find((e) => e.id === entiteId);
    return entite?.niveau || 0;
  }

  getEntitesByNiveau(niveau: number): any[] {
    return this.entites().filter((entite) => entite.niveau === niveau);
  }

  getEntitesCountByNiveau(niveau: number): number {
    return this.entites().filter((entite) => entite.niveau === niveau).length;
  }

  getEntitesByNiveaux(niveaux: number[]): any[] {
    return this.entites().filter((entite) => niveaux.includes(entite.niveau));
  }

  getEntiteIcon(niveau: number): string {
  if (niveau === 0) return '🏢';
  if (niveau === 1) return '📁';
  return '📂';
}


  // ===== APLATIR LES ENTITÉS =====
  private flattenEntitesForSelect(
    entites: any[],
    niveau: number = 0,
    parentNom: string = '',
    result: any[] = [],
  ): any[] {
    for (const entite of entites) {
      const cheminComplet = parentNom ? `${parentNom} → ${entite.nom}` : entite.nom;
      const indent = '\u00A0'.repeat(niveau * 2);
      const prefix = niveau > 0 ? '— ' : '';

      result.push({
        id: entite.id,
        nom: entite.nom,
        displayNom: indent + prefix + entite.nom,
        cheminComplet: cheminComplet,
        niveau: niveau,
      });

      if (entite.enfants?.length) {
        this.flattenEntitesForSelect(entite.enfants, niveau + 1, cheminComplet, result);
      }
    }
    return result;
  }

  onEntiteSelect(event: any): void {
    const entiteId = event.target.value;
    if (entiteId) {
      const entite = this.entites().find((e) => e.id == entiteId);
      this.selectedEntiteDetails.set(entite || null);
    } else {
      this.selectedEntiteDetails.set(null);
    }
  }

  // ===== CHARGEMENT DES DONNÉES =====


loadData(): void {
  const filters: any = {
    page: this.currentPage(),
    per_page: this.itemsPerPage(),
  };

  if (this.searchQuery()?.trim()) {
    filters.search = this.searchQuery();
  }
  if (this.selectedProfil() !== 'Tous') {
    filters.profil = this.selectedProfil();
  }
  if (this.selectedStatut() !== 'Tous') {
    filters.statut = this.selectedStatut();
  }
  if (this.selectedEntite() !== 'Toutes') {
    const entite = this.entites().find((e) => e.nom === this.selectedEntite());
    if (entite) {
      filters.entite_id = entite.id;
    }
  }

  this.isLoading.set(true);

  forkJoin({
    users: this.usersService.getUsers(filters.page, filters.per_page, filters),
    entites: this.usersService.getEntitesListe(),
  })
    .pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoading.set(false)),
    )
    .subscribe({
      next: (response: any) => {
        console.log('📥 Utilisateurs reçus:', response.users.users);

        // Afficher le premier utilisateur pour voir sa structure
        if (response.users.users && response.users.users.length > 0) {
          console.log('📋 Premier utilisateur:', response.users.users[0]);
          console.log('📋 Entités de l\'utilisateur:', response.users.users[0].entites);
          console.log('📋 entite_nom calculé:', response.users.users[0].entite_nom);
        }

        // Mettre à jour les utilisateurs
        this.users.set(response.users.users ?? []);
        this.filteredUsers.set(response.users.users ?? []);

        if (response.users.pagination) {
          this.totalPages.set(response.users.pagination.last_page || 1);
          this.totalItems.set(response.users.pagination.total || 0);
        }

        this.entites.set(response.entites ?? []);

        this.loadStats();
        this.loadProfils();
      },
      error: (error) => {
        console.error('❌ Erreur chargement:', error);
        this.showErrorMessage('Erreur lors du chargement des données');
        this.isLoading.set(false);
      },
    });
}

getPasswordStrength(): number {
  const password = this.userForm.get('password')?.value || '';
  let strength = 0;

  if (password.length >= 6) strength++;
  if (password.length >= 10) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z\d]/.test(password)) strength++;

  return Math.min(strength, 4);
}

getPasswordStrengthLabel(): string {
  const strength = this.getPasswordStrength();
  const labels = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'];
  return labels[strength] || 'Très faible';
}

private loadEntitesArbre(): void {
  this.usersService.getEntites()
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: (arbre) => {
        // Stocker l'arbre si nécessaire pour d'autres fonctionnalités
        // this.entitesArbre.set(arbre);
      },
      error: (error) => console.error('Erreur chargement arbre entités:', error)
    });
}

  // ===== PAGINATION =====
  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadData();
    }
  }

  changeItemsPerPage(event: any): void {
    const newPerPage = parseInt(event.target.value, 10);
    this.itemsPerPage.set(newPerPage);
    this.currentPage.set(1);
    this.loadData();
  }

  onPageClick(page: number | string): void {
    if (page !== '...') {
      this.changePage(page as number);
    }
  }

  // ===== STATISTIQUES ET PROFILS =====
  private loadStats(): void {
    this.usersService
      .getUserStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => this.userStats.set(stats),
        error: (err) => console.error('Erreur loadStats:', err),
      });
  }

  private loadProfils(): void {
    this.usersService
      .getProfils()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profils) => this.profils.set(profils),
        error: (error) => console.error('❌ Erreur chargement profils:', error),
      });
  }

  // ===== FILTRES =====
  onSearch(event: any): void {
    this.searchSubject.next(event.target.value);
  }

  onProfilChange(event: any): void {
    this.selectedProfil.set(event.target.value);
    this.currentPage.set(1);
    this.loadData();
  }

  onStatutChange(event: any): void {
    this.selectedStatut.set(event.target.value);
    this.currentPage.set(1);
    this.loadData();
  }

  onEntiteChange(event: any): void {
    this.selectedEntite.set(event.target.value);
    this.currentPage.set(1);
    this.loadData();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedProfil.set('Tous');
    this.selectedStatut.set('Tous');
    this.selectedEntite.set('Toutes');
    this.currentPage.set(1);

    const searchInput = document.querySelector('.search-bar input') as HTMLInputElement;
    if (searchInput) {
      searchInput.value = '';
    }

    this.loadData();
  }

  // ===== TRI =====
  sortBy(field: string): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
    this.sortLocalData();
  }

  private sortLocalData(): void {
    const sorted = [...this.users()].sort((a, b) => {
      let fieldA = a[this.sortField()];
      let fieldB = b[this.sortField()];

      if (this.sortField() === 'prenom') {
        fieldA = `${a.prenom} ${a.nom}`;
        fieldB = `${b.prenom} ${b.nom}`;
      }

      if (typeof fieldA === 'string') fieldA = fieldA.toLowerCase();
      if (typeof fieldB === 'string') fieldB = fieldB.toLowerCase();

      if (this.sortDirection() === 'asc') {
        return fieldA < fieldB ? -1 : fieldA > fieldB ? 1 : 0;
      } else {
        return fieldA > fieldB ? -1 : fieldA < fieldB ? 1 : 0;
      }
    });

    this.users.set(sorted);
  }

  getSortIcon(field: string): string {
    if (this.sortField() !== field) return '↕️';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  // ===== GESTION DES MODALS =====
openAddModal(): void {
  this.modalMode.set('add');
  this.modalTitle.set('Nouvel utilisateur');
  this.selectedUser.set(null);
  this.submitError.set(null);

  this.userForm.reset({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    username: '',
    password: '',
    password_confirmation: '',
    profil: '',
    statut: 'actif',
    entite_ids: [],
  });

  this.selectedEntites.set([]);
  this.showPassword.set(false);
  this.showPasswordConfirm.set(false);

  // ✅ IMPORTANT : Activer tous les champs
  Object.keys(this.userForm.controls).forEach((key) => {
    this.userForm.get(key)?.enable({ emitEvent: false });
  });

  this.isModalOpen.set(true);
}

  openEditModal(user: any): void {
  if (!user) return;

  this.modalMode.set('edit');
  this.modalTitle.set('Modifier l\'utilisateur');
  this.selectedUser.set(user);
  this.submitError.set(null);

  this.userForm.patchValue({
    nom: user.nom || '',
    prenom: user.prenom || '',
    email: user.email || '',
    telephone: user.telephone || '',
    username: user.username || '',
    password: '',
    password_confirmation: '',
    profil: user.profil || '',
    statut: user.statut || 'actif',
  });

  // Pré-sélectionner les entités
  if (user.entites && Array.isArray(user.entites)) {
    this.selectedEntites.set(user.entites.map((e: any) => e.id));
  } else {
    this.selectedEntites.set([]);
  }

  this.showPassword.set(false);
  this.showPasswordConfirm.set(false);

  Object.keys(this.userForm.controls).forEach((key) => {
    this.userForm.get(key)?.enable();
  });

  this.isModalOpen.set(true);
}

  openViewModal(user: any): void {
    this.modalMode.set('view');
    this.modalTitle.set('Détails utilisateur');
    this.selectedUser.set(user);

    this.userForm.patchValue({
      nom: user.nom || '',
      prenom: user.prenom || '',
      username: user.username || '',
      email: user.email || '',
      profil: user.profil || '',
      entite_id: user.entite_id || '',
      statut: user.statut || 'actif',
      telephone: user.telephone || '',
    });

    Object.keys(this.userForm.controls).forEach((key) => {
      this.userForm.get(key)?.disable();
    });

    if (user.entite_id) {
      const entite = this.entites().find((e) => e.id === user.entite_id);
      if (entite) {
        this.selectedEntiteDetails.set(entite);
      }
    }

    this.isModalOpen.set(true);
  }

  openDeleteModal(user: any): void {
    this.selectedUser.set(user);
    this.isDeleteModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedUser.set(null);
    this.selectedEntiteDetails.set(null);
    this.submitError.set(null);
    this.userForm.reset();
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen.set(false);
    this.selectedUser.set(null);
  }

  // ===== DÉTAILS UTILISATEUR =====
  openUserDetails(user: any): void {
    this.selectedUserDetails.set(user);
    this.isDetailsModalOpen.set(true);
    this.loadUserDetails(user.id);
  }

  closeDetailsModal(): void {
    this.isDetailsModalOpen.set(false);
    this.selectedUserDetails.set(null);
  }

  private loadUserDetails(id: number): void {
  this.isLoadingDetails.set(true);
  this.usersService
    .getUserById(id)
    .pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isLoadingDetails.set(false)),
    )
    .subscribe({
      next: (userDetails) => {
        console.log('📥 Détails utilisateur reçus:', userDetails);
        console.log('📥 Entités de l\'utilisateur:', userDetails.entites);
        this.selectedUserDetails.set(userDetails);
      },
      error: (error) => {
        console.error('❌ Erreur chargement détails:', error);
        this.showErrorMessage('Erreur lors du chargement des détails');
      },
    });
}

  // ===== SAUVEGARDER UN UTILISATEUR =====
  saveUser(): void {
    if (this.userForm.invalid) {
      this.markFormAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.submitError.set(null);
    const formData = this.userForm.getRawValue();

    if (this.modalMode() === 'add') {
      this.addUser(formData);
    } else if (this.modalMode() === 'edit' && this.selectedUser()) {
      this.updateUser(formData);
    }
  }

private addUser(formData: any): void {

  const telephoneClean = (formData.telephone || '')
    .toString()
    .replace(/\s/g, '');

  // ✅ Récupérer les entités depuis selectedEntites (source de vérité)
  const entitesArray = this.selectedEntites().map((id) => Number(id));

  const userData: any = {
    nom: formData.nom?.trim(),
    prenom: formData.prenom?.trim(),
    username: formData.username?.trim(),
    email: formData.email?.trim(),
    password: formData.password,
    password_confirmation: formData.password_confirmation,
    profil: formData.profil,
    telephone: telephoneClean,
    // ✅ Envoyer "entites" (nom attendu par Laravel)
    entites: entitesArray,
  };

  console.log('📤 [addUser] userData:', JSON.stringify(userData, null, 2));

  // ✅ Vérifications côté client
  if (!userData.entites || userData.entites.length === 0) {
    this.submitError.set('Veuillez sélectionner au moins une entité.');
    this.isSaving.set(false);
    return;
  }

  if (!userData.telephone || userData.telephone.length < 9) {
    this.submitError.set('Le téléphone doit contenir au moins 9 chiffres.');
    this.isSaving.set(false);
    return;
  }

  if (!userData.email) {
    this.submitError.set("L'email est requis.");
    this.isSaving.set(false);
    return;
  }

  this.usersService
    .addUser(userData)
    .pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isSaving.set(false)),
    )
    .subscribe({
      next: (newUser) => {
        this.loadData();
        this.loadStats();
        this.closeModal();
        this.showSuccessModalWithMessage(
          `L'utilisateur "${newUser.prenom} ${newUser.nom}" a été ajouté avec succès.`,
        );
      },
      error: (error) => this.handleApiError(error),
    });
}

private updateUser(formData: any): void {
  const userId = this.selectedUser().id;
  const currentUser = this.selectedUser();

  const telephoneClean = (formData.telephone || '')
    .toString()
    .replace(/\s/g, '');

  const entitesArray = this.selectedEntites().map((id) => Number(id));

  const payload: any = {
    nom: formData.nom?.trim(),
    prenom: formData.prenom?.trim(),
    username: formData.username?.trim(),
    email: formData.email?.trim(),
    telephone: telephoneClean,
    profil: formData.profil,
    statut: formData.statut,
    // ✅ TOUJOURS envoyer "entites"
    entites: entitesArray,
  };

  // Mot de passe (optionnel)
  if (formData.password && formData.password.trim() !== '') {
    payload.password = formData.password;
    payload.password_confirmation = formData.password_confirmation;
  }

  console.log('📤 [updateUser] Payload:', JSON.stringify(payload, null, 2));

  // ✅ Vérifications
  if (!payload.entites || payload.entites.length === 0) {
    this.submitError.set('Veuillez sélectionner au moins une entité.');
    this.isSaving.set(false);
    return;
  }

  this.usersService
    .updateUser(userId, payload)
    .pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isSaving.set(false)),
    )
    .subscribe({
      next: (updatedUser) => {
        this.loadData();
        this.loadStats();
        this.closeModal();
        this.showSuccessModalWithMessage(
          `L'utilisateur "${updatedUser.prenom} ${updatedUser.nom}" a été modifié avec succès.`,
        );
      },
      error: (error) => this.handleApiError(error),
    });
}

  private markFormAsTouched(): void {
    Object.keys(this.userForm.controls).forEach((key) => {
      this.userForm.get(key)?.markAsTouched();
    });

    if (this.userForm.errors?.['passwordMismatch']) {
      this.userForm.get('password_confirmation')?.setErrors({ mismatch: true });
    }
  }

  private handleApiError(error: any): void {
  console.error('❌ [handleApiError] Erreur:', {
    status: error.status,
    errors: error.error?.errors,
    message: error.error?.message,
  });

  if (error.status === 422 && error.error?.errors) {
    const errors = error.error.errors;

    // ✅ Mapper les erreurs sur les controls
    Object.keys(errors).forEach((key) => {
      // Mapper "entites" → "entite_ids"
      const controlName = key === 'entites' ? 'entite_ids' : key;
      const control = this.userForm.get(controlName);
      if (control) {
        control.setErrors({ apiError: errors[key][0] });
        control.markAsTouched();
      }
    });

    // ✅ Afficher le message global
    const firstError = Object.values(errors)[0];
    const errorMessage = Array.isArray(firstError) ? firstError[0] : String(firstError);
    this.submitError.set(errorMessage);

  } else if (error.error?.message) {
    this.submitError.set(error.error.message);
  } else {
    this.submitError.set("Erreur lors de l'opération");
  }
}

  // ===== SUPPRESSION =====
  deleteUser(): void {
  if (!this.selectedUser()) return;

  this.usersService
    .deleteUser(this.selectedUser().id)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: () => {
        this.loadData();
        this.loadStats();
        this.closeDeleteModal();
        this.showSuccessModalWithMessage(
          `L'utilisateur "${this.selectedUser()?.prenom} ${this.selectedUser()?.nom}" a été supprimé avec succès.`,
        );
      },
      error: (error) => {
        console.error('❌ Erreur suppression:', error);
        this.showErrorMessage(error.error?.message || 'Erreur lors de la suppression');
      },
    });
}




  // ===== CHANGEMENT STATUT =====
  openStatusConfirmModal(user: any): void {
    this.selectedUser.set(user);
    this.isStatusConfirmModalOpen.set(true);
  }

  closeStatusConfirmModal(): void {
    this.isStatusConfirmModalOpen.set(false);
  }

  getStatusConfirmMessage(): string {
    const user = this.selectedUser();
    if (!user) return '';
    const action = user.statut === 'actif' ? 'désactiver' : 'activer';
    return `Êtes-vous sûr de vouloir ${action} l'utilisateur ${user.prenom} ${user.nom} ?`;
  }

  confirmStatusChange(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.closeStatusConfirmModal();
    this.toggleStatus(user);
  }

  toggleStatus(user: any): void {
    if (user.profil === 'superadmin' && user.statut === 'actif') {
      this.showErrorMessage('Impossible de désactiver un superadmin.');
      return;
    }

    this.isSaving.set(true);

    const action$ =
      user.statut === 'actif'
        ? this.usersService.desactiverUtilisateur(user.id)
        : this.usersService.activerUtilisateur(user.id);

    action$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.loadData();
          this.loadStats();
          const actionMessage = user.statut === 'actif' ? 'désactivé' : 'activé';
          this.showSuccessModalWithMessage(
            `L'utilisateur "${user.prenom} ${user.nom}" a été ${actionMessage} avec succès.`,
          );
        },
        error: (error) => {
          console.error('❌ Erreur changement statut:', error);
          const message =
            error.status === 403 && error.error?.message
              ? error.error.message
              : error.error?.message || 'Erreur lors du changement de statut';
          this.showErrorMessage(message);
        },
      });
  }

  // ===== MESSAGES =====
  showSuccessModalWithMessage(message: string): void {
    this.successMessage.set(message);
    this.showSuccessModal.set(true);
    setTimeout(() => this.closeSuccessModal(), this.SUCCESS_MODAL_DURATION);
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
    this.successMessage.set('');
  }

  private showSuccessMessage(message: string): void {
    alert('✅ ' + message);
  }

  private showErrorMessage(message: string): void {
    alert('❌ ' + message);
  }

  // ===== UTILITAIRES =====
  getInitials(user: any): string {
    if (!user) return '';
    return `${(user.prenom || '')[0] || ''}${(user.nom || '')[0] || ''}`.toUpperCase();
  }

  getAvatarUrl(user: any): string {
    if (!user) return '';
    return `https://ui-avatars.com/api/?name=${user.prenom || ''}+${user.nom || ''}&background=0066b3&color=fff&size=128`;
  }

  formatDate(date: string): string {
    if (!date) return 'Jamais';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatShortDate(date: string): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  getTimeSince(date: string): string {
    if (!date) return 'Jamais';
    try {
      const now = new Date();
      const past = new Date(date);
      if (isNaN(past.getTime())) return 'Date invalide';

      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "À l'instant";
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      if (diffHours < 24) return `Il y a ${diffHours} h`;
      if (diffDays < 30) return `Il y a ${diffDays} j`;
      return this.formatShortDate(date);
    } catch {
      return 'Erreur date';
    }
  }

  getStatutClass(statut: string): string {
    const classes: Record<string, string> = {
      actif: 'statut-actif',
      inactif: 'statut-inactif',
      suspendu: 'statut-suspendu',
    };
    return classes[statut] || '';
  }

  getStatutIcon(statut: string): string {
    const icons: Record<string, string> = {
      actif: '✅',
      inactif: '⏸️',
      suspendu: '⛔',
    };
    return icons[statut] || '';
  }

  getProfilClass(profil: string): string {
  const classes: Record<string, string> = {
    superadmin: 'profil-superadmin',
    backoffice: 'profil-backoffice',
    selfservice: 'profil-selfservice',
    dlgas: 'profil-dlgas',
    consultation: 'profil-dlgas',
    adminselfservice: 'profil-admin_selfservice',
    adminbackoffice: 'profil-admin_backoffice',
    admindlgas: 'profil-admin_dlgas',
  };
  return classes[profil] || 'profil-utilisateur';
}

  getProfilDisplayName(profil: string): string {
  if (!profil) return 'Non défini';

  const profilMap: Record<string, string> = {
    // Profils principaux
    superadmin: 'Super Admin',
    backoffice: 'Backoffice',
    selfservice: 'Self Service',
    dlgas: 'Sous-traitant / DLGAS',
    consultation: 'Sous-traitant / DLGAS',

    // Profils admin
    admin_selfservice: 'Admin Self Service',
    admin_backoffice: 'Admin Backoffice',
    admin_dlgas: 'Admin DLGAS',
  };

  return profilMap[profil.toLowerCase()] || profil;
}

  getEntiteDetails(entite: any): string {
    if (!entite) return 'Non défini';
    return `${entite.nom} (ID: ${entite.id})`;
  }

  // ===== ACTIONS =====
  exportData(format: 'csv' | 'pdf' | 'excel' | 'word'): void {
    try {
      const dataToExport = this.users();

      if (dataToExport.length === 0) {
        this.showErrorMessage('Aucune donnée à exporter');
        return;
      }

      switch (format) {
        case 'excel':
          this.usersService.exportToExcel(dataToExport, 'utilisateurs');
          break;
        case 'pdf':
          this.usersService.exportToPDF(dataToExport, 'utilisateurs');
          break;
        case 'word':
          this.usersService.exportToWord(dataToExport, 'utilisateurs');
          break;
        case 'csv':
          this.exportToExcel(dataToExport);
          break;
      }

      this.showSuccessMessage(`Export ${format.toUpperCase()} réussi`);
    } catch (error) {
      console.error('❌ Erreur export:', error);
      this.showErrorMessage("Erreur lors de l'export");
    }
  }

  async exportToExcel(users: any[], fileName: string = 'utilisateurs'): Promise<void> {
    try {
      const XLSX = await import('xlsx');
      const { saveAs } = await import('file-saver');

      const dataToExport = users.map((user) => ({
        ID: user.id,
        Prénom: user.prenom,
        Nom: user.nom,
        Email: user.email,
        Profil: user.profil,
        Statut: user.statut,
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Utilisateurs');

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const data = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      saveAs(data, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      console.error('❌ Erreur export Excel:', error);
      throw error;
    }
  }

  toggleExportMenu(): void {
    this.showExportMenu.update((value) => !value);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown')) {
      this.showExportMenu.set(false);
    }
  }

  printPage(): void {
    window.print();
  }

  refreshData(): void {
    this.isLoading.set(true);
    setTimeout(() => this.loadData(), 500);


  }

  // users.ts - Ajouter ces méthodes

// Computed pour les entités formatées (avec indentation)
entitesFormatees = computed(() => {
  const entites = this.entites();
  return [...entites].sort((a, b) => {
    if (a.niveau !== b.niveau) return (a.niveau || 0) - (b.niveau || 0);
    return (a.nom || '').localeCompare(b.nom || '');
  });
});

// Computed pour les entités sélectionnées

selectedEntitesList = computed(() => {
  const selectedIds = this.selectedEntites();
  return this.entites().filter((e) => selectedIds.includes(e.id));
});

// Obtenir l'affichage d'une entité
getEntiteDisplayName(entite: any): string {
  if (!entite) return '';
  const indent = '—'.repeat(entite.niveau || 0);
  const icon = this.getEntiteIcon(entite.niveau);
  return `${indent}${indent ? ' ' : ''}${icon} ${entite.nom}`;
}

// Retirer une entité de la sélection
removeEntite(entiteId: number): void {
  const id = Number(entiteId);
  this.selectedEntites.update((list) => list.filter((x) => x !== id));
  this.userForm.patchValue({ entite_ids: this.selectedEntites() });
}

// Vérifier si une entité est sélectionnée
isEntiteSelected(entiteId: number): boolean {
  return this.selectedEntites().includes(Number(entiteId));
}

// Gérer le changement de case à cocher
onEntiteCheckboxChange(event: any, entiteId: number): void {
  const id = Number(entiteId);

  if (event.target.checked) {
    this.selectedEntites.update((list) => {
      if (!list.includes(id)) {
        return [...list, id];
      }
      return list;
    });
  } else {
    this.selectedEntites.update((list) => list.filter((x) => x !== id));
  }

  // ✅ Synchroniser le formControl
  this.userForm.patchValue({ entite_ids: this.selectedEntites() });

  console.log('📌 [onEntiteCheckboxChange] selectedEntites:', this.selectedEntites());
}

// Sélectionner toutes les entités
selectAllEntites(): void {
  const allIds = this.entites().map((e) => Number(e.id));
  this.selectedEntites.set(allIds);
  this.userForm.patchValue({ entite_ids: allIds });

  console.log('📌 [selectAllEntites] Toutes les entités:', allIds);
}

// Désélectionner toutes les entités
deselectAllEntites(): void {
  this.selectedEntites.set([]);
  this.userForm.patchValue({ entite_ids: [] });

  console.log('📌 [deselectAllEntites] Désélectionné');
}





}
