import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AnalyticService } from '../../services/analytic-service';
import { AuthService } from '../../services/auth-services';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-analytic',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analytic.html',
  styleUrls: ['./analytic.css'],
})
export class Analytic implements OnInit {
  private readonly analyticService = inject(AnalyticService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly enableDebug = environment.enableDebug;

  // ===== SIGNALS PRINCIPAUX =====
  readonly isLoading = signal<boolean>(false);

  // Vue d'ensemble
  readonly vueEnsemble = signal<any>(null);

  // Tickets
  readonly ticketsKpis = signal<any>(null);
  readonly ticketsEvolution = signal<any[]>([]);
  readonly ticketsRepartition = signal<any>({});
  readonly ticketsParEntite = signal<any[]>([]);
  readonly ticketsParCategorie = signal<any[]>([]);
  readonly ticketsParPriorite = signal<any[]>([]);
  readonly ticketsParStatut = signal<any[]>([]);
  readonly ticketsSLA = signal<any>(null);
  readonly ticketsDelais = signal<any>(null);
  readonly topAgents = signal<any[]>([]);
  readonly topCreateurs = signal<any[]>([]);

  // Utilisateurs
  readonly utilisateursKpis = signal<any>(null);
  readonly utilisateursParProfil = signal<any[]>([]);
  readonly utilisateursParEntite = signal<any[]>([]);
  readonly utilisateursActifs = signal<any[]>([]);
  readonly utilisateursEvolution = signal<any[]>([]);

  // Entités
  readonly entitesKpis = signal<any>(null);
  readonly entitesPerformance = signal<any[]>([]);
  readonly entitesParType = signal<any[]>([]);
  readonly topEntites = signal<any[]>([]);

  // Éléments / Matériels
  readonly elementsKpis = signal<any>(null);
  readonly elementsParType = signal<any[]>([]);
  readonly elementsParEtat = signal<any[]>([]);
  readonly elementsDefectueux = signal<any[]>([]);
  readonly elementsParEntite = signal<any[]>([]);

  // Activité
  readonly activiteKpis = signal<any>(null);
  readonly activiteRecente = signal<any[]>([]);
  readonly activiteParAction = signal<any[]>([]);
  readonly activiteParHeure = signal<any[]>([]);

  // Référentiels
  readonly categories = signal<any[]>([]);
  readonly sourcesDemande = signal<any[]>([]);

  // Performance globale
  readonly performanceGlobale = signal<any>(null);
  readonly alertes = signal<any[]>([]);

  // Filtres
  readonly filterDateDebut = signal<string>('');
  readonly filterDateFin = signal<string>('');
  readonly filterPeriode = signal<string>('jour');
  readonly filterStatut = signal<string>('tous');
  readonly filterPriorite = signal<string>('toutes');
  readonly filterCategorie = signal<string>('toutes');

  // Navigation
  readonly activeSection = signal<string>('apercu');
  readonly activeSousSection = signal<string>('tickets');

  // Options
  readonly periodes = [
    { value: 'jour', label: 'Jour' },
    { value: 'semaine', label: 'Semaine' },
    { value: 'mois', label: 'Mois' },
  ];

  readonly sections = [
    { value: 'apercu', label: 'Vue d\'ensemble', icon: 'fa-chart-pie' },
    { value: 'tickets', label: 'Tickets', icon: 'fa-ticket-alt' },
    { value: 'utilisateurs', label: 'Utilisateurs', icon: 'fa-users' },
    { value: 'entites', label: 'Entités', icon: 'fa-building' },
    { value: 'elements', label: 'Éléments', icon: 'fa-cubes' },
    { value: 'activite', label: 'Activité', icon: 'fa-history' },
    { value: 'performance', label: 'Performance', icon: 'fa-tachometer-alt' },
  ];

  readonly sousSectionsTickets = [
    { value: 'kpis', label: 'KPIs', icon: 'fa-chart-line' },
    { value: 'evolution', label: 'Évolution', icon: 'fa-chart-area' },
    { value: 'repartition', label: 'Répartitions', icon: 'fa-chart-pie' },
    { value: 'sla', label: 'SLA', icon: 'fa-shield-alt' },
    { value: 'delais', label: 'Délais', icon: 'fa-stopwatch' },

    { value: 'createurs', label: 'Créateurs', icon: 'fa-user-edit' },
  ];

  readonly statuts = [
    { value: 'tous', label: 'Tous' },
    { value: 'en_attente', label: 'En attente' },
    { value: 'en_cours', label: 'En cours' },
    { value: 'resolu', label: 'Résolu' },
    { value: 'clos', label: 'Clos' },
  ];

  readonly priorites = [
    { value: 'toutes', label: 'Toutes' },
    { value: 'haute', label: 'Haute' },
    { value: 'moyenne', label: 'Moyenne' },
    { value: 'basse', label: 'Basse' },
  ];

  readonly categoriesOptions = [
    { value: 'toutes', label: 'Toutes' },
    { value: 'technique', label: 'Technique' },
    { value: 'fonctionnel', label: 'Fonctionnel' },
    { value: 'materiel', label: 'Matériel' },
    { value: 'logiciel', label: 'Logiciel' },
    { value: 'reseau', label: 'Réseau' },
    { value: 'securite', label: 'Sécurité' },
    { value: 'autre', label: 'Autre' },
  ];

  // ===== COMPUTED =====
  readonly hasData = computed(() => {
    const v = this.vueEnsemble();
    return v && (v.total_tickets > 0 || v.total_utilisateurs > 0);
  });

  readonly maxEvolutionValue = computed(() => {
    const data = this.ticketsEvolution();
    if (data.length === 0) return 1;
    return Math.max(...data.map(d => Math.max(d.crees || 0, d.resolus || 0, d.fermes || 0)), 1);
  });

  readonly totalAlertes = computed(() => this.alertes().length);

  // ===== INITIALISATION =====
  ngOnInit(): void {
    this.setDefaultDates();
    this.loadAllData();
  }

  private setDefaultDates(): void {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.filterDateDebut.set(this.formatDateForInput(firstDay));
    this.filterDateFin.set(this.formatDateForInput(today));
  }

  private formatDateForInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ===== CHARGEMENT =====
  loadAllData(): void {
    this.isLoading.set(true);
    const filters = this.buildFilters();

    this.analyticService
      .loadAllAnalytics(filters, this.filterPeriode())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({
        next: (d) => {
          // Vue d'ensemble
          this.vueEnsemble.set(d.vueEnsemble);

          // Tickets
          this.ticketsKpis.set(d.ticketsKpis);
          this.ticketsEvolution.set(d.ticketsEvolution || []);
          this.ticketsRepartition.set(d.ticketsRepartition);
          this.ticketsParEntite.set(d.ticketsParEntite || []);
          this.ticketsParCategorie.set(d.ticketsParCategorie || []);
          this.ticketsParPriorite.set(d.ticketsParPriorite || []);
          this.ticketsParStatut.set(d.ticketsParStatut || []);
          this.ticketsSLA.set(d.ticketsSLA);
          this.ticketsDelais.set(d.ticketsDelais);
          this.topAgents.set(d.topAgents || []);
          this.topCreateurs.set(d.topCreateurs || []);

          // Utilisateurs
          this.utilisateursKpis.set(d.utilisateursKpis);
          this.utilisateursParProfil.set(d.utilisateursParProfil || []);
          this.utilisateursParEntite.set(d.utilisateursParEntite || []);
          this.utilisateursActifs.set(d.utilisateursActifs || []);
          this.utilisateursEvolution.set(d.utilisateursEvolution || []);

          // Entités
          this.entitesKpis.set(d.entitesKpis);
          this.entitesPerformance.set(d.entitesPerformance || []);
          this.entitesParType.set(d.entitesParType || []);
          this.topEntites.set(d.topEntites || []);

          // Éléments
          this.elementsKpis.set(d.elementsKpis);
          this.elementsParType.set(d.elementsParType || []);
          this.elementsParEtat.set(d.elementsParEtat || []);
          this.elementsDefectueux.set(d.elementsDefectueux || []);
          this.elementsParEntite.set(d.elementsParEntite || []);

          // Activité
          this.activiteKpis.set(d.activiteKpis);
          this.activiteRecente.set(d.activiteRecente || []);
          this.activiteParAction.set(d.activiteParAction || []);
          this.activiteParHeure.set(d.activiteParHeure || []);

          // Référentiels
          this.categories.set(d.categories || []);
          this.sourcesDemande.set(d.sourcesDemande || []);

          // Performance
          this.performanceGlobale.set(d.performanceGlobale);
          this.alertes.set(d.alertes || []);

          this.logDebug('✅ Analytics chargées', d);
        },
        error: (e) => console.error('❌ Erreur analytics:', e),
      });
  }

  private buildFilters(): any {
    const f: any = {};
    if (this.filterDateDebut()) f.date_debut = this.filterDateDebut();
    if (this.filterDateFin()) f.date_fin = this.filterDateFin();
    if (this.filterStatut() !== 'tous') f.statut = this.filterStatut();
    if (this.filterPriorite() !== 'toutes') f.priorite = this.filterPriorite();
    if (this.filterCategorie() !== 'toutes') f.categorie = this.filterCategorie();
    return f;
  }

  private logDebug(...args: any[]): void {
    if (this.enableDebug) console.log(...args);
  }

  // ===== ACTIONS =====
  applyFilters(): void { this.loadAllData(); }

  resetFilters(): void {
    this.setDefaultDates();
    this.filterStatut.set('tous');
    this.filterPriorite.set('toutes');
    this.filterCategorie.set('toutes');
    this.filterPeriode.set('jour');
    this.loadAllData();
  }

  setPeriode(p: string): void {
    this.filterPeriode.set(p);
    this.loadAllData();
  }

  setSection(s: string): void { this.activeSection.set(s); }

  setSousSectionTickets(s: string): void { this.activeSousSection.set(s); }

  refreshData(): void { this.loadAllData(); }

  printPage(): void { window.print(); }

  goBackToTickets(): void { this.router.navigate(['/tickets']); }

  // ===== EXPORT CSV =====
  exportData(): void {
    const rows: string[][] = [
      ['=== VUE D\'ENSEMBLE ==='],
      ['Total tickets', String(this.vueEnsemble()?.total_tickets || 0)],
      ['Total utilisateurs', String(this.vueEnsemble()?.total_utilisateurs || 0)],
      ['Total entités', String(this.vueEnsemble()?.total_entites || 0)],
      ['Total éléments', String(this.vueEnsemble()?.total_elements || 0)],
      [],
      ['=== TICKETS KPIs ==='],
      ['Total', String(this.ticketsKpis()?.total || 0)],
      ['Ouverts', String(this.ticketsKpis()?.ouverts || 0)],
      ['En cours', String(this.ticketsKpis()?.en_cours || 0)],
      ['Résolus', String(this.ticketsKpis()?.resolus || 0)],
      ['Fermés', String(this.ticketsKpis()?.fermes || 0)],
      ['Taux résolution', String(this.ticketsKpis()?.taux_resolution || 0) + '%'],
      ['Délai moyen', String(this.ticketsKpis()?.delai_moyen || 0) + 'h'],
      [],
      ['=== UTILISATEURS ==='],
      ['Total', String(this.utilisateursKpis()?.total || 0)],
      ['Actifs', String(this.utilisateursKpis()?.actifs || 0)],
      [],
      ['=== ENTITÉS ==='],
      ['Total', String(this.entitesKpis()?.total || 0)],
      [],
      ['=== ÉLÉMENTS ==='],
      ['Total', String(this.elementsKpis()?.total || 0)],
      ['Défectueux', String(this.elementsKpis()?.defectueux || 0)],
    ];

    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytic-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ===== FORMATAGE =====
  formatDate(date: string): string {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    } catch { return date; }
  }

  formatDateFull(date: string): string {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric'
      });
    } catch { return date; }
  }

  formatDateTime(date: string): string {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return date; }
  }

  formatDuree(heures: number): string {
    if (!heures || heures <= 0) return '0h';
    if (heures < 24) return `${Math.round(heures)}h`;
    const j = Math.floor(heures / 24);
    const h = Math.round(heures % 24);
    return h > 0 ? `${j}j ${h}h` : `${j}j`;
  }

  formatPourcentage(v: number): string { return `${Math.round(v || 0)}%`; }

  getFullName(item: any): string {
    return `${item.prenom || ''} ${item.nom || ''}`.trim() || `Utilisateur #${item.user_id}`;
  }

  getEvolutionBarHeight(v: number): number {
    const max = this.maxEvolutionValue();
    return max === 0 ? 0 : Math.max((v / max) * 100, v > 0 ? 4 : 0);
  }

  getColor(index: number): string {
    const colors = ['#0066b3', '#f39c12', '#28a745', '#dc3545', '#6f42c1', '#20c997', '#fd7e14', '#6c757d', '#17a2b8', '#e83e8c'];
    return colors[index % colors.length];
  }

  getBarWidth(v: number, max: number): number {
    if (!max || max === 0) return 0;
    return Math.max((v / max) * 100, v > 0 ? 4 : 0);
  }

  getMaxFromList(list: any[], field: string): number {
    if (!list || list.length === 0) return 1;
    return Math.max(...list.map(i => i[field] || 0), 1);
  }

  getNiveauClass(niveau: string): string {
    const map: any = {
      critique: 'niveau-critique', haute: 'niveau-haute',
      moyenne: 'niveau-moyenne', basse: 'niveau-basse',
    };
    return map[niveau] || 'niveau-moyenne';
  }

  isSuperAdmin(): boolean {
    const u = this.authService.getCurrentUser()();
    return u?.profil === 'superadmin';
  }

  isBackoffice(): boolean {
    const u = this.authService.getCurrentUser()();
    return u?.profil === 'backoffice';
  }
}
