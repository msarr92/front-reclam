import {
  Component,
  OnInit,
  signal,
  computed,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TicketService } from '../../../services/ticket-service';
import { AuthService } from '../../../services/auth-services';
import { PusherService } from './pushers/pusher';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-ajout-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './ajout-ticket.html',
  styleUrls: ['./ajout-ticket.css'],
})
export class AjoutTicket implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  private readonly enableDebug = environment.enableDebug;

  // ===== SIGNALS =====
  ticketForm: FormGroup;
  isSubmitting = signal<boolean>(false);
  submitError = signal<string | null>(null);

  users = signal<any[]>([]);
  elements = signal<any[]>([]);
  comments = signal<any[]>([]);

  showSuccessModal = signal<boolean>(false);
  successMessage = signal<string>('');
  successTicketId = signal<number | null>(null);

  showInfoModal = signal<boolean>(false);
  infoModalMessage = signal<string>('');
  infoModalTitle = signal<string>('');
  infoModalIcon = signal<string>('');
  infoModalColor = signal<string>('#0066b3');

  currentUser = signal<any>(null);
  currentUserProfil = signal<string>('');
  currentUserId = signal<number>(0);

  connectedUserEntite = signal<any>(null);
  connectedUserEntiteFullPath = signal<string>('');

  isEditMode = signal<boolean>(false);
  ticketId = signal<number | null>(null);
  isLoading = signal<boolean>(false);

  newComment = signal<string>('');

  isBackoffice = computed(() => this.currentUserProfil() === 'backoffice');
  isSuperAdmin = computed(() => this.currentUserProfil() === 'superadmin');
  isSuperAdminUser = computed(() => this.currentUserProfil() === 'superadmin');
  isSelfService = computed(() => this.currentUserProfil() === 'selfservice');

  selectedFiles = signal<any[]>([]);
  isUploading = signal<boolean>(false);

  rejectReason = signal<string>('');
  respondingToSolution = signal<any | null>(null);
  showRejectForComment = signal<number | null>(null);

  ticketStatut = signal<string>('');

  dlgasOptions = signal<any[]>([]);
  isLoadingDlgas = signal<boolean>(false);

  // ===== ENTITÉS =====
  sousEntites = signal<any[]>([]);
  entitePrincipale = signal<any>(null);
  isLoadingSousEntites = signal<boolean>(false);
  selectedSousEntiteId = signal<number | null>(null);

  entitesListe = signal<any[]>([]);
  entitesArbre = signal<any[]>([]);
  isLoadingEntites = signal<boolean>(false);

  // ===== SUPERADMIN =====
  readonly toutesLesEntites = signal<any[]>([]);
  readonly entiteSelectionnee = signal<any>(null);
  readonly sousEntitesDeEntiteSelectionnee = signal<any[]>([]);
  readonly isLoadingSousEntitesSelectionnee = signal<boolean>(false);

  // ===== ENTITÉ ACTIVE (sidebar) =====
  readonly entiteActive = signal<any>(null);

  // ============================================================
  // ✅ FILTRE DES ENTITÉS PARENTES POUR SUPERADMIN
  // ============================================================
  entitesOptionsSuperAdmin = computed(() => {
    const toutes = this.toutesLesEntites();

    console.log('🔍 [entitesOptionsSuperAdmin] Analyse des entités:');
    toutes.forEach((e: any) => {
      console.log(`  #${e.id} "${e.nom}" | parent_id=${e.entite_principale_id} | niveau=${e.niveau}`);
    });

    // ✅ Récupérer les entités de niveau 1 (enfants directs de la racine ONAS)
    const niveau1 = toutes.filter((e: any) => Number(e.niveau) === 1);

    if (niveau1.length > 0) {
      console.log(`✅ [entitesOptionsSuperAdmin] ${niveau1.length} entité(s) de niveau 1:`,
        niveau1.map((e: any) => e.nom));

      return [...niveau1]
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
        .map((entite) => ({
          ...entite,
          displayNom: `🏢 ${entite.nom}`,
        }));
    }

    // Fallback : si aucune niveau 1, prendre les racines
    const racines = toutes.filter((e: any) => {
      const parentId = e.entite_principale_id;
      return parentId === null || parentId === undefined || parentId === 0;
    });

    console.log(`⚠️ [entitesOptionsSuperAdmin] Fallback racines:`,
      racines.map((e: any) => e.nom));

    return [...racines]
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
      .map((entite) => ({
        ...entite,
        displayNom: `🏢 ${entite.nom}`,
      }));
  });

  sousEntitesAffichees = computed(() => {
    if (this.isSuperAdminUser()) {
      return this.sousEntitesDeEntiteSelectionnee();
    }
    return this.sousEntites();
  });

  messageTypes = [
    { value: 'solution', label: 'Solution du ticket', color: '#2ecc71' },
    { value: 'demande_suivi', label: 'Demander une validation', color: '#f39c12' },
    { value: 'autre', label: 'Ajouter un document', color: '#95a5a6' },
  ];

  selectedMessageType = signal<string>('information');

  allUsers = signal<any[]>([]);
  isLoadingUsers = signal<boolean>(false);

  types = [
    { value: 'declaration', label: 'Déclaration' },
    { value: 'reclamation', label: 'Réclamation' },
  ];

  categories = [
    { value: 'technique', label: 'Technique' },
    { value: 'fonctionnel', label: 'Fonctionnel' },
    { value: 'materiel', label: 'Matériel' },
    { value: 'logiciel', label: 'Logiciel' },
    { value: 'reseau', label: 'Réseau' },
    { value: 'securite', label: 'Sécurité' },
    { value: 'autre', label: 'Autre' },
  ];

  urgences = [
    { value: 'basse', label: 'Basse' },
    { value: 'moyenne', label: 'Moyenne' },
    { value: 'haute', label: 'Haute' },
    { value: 'critique', label: 'Critique' },
  ];

  sources = [
    { value: 'telephone', label: 'Téléphone' },
    { value: 'email', label: 'Email' },
    { value: 'portail', label: 'Portail web' },
    { value: 'face_a_face', label: 'Face à face' },
    { value: 'regie', label: 'Régie' },
    { value: 'direct', label: 'Direct' },
    { value: 'autre', label: 'Autre' },
  ];

  constructor(
    private fb: FormBuilder,
    private ticketsService: TicketService,
    private router: Router,
    private authService: AuthService,
    private route: ActivatedRoute,
    private pusherService: PusherService,
  ) {
    this.ticketForm = this.createForm();
  }

  isTicketClosed = computed(() => this.ticketStatut() === 'clos');
  hasComments = computed(() => this.comments().length > 0);
  canSelfServiceEdit = computed(() => {
    if (!this.isSelfService()) return true;
    return !this.hasComments();
  });

  dlgasSelectOptions = computed(() => {
    const options = this.dlgasOptions();
    return Array.isArray(options) ? options : [];
  });

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadCurrentUser();
    this.loadUserEntite();
    this.loadDlgasOptions();
    this.loadInitialData();

    setTimeout(() => {
      this.loadSousEntites();
    }, 100);

    window.addEventListener('entityChanged', this.onEntityChanged.bind(this));

    this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.isEditMode.set(true);
        this.ticketId.set(parseInt(id));
        this.loadTicketData(parseInt(id));
      } else {
        this.isEditMode.set(false);
        this.isLoading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('entityChanged', this.onEntityChanged.bind(this));

    if (this.ticketId()) {
      this.pusherService.unsubscribeFromTicket(this.ticketId()!);
    }
  }

  private onEntityChanged(event: any): void {
    const newEntity = event.detail;

    if (this.isEditMode()) {
      return;
    }

    if (newEntity?.id) {
      this.connectedUserEntite.set(newEntity);
      this.connectedUserEntiteFullPath.set(
        newEntity.fullPath || newEntity.chemin_complet || newEntity.nom || ''
      );
      this.entiteActive.set(newEntity);
      this.entitePrincipale.set(newEntity);

      // ✅ Réinitialiser la sous-entité sélectionnée
      this.ticketForm.patchValue({
        entite_id: newEntity.id,
        sous_entite_id: null,
        element_id: null,
      });

      // ✅ Passer la nouvelle entité pour charger SES sous-entités
      this.loadSousEntites(newEntity);
    }
  }

  private loadCurrentUser(): void {
    const user = this.authService.getCurrentUser()();
    if (user) {
      this.currentUser.set(user);
      this.currentUserProfil.set(user.profil);
      this.currentUserId.set(user.id);
      console.log('✅ [loadCurrentUser] Profil:', user.profil);
    }
  }

  private loadUserEntite(): void {
    if (this.isSuperAdminUser()) {
      console.log('👑 [loadUserEntite] SuperAdmin - pas d\'entité par défaut');
      return;
    }

    let entite = this.authService.getCurrentEntity();

    if (!entite) {
      entite = this.authService.getConnectedUserEntite();
    }

    if (entite) {
      const entiteFullPath = entite.fullPath || entite.chemin_complet || entite.nom || '';

      this.connectedUserEntite.set(entite);
      this.connectedUserEntiteFullPath.set(entiteFullPath);
      this.entiteActive.set(entite);
      this.entitePrincipale.set(entite);

      this.ticketForm.patchValue({ entite_id: entite.id });
      console.log('✅ [loadUserEntite] Entité:', entite.nom);
    }
  }

  private createForm(): FormGroup {
    return this.fb.group({
      type: ['declaration', Validators.required],
      categorie: ['technique', Validators.required],
      urgence: ['moyenne', Validators.required],
      source_demande: ['portail', Validators.required],
      prenom: ['', Validators.required],
      nom: ['', Validators.required],
      telephone: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      email: ['', [Validators.email]],
      adresse: ['', Validators.required],
      detail: ['', Validators.required],
      sla_ttr: [3, [Validators.required, Validators.min(1), Validators.max(720)]],
      sous_entite_id: [null],
      element_id: [null],
      observateur_id: [null],
      dlgas_id: [null],
      user_id: [this.authService.getCurrentUserId(), Validators.required],
      entite_id: [null, Validators.required],
      statut: ['en_attente', Validators.required],
    });
  }

  // ============================================================
  // ✅ CHARGEMENT DES ENTITÉS
  // ✅ MODIFIÉ : accepte une entité en paramètre pour recharger
  //    les bonnes sous-entités quand on change d'entité (sidebar)
  // ============================================================
  loadSousEntites(entiteActive?: any): void {
    this.isLoadingSousEntites.set(true);

    if (this.isSuperAdminUser()) {
      console.log('👑 [loadSousEntites] SuperAdmin - chargement de TOUTES les entités');

      this.ticketsService.getToutesLesEntites().subscribe({
        next: (entites) => {
          this.toutesLesEntites.set(entites);
          this.entitesListe.set(entites);

          const parents = entites.filter((e: any) =>
            e.entite_principale_id === null || e.entite_principale_id === undefined
          );
          const enfants = entites.filter((e: any) =>
            e.entite_principale_id !== null && e.entite_principale_id !== undefined
          );

          console.log(`📊 [loadSousEntites] ${entites.length} entités (${parents.length} parents, ${enfants.length} enfants)`);

          this.entitePrincipale.set(null);
          this.entiteActive.set(null);
          this.sousEntites.set([]);
          this.sousEntitesDeEntiteSelectionnee.set([]);
          this.entiteSelectionnee.set(null);

          this.isLoadingSousEntites.set(false);
        },
        error: (error) => {
          console.error('❌ [loadSousEntites] Erreur:', error);
          this.toutesLesEntites.set([]);
          this.isLoadingSousEntites.set(false);
        },
      });
      return;
    }

    // ✅ CAS UTILISATEUR NORMAL : utiliser l'entité passée en paramètre
    //    sinon celle du service auth
    const activeEntity = entiteActive || this.authService.getCurrentEntity();

    // ✅ Si on a une entité active, charger ses sous-entités directement
    if (activeEntity?.id) {
      this.loadSousEntitesParEntite(activeEntity);
      return;
    }

    // Fallback : charger via getMesSousEntites()
    this.ticketsService.getMesSousEntites().subscribe({
      next: (data) => {
        if (data) {
          const entitePourAffichage = data.entite_utilisateur;

          if (entitePourAffichage) {
            this.connectedUserEntite.set(entitePourAffichage);
            this.connectedUserEntiteFullPath.set(
              entitePourAffichage.fullPath || entitePourAffichage.chemin_complet || entitePourAffichage.nom || ''
            );
            this.entiteActive.set(entitePourAffichage);
            this.entitePrincipale.set(entitePourAffichage);

            this.ticketForm.patchValue({ entite_id: entitePourAffichage.id });
          }

          this.sousEntites.set(data.sous_entites || []);
        }
        this.isLoadingSousEntites.set(false);
      },
      error: (error) => {
        console.error('❌ [loadSousEntites] Erreur:', error);
        this.sousEntites.set([]);
        this.isLoadingSousEntites.set(false);
      },
    });
  }

  // ✅ NOUVELLE MÉTHODE : charger les sous-entités d'une entité donnée
  private loadSousEntitesParEntite(entite: any): void {
    console.log(`📤 [loadSousEntitesParEntite] Chargement des sous-entités pour #${entite.id} "${entite.nom}"`);

    this.ticketsService.getSousEntitesParEntite(entite.id).subscribe({
      next: (response) => {
        const sousEntites = response?.sous_entites || [];
        this.sousEntites.set(sousEntites);

        // Mettre à jour l'entité affichée
        this.connectedUserEntite.set(entite);
        this.connectedUserEntiteFullPath.set(
          entite.fullPath || entite.chemin_complet || entite.nom || ''
        );
        this.entiteActive.set(entite);
        this.entitePrincipale.set(entite);

        this.ticketForm.patchValue({
          entite_id: entite.id,
          sous_entite_id: null, // ✅ Réinitialiser la sous-entité sélectionnée
        });

        console.log(`✅ [loadSousEntitesParEntite] ${sousEntites.length} sous-entités pour "${entite.nom}"`);
        this.isLoadingSousEntites.set(false);
      },
      error: (error) => {
        console.error('❌ [loadSousEntitesParEntite] Erreur:', error);
        this.sousEntites.set([]);
        this.isLoadingSousEntites.set(false);
      },
    });
  }

  loadEntites(): void {
    this.isLoadingEntites.set(true);

    this.ticketsService.getEntitesListe().subscribe({
      next: (entites) => {
        this.entitesListe.set(entites);
        this.isLoadingEntites.set(false);
      },
      error: () => {
        this.entitesListe.set([]);
        this.isLoadingEntites.set(false);
      },
    });
  }

  // ============================================================
  // ✅ SÉLECTION D'UNE ENTITÉ PARENTE PAR LE SUPERADMIN
  // ============================================================
  onEntiteSuperAdminChange(event: any): void {
    let entiteId: number | null = null;

    if (event?.target && event.target.value !== null && event.target.value !== '') {
      entiteId = Number(event.target.value);
    } else if (event !== null && event !== undefined && event !== '') {
      entiteId = Number(event);
    }

    console.log('🔍 [onEntiteSuperAdminChange] ID sélectionné:', entiteId, '| type:', typeof entiteId);

    if (!entiteId || isNaN(entiteId)) {
      this.entiteSelectionnee.set(null);
      this.sousEntitesDeEntiteSelectionnee.set([]);
      this.ticketForm.patchValue({
        entite_id: null,
        sous_entite_id: null,
        element_id: null,
      });
      return;
    }

    const entite = this.toutesLesEntites().find((e) => Number(e.id) === entiteId);

    if (!entite) {
      console.warn('⚠️ [onEntiteSuperAdminChange] Entité non trouvée pour ID:', entiteId);
      console.warn('📋 IDs disponibles:', this.toutesLesEntites().map((e: any) => e.id));
      return;
    }

    this.entiteSelectionnee.set(entite);
    console.log('🏢 [onEntiteSuperAdminChange] Entité sélectionnée:', entite.nom, '| ID:', entite.id);

    this.ticketForm.patchValue({
      entite_id: entiteId,
      sous_entite_id: null,
      element_id: null,
    });

    this.loadSousEntitesDeEntite(entiteId);
  }

  loadSousEntitesDeEntite(entiteId: number): void {
    this.isLoadingSousEntitesSelectionnee.set(true);

    console.log(`📤 [loadSousEntitesDeEntite] Chargement pour entité #${entiteId}`);

    this.ticketsService.getSousEntitesParEntite(entiteId).subscribe({
      next: (response) => {
        const sousEntites = response?.sous_entites || [];
        this.sousEntitesDeEntiteSelectionnee.set(sousEntites);
        console.log(`📂 [loadSousEntitesDeEntite] ${sousEntites.length} sous-entités pour "${response?.entite_principale?.nom}"`);
        this.isLoadingSousEntitesSelectionnee.set(false);
      },
      error: (error) => {
        console.error('❌ [loadSousEntitesDeEntite] Erreur:', error);
        this.sousEntitesDeEntiteSelectionnee.set([]);
        this.isLoadingSousEntitesSelectionnee.set(false);
      },
    });
  }

  getEntiteDisplayName(entite: any): string {
    if (!entite) return '';
    const niveau = Number(entite.niveau ?? 0);
    const indent = '—'.repeat(niveau);
    const icon = this.getEntiteIcon(niveau);
    return `${indent}${indent ? ' ' : ''}${icon} ${entite.nom}`;
  }

  getEntiteIcon(niveau: number): string {
    if (niveau === 0) return '🏢';
    if (niveau === 1) return '📁';
    return '📂';
  }

  onSousEntiteSelect(event: any): void {
    const sousEntiteId = event.target.value;
    this.selectedSousEntiteId.set(sousEntiteId ? parseInt(sousEntiteId) : null);
  }

  // ============================================================
  // ✅ RESTRICTIONS DES CHAMPS
  // ============================================================
  applyFieldRestrictions(): void {
    if (this.isEditMode()) {
      if (this.isSelfService() && !this.canSelfServiceEdit()) {
        Object.keys(this.ticketForm.controls).forEach((key) => {
          this.ticketForm.get(key)?.disable();
        });
        return;
      }

      if (this.isBackoffice()) {
        const fieldsToDisable = [
          'type', 'categorie', 'urgence', 'source_demande',
          'prenom', 'nom', 'email', 'telephone', 'adresse', 'detail',
          'observateur_id', 'user_id', 'entite_id', 'sla_ttr',
        ];
        fieldsToDisable.forEach((field) => {
          this.ticketForm.get(field)?.disable();
        });
        this.ticketForm.get('statut')?.enable();
        this.ticketForm.get('dlgas_id')?.enable();
      } else if (this.isSuperAdmin()) {
        Object.keys(this.ticketForm.controls).forEach((key) => {
          this.ticketForm.get(key)?.enable();
        });
      } else if (this.isSelfService()) {
        Object.keys(this.ticketForm.controls).forEach((key) => {
          this.ticketForm.get(key)?.disable();
        });
        const allowedFields = [
          'prenom', 'nom', 'email', 'adresse', 'detail',
          'source_demande', 'urgence', 'categorie', 'type',
        ];
        allowedFields.forEach((field) => {
          if (this.ticketForm.get(field)) {
            this.ticketForm.get(field)?.enable();
          }
        });
      } else {
        Object.keys(this.ticketForm.controls).forEach((key) => {
          this.ticketForm.get(key)?.disable();
        });
      }
    } else {
      Object.keys(this.ticketForm.controls).forEach((key) => {
        this.ticketForm.get(key)?.enable();
      });
    }
  }

  // ============================================================
  // CHARGEMENT TICKET
  // ============================================================
  loadTicketData(id: number): void {
    this.isLoading.set(true);

    this.ticketsService.getTicketById(id).subscribe({
      next: (ticket) => {
        this.ticketStatut.set(ticket.statut);

        const formData = {
          type: ticket.type || '',
          categorie: ticket.categorie || '',
          urgence: ticket.urgence || '',
          source_demande: ticket.source_demande || '',
          prenom: ticket.prenom || '',
          nom: ticket.nom || '',
          email: ticket.email || '',
          telephone: ticket.telephone || '',
          adresse: ticket.adresse || '',
          detail: ticket.detail || '',
          sous_entite_id: ticket.sous_entite_id || null,
          element_id: ticket.element_id || null,
          observateur_id: ticket.observateur_id || null,
          dlgas_id: ticket.dlgas_id !== undefined && ticket.dlgas_id !== null
            ? typeof ticket.dlgas_id === 'object' ? ticket.dlgas_id.id : ticket.dlgas_id
            : null,
          user_id: ticket.user_id,
          entite_id: ticket.entite_id,
          statut: ticket.statut || 'en_attente',
        };

        this.ticketForm.patchValue(formData);

        if (this.isSuperAdminUser() && ticket.entite_id) {
          const entite = this.toutesLesEntites().find((e) => e.id === ticket.entite_id);
          if (entite) {
            this.entiteSelectionnee.set(entite);
            this.loadSousEntitesDeEntite(ticket.entite_id);
          }
        }

        this.loadMessages(id);
        this.initPusherListening(id);

        setTimeout(() => {
          this.applyFieldRestrictions();
          this.isLoading.set(false);
        }, 500);
      },
      error: () => {
        this.isLoading.set(false);
        this.submitError.set('Impossible de charger le ticket.');
        setTimeout(() => this.router.navigate(['/tickets']), 3000);
      },
    });
  }

  loadMessages(ticketId: number): void {
    this.ticketsService.getMessages(ticketId).subscribe({
      next: (messages) => {
        const messagesAvecIndicateur = messages.map((msg: any) => ({
          id: msg.id,
          message: msg.message,
          type: msg.type || '',
          user_id: msg.user_id,
          user_nom: msg.user_nom,
          created_at: msg.created_at,
          is_current_user: msg.user_id === this.currentUserId(),
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

        this.comments.set(messagesAvecIndicateur);
        this.scrollToBottom();
      },
      error: (error) => console.error('❌ Erreur messages:', error),
    });
  }

  initPusherListening(ticketId: number): void {
    this.pusherService.subscribeToTicket(ticketId, (data: any) => {
      if (data.discussion.user_id !== this.currentUserId()) {
        const newMessage = {
          id: data.discussion.id,
          message: data.discussion.message,
          type: data.discussion.type || '',
          user_id: data.discussion.user_id,
          user_nom: data.discussion.utilisateur
            ? `${data.discussion.utilisateur.prenom} ${data.discussion.utilisateur.nom}`
            : 'Inconnu',
          created_at: data.discussion.created_at,
          is_current_user: false,
          attachments: data.discussion.attachments || [],
        };
        this.comments.update((comments) => [...comments, newMessage]);
        this.scrollToBottom();
      }
    });
  }

  loadDlgasOptions(): void {
    this.isLoadingDlgas.set(true);

    this.ticketsService.getDlgas().subscribe({
      next: (dlgas) => {
        if (!Array.isArray(dlgas)) {
          this.dlgasOptions.set([]);
          this.isLoadingDlgas.set(false);
          return;
        }

        const options = dlgas.map((d) => ({
          id: d.id,
          prenom: d.prenom || '',
          nom: d.nom || '',
          displayNom: `${d.prenom || ''} ${d.nom || ''}`.trim() || d.email || `DLGAS #${d.id}`,
          value: d.id,
        }));

        options.sort((a, b) => (a.displayNom || '').localeCompare(b.displayNom || ''));
        this.dlgasOptions.set(options);
        this.isLoadingDlgas.set(false);
      },
      error: () => {
        this.dlgasOptions.set([]);
        this.isLoadingDlgas.set(false);
      },
    });
  }

  loadInitialData(): void {
    this.ticketsService.getElements().subscribe({
      next: (elementsArbre) => {
        const elementsPlats = this.flattenElementsForSelect(elementsArbre);
        this.elements.set(elementsPlats);
      },
      error: (error) => console.error('❌ Erreur éléments:', error),
    });

    this.loadAllUsers();
    this.loadEntites();
  }

  loadAllUsers(): void {
    this.isLoadingUsers.set(true);

    this.ticketsService.getAllUsers().subscribe({
      next: (users) => {
        this.allUsers.set(users);
        const filtered = users.filter((user) => user.profil !== 'consultation');
        const observateurs = filtered.map((user) => ({
          id: user.id,
          prenom: user.prenom || '',
          nom: user.nom || '',
          profil: user.profil || '',
          displayName: `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email || `Utilisateur #${user.id}`,
        }));
        observateurs.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        this.users.set(observateurs);
        this.isLoadingUsers.set(false);
      },
      error: () => this.isLoadingUsers.set(false),
    });
  }

  flattenElementsForSelect(elements: any[], niveau: number = 0, result: any[] = []): any[] {
    for (const element of elements) {
      let icon = niveau === 0 ? '🏢' : niveau === 1 ? '📍' : '📌';
      const indent = '\u00A0'.repeat(niveau * 2);
      result.push({
        id: element.id,
        nom: element.nom,
        displayNom: indent + icon + ' ' + element.nom,
        niveau: niveau,
        parent_id: element.element_principal_id,
      });
      if (element.enfants && element.enfants.length > 0) {
        this.flattenElementsForSelect(element.enfants, niveau + 1, result);
      }
    }
    return result;
  }

  // ============================================================
  // MESSAGES
  // ============================================================
  sendComment(): void {
    if (!this.ticketId()) return;

    if (this.isTicketClosed()) {
      this.showInfoMessage('🔒 Ticket clos', "Impossible d'envoyer un message sur un ticket clos.", '#6c757d', '🔒');
      return;
    }

    if (!this.newComment().trim() && this.selectedFiles().length === 0) return;

    let message = this.newComment();
    const type = this.selectedMessageType();
    const files = this.selectedFiles();

    if (this.respondingToSolution()) {
      message = `@${this.respondingToSolution().user_nom} ${message}`;
    }

    if (files.length > 0) {
      this.sendMessageWithFiles(message, type, files);
    } else {
      this.ticketsService.envoyerMessage(this.ticketId()!, message, type).subscribe({
        next: (newMessage) => {
          this.handleMessageSent(newMessage);
          this.respondingToSolution.set(null);
        },
        error: () => {
          this.showInfoMessage('❌ Erreur', "Erreur lors de l'envoi du message", '#e74c3c', '❌');
        },
      });
    }
  }

  sendMessageWithFiles(message: string, type: string, files: any[]): void {
    if (this.isTicketClosed()) return;

    this.isUploading.set(true);

    const formData = new FormData();
    formData.append('ticket_id', this.ticketId()!.toString());
    formData.append('message', message);
    formData.append('type', type);

    files.forEach((file, index) => {
      formData.append(`files[${index}]`, file);
    });

    this.ticketsService.envoyerMessageAvecFichiers(formData).subscribe({
      next: (newMessage) => {
        this.isUploading.set(false);
        this.handleMessageSent(newMessage);
        this.selectedFiles.set([]);
        this.respondingToSolution.set(null);
      },
      error: () => {
        this.isUploading.set(false);
        this.showInfoMessage('❌ Erreur', "Erreur lors de l'envoi", '#e74c3c', '❌');
      },
    });
  }

  handleMessageSent(newMessage: any): void {
    this.comments.update((comments) => [
      ...comments,
      {
        id: newMessage.id,
        message: newMessage.message,
        type: newMessage.type || this.selectedMessageType(),
        user_id: newMessage.user_id,
        user_nom: newMessage.user_nom || this.getCurrentUser(),
        created_at: newMessage.created_at,
        is_current_user: true,
        attachments: newMessage.attachments || [],
      },
    ]);

    this.newComment.set('');
    this.selectedMessageType.set('information');
    this.scrollToBottom();

    if (this.ticketId()) {
      this.ticketsService.getTicketById(this.ticketId()!).subscribe({
        next: (ticket) => this.ticketStatut.set(ticket.statut),
      });
    }
  }

  canRespondToSolution(comment: any): boolean {
    if (comment.accepted || comment.rejected) return false;
    const ticketCreatorId = this.ticketForm.get('user_id')?.value;
    return this.isBackoffice() || this.isSuperAdmin() || this.currentUserId() === ticketCreatorId;
  }

  acceptSolution(comment: any): void {
    if (this.isTicketClosed()) return;

    this.ticketsService.accepterSolution(comment.id).subscribe({
      next: (response) => {
        this.comments.update((comments) =>
          comments.map((c) => c.id === comment.id ? {
            ...c, accepted: true,
            accepted_at: response.discussion.accepted_at,
            accepted_by: response.discussion.accepted_by,
            accepted_by_name: response.discussion.accepted_by_name,
          } : c)
        );
        if (response.ticket) this.ticketStatut.set(response.ticket.statut);
        this.scrollToBottom();
      },
      error: () => this.showInfoMessage('❌ Erreur', "Erreur acceptation", '#e74c3c', '❌'),
    });
  }

  rejectSolution(comment: any): void {
    if (this.isTicketClosed() || !this.rejectReason().trim()) return;

    this.ticketsService.refuserSolution(comment.id, this.rejectReason()).subscribe({
      next: (response) => {
        this.comments.update((comments) =>
          comments.map((c) => c.id === comment.id ? {
            ...c, rejected: true,
            rejected_at: response.discussion.rejected_at,
            rejected_by: response.discussion.rejected_by,
            rejected_by_name: response.discussion.rejected_by_name,
            rejectionReason: response.discussion.rejection_reason,
          } : c)
        );
        if (response.ticket) this.ticketStatut.set(response.ticket.statut);
        this.showRejectForComment.set(null);
        this.rejectReason.set('');
        this.scrollToBottom();
      },
      error: () => this.showInfoMessage('❌ Erreur', 'Erreur refus', '#e74c3c', '❌'),
    });
  }

  showRejectInput(comment: any): void {
    this.showRejectForComment.set(comment.id);
    this.rejectReason.set('');
  }

  cancelReject(): void {
    this.showRejectForComment.set(null);
    this.rejectReason.set('');
  }

  // ============================================================
  // SAUVEGARDE
  // ============================================================
  onSubmit(): void {
    if (this.ticketForm.invalid) {
        Object.keys(this.ticketForm.controls).forEach((key) => {
            this.ticketForm.get(key)?.markAsTouched();
        });
        return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    const formValue = this.ticketForm.getRawValue();

    let entiteId: number | null = null;

    if (this.isSuperAdminUser()) {
        entiteId = this.entiteSelectionnee()?.id || formValue.entite_id;
    } else {
        // ✅ Priorité : entité active (sidebar) > entité connectée > formValue
        const activeEntity = this.authService.getCurrentEntity();
        const connectedEntite = this.connectedUserEntite();
        entiteId = activeEntity?.id || connectedEntite?.id || formValue.entite_id;
    }

    // ✅ Vérification : on doit avoir une entité
    if (!entiteId) {
        this.isSubmitting.set(false);
        this.submitError.set('Aucune entité sélectionnée. Veuillez choisir une entité.');
        return;
    }

    const cleanedData = {
        ...formValue,
        sous_entite_id: formValue.sous_entite_id ? parseInt(formValue.sous_entite_id.toString()) : null,
        element_id: formValue.element_id ? parseInt(formValue.element_id.toString()) : null,
        observateur_id: formValue.observateur_id ? parseInt(formValue.observateur_id.toString()) : null,
        entite_id: parseInt(entiteId.toString()),
        dlgas_id: formValue.dlgas_id ? parseInt(formValue.dlgas_id.toString()) : null,
    };

    console.log('📤 [onSubmit] Données envoyées:', cleanedData);

    if (this.isEditMode()) {
        this.ticketsService.modifierTicket(this.ticketId()!, cleanedData).subscribe({
            next: (updatedTicket) => {
                this.isSubmitting.set(false);
                this.successTicketId.set(updatedTicket.id);
                this.successMessage.set(`Le ticket #${updatedTicket.id} a été modifié.`);
                this.showSuccessModal.set(true);
            },
            error: (error) => {
                this.isSubmitting.set(false);
                this.handleError(error);
            },
        });
    } else {
        this.ticketsService.ajouterTicket(cleanedData).subscribe({
            next: (newTicket) => {
                this.isSubmitting.set(false);
                this.successTicketId.set(newTicket.id);
                this.successMessage.set(`Le ticket #${newTicket.id} a été créé.`);
                this.showSuccessModal.set(true);
            },
            error: (error) => {
                this.isSubmitting.set(false);
                this.handleError(error);
            },
        });
    }
}

  private handleError(error: any): void {
    console.error(' [handleError] Erreur complète:', error);

    if (error.status === 422 && error.error?.errors) {
        const validationErrors = error.error.errors;
        const firstErrorKey = Object.keys(validationErrors)[0];
        this.submitError.set(`${firstErrorKey}: ${validationErrors[firstErrorKey][0]}`);
    } else if (error.status === 401) {
        this.submitError.set('Session expirée.');
        setTimeout(() => this.router.navigate(['/login']), 2000);
    } else if (error.status === 403) {
        this.submitError.set(error.error?.message || 'Accès refusé.');
    } else if (error.status === 500) {
        // ✅ Afficher le vrai message d'erreur Laravel
        const laravelError = error.error?.error || error.error?.message || 'Erreur serveur';
        this.submitError.set(`Erreur serveur: ${laravelError}`);
    } else {
        this.submitError.set(error.error?.message || "Erreur lors de l'opération");
    }
}

  // ============================================================
  // UTILITAIRES
  // ============================================================
  scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }

  getMessageTypeColor(type: string): string {
    const found = this.messageTypes.find((t) => t.value === type);
    return found?.color || '#3498db';
  }

  getMessagePlaceholder(): string {
    if (!this.isEditMode()) return 'Le chat sera disponible après la création du ticket...';
    if (this.isTicketClosed()) return 'Ticket clos - Envoi désactivé';
    const placeholders: any = {
      solution: 'Décrire la solution...',
      demande_suivi: 'Demander des informations...',
      information: 'Écrire un message...',
      autre: 'Ajouter un document...',
    };
    return placeholders[this.selectedMessageType()] || 'Écrire un message...';
  }

  getCurrentUser(): string {
    const user = this.currentUser();
    return user ? `${user.prenom} ${user.nom}` : 'Utilisateur';
  }

  formatDate(date: string): string {
    if (!date) return '';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  }

  isFieldDisabled(fieldName: string): boolean {
    if (!this.isEditMode()) return false;
    if (this.isSuperAdmin()) return false;
    if (this.isBackoffice()) {
      return fieldName !== 'statut' && fieldName !== 'dlgas_id';
    }
    return true;
  }

  annuler(): void {
    if (this.ticketForm.dirty) {
      if (confirm('Voulez-vous vraiment annuler ?')) {
        this.router.navigate(['/tickets']);
      }
    } else {
      this.router.navigate(['/tickets']);
    }
  }

  closeSuccessModalAndRedirect(): void {
    this.showSuccessModal.set(false);
    this.router.navigate(['/tickets']);
  }

  redirectToTicketDetails(): void {
    const ticketId = this.successTicketId();
    if (ticketId) this.router.navigate(['/tickets', ticketId]);
    else this.router.navigate(['/tickets']);
    this.closeSuccessModalAndRedirect();
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  onFileSelected(event: any): void {
    const files = Array.from(event.target.files);
    const maxSize = 10 * 1024 * 1024;
    const validFiles = files.filter((file: any) => file.size <= maxSize);
    this.selectedFiles.update((current) => [...current, ...validFiles]);
    event.target.value = '';
  }

  removeFile(index: number): void {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
  }

  downloadFile(file: any): void {
    if (file.url) window.open(file.url, '_blank');
  }

  triggerFileInput(): void {
    if (this.fileInput) this.fileInput.nativeElement.click();
  }

  getEditModeMessage(): string {
    if (!this.isEditMode()) return '';
    if (this.isSelfService()) {
      if (this.hasComments()) {
        return '🔒 Ce ticket a des commentaires et ne peut plus être modifié.';
      }
      return "ℹ️ Vous pouvez modifier les informations du demandeur.";
    }
    return '';
  }

  showInfoMessage(title: string, message: string, color: string, icon: string): void {
    this.infoModalTitle.set(title);
    this.infoModalMessage.set(message);
    this.infoModalColor.set(color);
    this.infoModalIcon.set(icon);
    this.showInfoModal.set(true);
    setTimeout(() => this.closeInfoModal(), 3000);
  }

  closeInfoModal(): void {
    this.showInfoModal.set(false);
  }

  setSlaValue(value: number): void {
    this.ticketForm.get('sla_ttr')?.setValue(value);
  }
}
