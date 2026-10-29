// main-layout.ts
import {
  Component,
  HostListener,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
  inject,
  signal,
  effect,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { AuthService } from '../../services/auth-services';
import { TokenService } from '../../services/token-service';
import { NotificationsService } from '../../services/notifications-service';
import { environment } from '../../../environments/environment';

@Pipe({
  name: 'truncate',
  standalone: true,
})
export class TruncatePipe implements PipeTransform {
  transform(value: string, limit: number = 25, trail: string = '...'): string {
    if (!value) return '';
    return value.length > limit ? value.substring(0, limit) + trail : value;
  }
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TruncatePipe],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.css'],
})
export class MainLayout implements OnInit, OnDestroy {
  @ViewChild('profileMenuBtn') profileMenuBtn!: ElementRef;
  @ViewChild('dropdownMenu') dropdownMenu!: ElementRef;
  @ViewChild('searchInput') searchInput!: ElementRef;
  @ViewChild('notificationsBtn') notificationsBtn!: ElementRef;
  @ViewChild('notificationsPanel') notificationsPanel!: ElementRef;

  // ===== INJECTIONS =====
  private notificationsService = inject(NotificationsService);

  // ===== SIGNALS =====
  readonly notifications = this.notificationsService.notifications;
  readonly unreadNotifications = this.notificationsService.unreadCount;

  // ===== SIGNALS LOCAUX =====
  readonly isSidebarCollapsed = signal<boolean>(false);
  readonly isSidebarOpen = signal<boolean>(false);
  readonly isLoggingOut = signal<boolean>(false);
  readonly isProfileMenuOpen = signal<boolean>(false);
  readonly isNotificationsOpen = signal<boolean>(false);
  readonly isSearching = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly searchResults = signal<any[]>([]);

  // ===== SIGNALS POUR L'ENTITÉ =====
  readonly connectedUserEntite = signal<any>(null);
  readonly connectedUserEntiteNom = signal<string>('');
  readonly connectedUserEntiteChemin = signal<string>('');
  readonly connectedUserEntiteHierarchy = signal<any>(null);

  // ===== SIGNALS POUR TOUTES LES ENTITÉS =====
  readonly userEntities = signal<any[]>([]);
  readonly selectedEntity = signal<any>(null);
  readonly showAllEntities = signal<boolean>(false);

  // ===== SIGNALS POUR L'HEURE =====
  readonly currentTime = signal<Date>(new Date());
  private timeSubscription?: Subscription;
  private refreshInterval: any;

  constructor(
    public authService: AuthService,
    private router: Router,
    private tokenService: TokenService,
  ) {
    // Forcer le signal si nécessaire
    const userStr = localStorage.getItem('user');
    if (userStr && !this.authService.getCurrentUser()()) {
      try {
        const user = JSON.parse(userStr);
        (this.authService as any)['currentUserSignal'].set(user);
      } catch (e) {
        console.error('Erreur parsing utilisateur:', e);
      }
    }

    this.loadUserData();
    this.startTimeUpdate();
    this.checkScreenSize();
    this.loadUserEntities();
    this.loadSelectedEntity();

    // Effect pour surveiller les changements de notifications
    effect(() => {
      if (this.enableDebug) {
        console.log(
          `📬 ${this.notifications().length} notifications, ${this.unreadNotifications()} non lues`,
        );
      }
    });
  }

  ngOnInit(): void {
    this.loadUserEntities();
    this.loadConnectedUserEntite();
    this.loadNotifications();

    // Initialiser l'entité active si elle n'existe pas
    const currentEntity = this.authService.getCurrentEntity();
    if (!currentEntity && this.userEntities().length > 0) {
      const mainEntity =
        this.userEntities().find((e: any) => e.is_principal) ||
        this.userEntities()[0];
      if (mainEntity) {
        this.selectedEntity.set(mainEntity);
        this.authService.setCurrentEntity(mainEntity);
        console.log('🎯 Entité active initialisée:', mainEntity.nom);
      }
    }

    this.refreshInterval = setInterval(() => {
      this.loadConnectedUserEntite();
      this.loadUserEntities();
    }, 5000);

    // ✅ DÉMARRER LA SURVEILLANCE UNIQUEMENT SI L'UTILISATEUR EST DÉJÀ AUTHENTIFIÉ
    //    (cas du F5/refresh de page avec un token valide)
    //    Si l'utilisateur vient de se connecter, c'est AuthService.login()
    //    qui l'a déjà démarrée.
    if (this.authService.isAuthenticated()) {
      this.tokenService.startTokenMonitoring();
      console.log('✅ [MainLayout] Surveillance du token vérifiée/démarrée (utilisateur authentifié)');
    } else {
      console.log('ℹ️ [MainLayout] Pas de surveillance token (utilisateur non authentifié)');
    }
  }

  ngOnDestroy(): void {
    if (this.timeSubscription) {
      this.timeSubscription.unsubscribe();
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    // ⚠️ NE PAS arrêter la surveillance ici !
    //    La surveillance doit continuer tant que l'utilisateur est connecté.
    //    Elle sera arrêtée uniquement au logout (via AuthService.logout()).
    // this.tokenService.stopTokenMonitoring();
  }

  // ===== CHARGER LES ENTITÉS =====
  loadUserEntities(): void {
    const currentUser = this.authService.getCurrentUser()();

    console.log('=== CHARGEMENT DES ENTITÉS ===');
    console.log('Utilisateur complet:', currentUser);
    console.log('entites tableau:', currentUser?.entites);
    console.log('entite objet:', currentUser?.entite);
    console.log('entite_nom:', currentUser?.entite_nom);
    console.log('entite_id:', currentUser?.entite_id);

    let entities: any[] = [];

    if (
      currentUser &&
      currentUser.entites &&
      Array.isArray(currentUser.entites) &&
      currentUser.entites.length > 0
    ) {
      entities = currentUser.entites;
      console.log('✅ Entités trouvées dans le tableau:', entities.length);
    } else if (currentUser && currentUser.entite) {
      entities = [
        {
          id: currentUser.entite.id,
          nom: currentUser.entite.nom,
          role: currentUser.profil || 'user',
          is_principal: true,
          fullPath: currentUser.entite.chemin_complet || currentUser.entite.nom,
        },
      ];
      console.log('✅ Entité unique trouvée:', entities[0]);
    } else if (currentUser && currentUser.entite_nom) {
      entities = [
        {
          id: currentUser.entite_id || 1,
          nom: currentUser.entite_nom,
          role: currentUser.profil || 'user',
          is_principal: true,
          fullPath: currentUser.entite_nom,
        },
      ];
      console.log('✅ Entité par nom trouvée:', entities[0]);
    } else {
      const serviceEntities = this.authService.getAllUserEntities();
      if (serviceEntities && serviceEntities.length > 0) {
        entities = serviceEntities;
        console.log('✅ Entités depuis le service:', entities.length);
      }
    }

    this.userEntities.set(entities);

    if (entities.length > 0 && !this.selectedEntity()) {
      const mainEntity =
        entities.find((e: any) => e.is_principal === true) || entities[0];
      this.selectedEntity.set(mainEntity);
      console.log('🎯 Entité sélectionnée:', mainEntity);
    }

    if (entities.length === 0) {
      console.warn('⚠️ Aucune entité trouvée pour cet utilisateur');
      const connectedEntite = this.authService.getConnectedUserEntite();
      if (connectedEntite) {
        console.log('🔄 Fallback vers connectedUserEntite:', connectedEntite);
        this.userEntities.set([
          {
            id: connectedEntite.id,
            nom: connectedEntite.nom,
            role: currentUser?.profil || 'user',
            is_principal: true,
          },
        ]);
      }
    }
  }

  loadSelectedEntity(): void {
    const savedEntity = this.authService.getCurrentEntity();
    if (savedEntity) {
      this.selectedEntity.set(savedEntity);
    }
  }

  // ===== SIDEBAR MOBILE =====
  toggleSidebarMobile(): void {
    this.isSidebarOpen.update((value) => !value);
  }

  closeSidebarMobile(): void {
    this.isSidebarOpen.set(false);
  }

  // ===== CHANGER D'ENTITÉ =====
  switchEntity(entity: any): void {
    if (!entity) return;

    this.selectedEntity.set(entity);
    this.authService.setCurrentEntity(entity);

    window.dispatchEvent(new CustomEvent('entityChanged', { detail: entity }));
    console.log('🔔 Événement entityChanged émis pour:', entity.nom);

    const currentUrl = this.router.url.split('?')[0];
    this.router.navigate([currentUrl], {
      queryParams: { entityId: entity.id },
      queryParamsHandling: 'merge',
    });

    this.showAllEntities.set(false);
  }

  getEntityFullPath(entity: any): string {
    if (!entity) return '';
    if (entity.fullPath) return entity.fullPath;
    if (entity.parent) {
      return `${this.getEntityFullPath(entity.parent)} / ${entity.nom}`;
    }
    return entity.nom || '';
  }

  // ===== NOTIFICATIONS =====
  private loadNotifications(): void {
    this.notificationsService.loadNotifications();
  }

  toggleNotifications(): void {
    this.isNotificationsOpen.update((value) => !value);
  }

  closeNotifications(): void {
    this.isNotificationsOpen.set(false);
  }

  markNotificationAsRead(notification: any, event: Event): void {
    event.stopPropagation();
    this.notificationsService.markAsRead(notification.id).subscribe({
      error: (error) => console.error('Erreur:', error),
    });
  }

  markAllNotificationsAsRead(): void {
    this.notificationsService.markAllAsRead().subscribe({
      error: (error) => console.error('Erreur:', error),
    });
  }

  goToTicket(notification: any, event: Event): void {
    event.stopPropagation();

    if (!notification.lu) {
      this.notificationsService.markAsRead(notification.id).subscribe({
        error: (error) => console.error('Erreur:', error),
      });
    }

    this.closeNotifications();

    switch (notification.type) {
      case 'assignation_ticket':
        this.router.navigate(['/tickets']);
        break;
      case 'solution_acceptee':
      case 'solution_refusee':
        if (notification.ticket_id) {
          this.router.navigate(['/tickets', notification.ticket_id]);
        } else {
          this.router.navigate(['/tickets']);
        }
        break;
      case 'assignation_dlgas':
      case 'dlgas_notification':
        this.router.navigate(['/dlgas']);
        break;
      default:
        if (notification.ticket_id) {
          this.router.navigate(['/tickets', notification.ticket_id]);
        } else {
          this.router.navigate(['/tickets']);
        }
        break;
    }
  }

  getTimeSince(date: string): string {
    if (!date) return '';
    try {
      const now = new Date();
      const past = new Date(date);
      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "À l'instant";
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      if (diffHours < 24) return `Il y a ${diffHours} h`;
      if (diffDays < 30) return `Il y a ${diffDays} j`;
      return new Date(date).toLocaleDateString('fr-FR');
    } catch {
      return '';
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isProfileMenuOpen()) {
      const btnClicked = this.profileMenuBtn?.nativeElement.contains(event.target);
      const menuClicked = this.dropdownMenu?.nativeElement.contains(event.target);
      if (!btnClicked && !menuClicked) {
        this.isProfileMenuOpen.set(false);
      }
    }

    if (this.isNotificationsOpen()) {
      const btnClicked = this.notificationsBtn?.nativeElement.contains(event.target);
      const panelClicked = this.notificationsPanel?.nativeElement.contains(event.target);
      if (!btnClicked && !panelClicked) {
        this.isNotificationsOpen.set(false);
      }
    }

    if (this.showAllEntities()) {
      const entiteInfo = document.querySelector('.user-entite-info');
      if (entiteInfo && !entiteInfo.contains(event.target as Node)) {
        this.showAllEntities.set(false);
      }
    }
  }

  @HostListener('window:keydown.escape')
  onEscapePress(): void {
    this.closeProfileMenu();
    this.closeNotifications();
    this.showAllEntities.set(false);
  }

  loadConnectedUserEntite(): void {
    this.connectedUserEntite.set(this.authService.getConnectedUserEntite());
    this.connectedUserEntiteNom.set(this.authService.getConnectedUserEntiteNom());
    this.connectedUserEntiteChemin.set(this.authService.getConnectedUserEntiteFullPath());
    this.connectedUserEntiteHierarchy.set(
      this.authService.getConnectedUserEntiteHierarchy(),
    );
  }

  getUserEntiteFullPath(): string {
    return this.authService.getUserEntiteFullPath();
  }

  private loadUserData(): void {}

  private startTimeUpdate(): void {
    this.timeSubscription = interval(1000).subscribe(() => {
      this.currentTime.set(new Date());
    });
  }

  private checkScreenSize(): void {
    this.isSidebarCollapsed.set(window.innerWidth < 768);
    const savedState = localStorage.getItem('sidebar_collapsed');
    if (savedState !== null && window.innerWidth >= 768) {
      this.isSidebarCollapsed.set(savedState === 'true');
    }
    if (window.innerWidth >= 768) {
      this.isSidebarOpen.set(false);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.checkScreenSize();
  }

  isSuperAdmin(): boolean {
    return this.authService.getUserProfile() === 'superadmin';
  }

  isDlgas(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'dlgas';
  }

  isBackoffice(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'backoffice';
  }

  isSelfservice(): boolean {
    const user = this.authService.getCurrentUser()();
    return user?.profil === 'selfservice';
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen.update((value) => !value);
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen.set(false);
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed.update((value) => !value);
    localStorage.setItem('sidebar_collapsed', this.isSidebarCollapsed().toString());
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.target.value);
    if (this.searchQuery().length >= 2) {
      this.isSearching.set(true);
      setTimeout(() => {
        const results = [{ id: 3, title: 'Problème API', type: 'Ticket' }].filter(
          (item) => item.title.toLowerCase().includes(this.searchQuery().toLowerCase()),
        );
        this.searchResults.set(results);
        this.isSearching.set(false);
      }, 300);
    } else {
      this.searchResults.set([]);
      this.isSearching.set(false);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    if (this.searchInput) {
      this.searchInput.nativeElement.value = '';
      this.searchInput.nativeElement.focus();
    }
  }

  logout(): void {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);
    this.closeProfileMenu();
    // ⚠️ C'est AuthService.logout() qui va arrêter la surveillance maintenant
    this.notificationsService.resetNotifications();
    this.authService.logout();
    this.router
      .navigate(['/login'], { replaceUrl: true })
      .finally(() => {
        this.isLoggingOut.set(false);
      });
  }

  navigateTo(route: string): void {
    this.closeProfileMenu();
    this.router.navigate([route]);
  }

  getUserFullName(): string {
    return this.authService.getCurrentUserFullName() || 'Utilisateur';
  }

  getUserProfile(): string {
    return this.authService.getUserProfile() || 'Administrateur';
  }

  getUserName(): string {
    return this.authService.getCurrentUserFullName() || '';
  }

  getUserAvatar(): string {
    return this.authService.getUserAvatar();
  }

  getUserInitials(): string {
    const fullName = this.getUserFullName();
    if (fullName === 'Utilisateur') return 'AD';
    return fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getConnectedUserEntite(): any {
    return this.connectedUserEntite();
  }

  getConnectedUserEntiteNom(): string {
    return this.connectedUserEntiteNom();
  }

  getConnectedUserEntiteId(): number | null {
    return this.authService.getConnectedUserEntiteId();
  }

  getConnectedUserEntiteHierarchy() {
    return this.connectedUserEntiteHierarchy();
  }

  getConnectedUserEntiteFullPath(): string {
    return this.connectedUserEntiteChemin();
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  get enableDebug(): boolean {
    return environment.enableDebug;
  }
}
