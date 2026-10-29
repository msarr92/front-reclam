import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { RapportService } from '../../services/rapport-service';
import { AuthService } from '../../services/auth-services';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-rapport',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rapport.html',
  styleUrls: ['./rapport.css'],
})
export class Rapport implements OnInit {
  private readonly rapportService = inject(RapportService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly enableDebug = environment.enableDebug;

  // ===== SIGNALS =====
  readonly isLoading = signal<boolean>(false);
  readonly isLoadingExport = signal<boolean>(false);

  // Rapports chargés
  readonly rapportGlobal = signal<any>(null);
  readonly synthese = signal<any>(null);

  // Tickets
  readonly tickets = signal<any>(null);
  readonly ticketsParStatut = signal<any[]>([]);
  readonly ticketsParCategorie = signal<any[]>([]);
  readonly ticketsParPriorite = signal<any[]>([]);
  readonly ticketsParEntite = signal<any[]>([]);
  readonly ticketsParAgent = signal<any[]>([]);
  readonly ticketsSLA = signal<any>(null);
  readonly ticketsReclamations = signal<any[]>([]);
  readonly ticketsEnRetard = signal<any[]>([]);

  // Utilisateurs
  readonly utilisateurs = signal<any>(null);
  readonly utilisateursParProfil = signal<any[]>([]);
  readonly utilisateursParEntite = signal<any[]>([]);
  readonly utilisateursActifs = signal<any[]>([]);
  readonly utilisateursInactifs = signal<any[]>([]);

  // Entités
  readonly entites = signal<any>(null);
  readonly entitesPerformance = signal<any[]>([]);

  // Éléments
  readonly elements = signal<any>(null);
  readonly elementsParType = signal<any[]>([]);
  readonly elementsParEtat = signal<any[]>([]);
  readonly elementsDefectueux = signal<any[]>([]);
  readonly elementsMaintenance = signal<any[]>([]);

  // SLA & Performance
  readonly sla = signal<any>(null);
  readonly performance = signal<any>(null);
  readonly delais = signal<any>(null);

  // Activité
  readonly activite = signal<any>(null);
  readonly activiteParUtilisateur = signal<any[]>([]);
  readonly connexions = signal<any[]>([]);

  // Filtres
  readonly filterDateDebut = signal<string>('');
  readonly filterDateFin = signal<string>('');
  readonly filterTypeRapport = signal<string>('tous');
  readonly filterStatut = signal<string>('tous');
  readonly filterPriorite = signal<string>('toutes');
  readonly filterEntite = signal<string>('');
  readonly filterFormat = signal<string>('pdf');

  // Navigation
  readonly activeSection = signal<string>('synthese');

  // Sections de rapports
  readonly sections = [
    { value: 'synthese', label: 'Synthèse globale', icon: 'fa-file-alt' },
    { value: 'tickets', label: 'Tickets', icon: 'fa-ticket-alt' },
    { value: 'sla', label: 'SLA & Délais', icon: 'fa-shield-alt' },
    { value: 'utilisateurs', label: 'Utilisateurs', icon: 'fa-users' },
    { value: 'entites', label: 'Entités', icon: 'fa-building' },
    { value: 'elements', label: 'Éléments', icon: 'fa-cubes' },
    { value: 'activite', label: 'Activité', icon: 'fa-history' },
    { value: 'personnalise', label: 'Personnalisé', icon: 'fa-cog' },
  ];

  readonly formats = [
    { value: 'pdf', label: 'PDF', icon: 'fa-file-pdf' },
    { value: 'excel', label: 'Excel', icon: 'fa-file-excel' },
    { value: 'csv', label: 'CSV', icon: 'fa-file-csv' },
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

  // Rapport personnalisé
  readonly rapportPersonnalise = signal<any>({
    nom: '',
    description: '',
    sections: [],
    format: 'pdf',
  });

  readonly sectionsPersonnalisables = [
    { key: 'tickets', label: 'Tickets', selected: false },
    { key: 'utilisateurs', label: 'Utilisateurs', selected: false },
    { key: 'entites', label: 'Entités', selected: false },
    { key: 'elements', label: 'Éléments', selected: false },
    { key: 'sla', label: 'SLA', selected: false },
    { key: 'activite', label: 'Activité', selected: false },
  ];

  // ===== COMPUTED =====
  readonly hasData = computed(() => {
    const g = this.rapportGlobal();
    return g && (g.total_tickets > 0 || g.total_utilisateurs > 0);
  });

  readonly totalReclamations = computed(() => this.ticketsReclamations().length);
  readonly totalTicketsEnRetard = computed(() => this.ticketsEnRetard().length);
  readonly totalElementsDefectueux = computed(() => this.elementsDefectueux().length);

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

    this.rapportService
      .loadAllRapports(filters)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({
        next: (d) => {
          this.rapportGlobal.set(d.global);
          this.synthese.set(d.synthese);

          this.tickets.set(d.tickets);
          this.ticketsParStatut.set(d.ticketsParStatut || []);
          this.ticketsParCategorie.set(d.ticketsParCategorie || []);
          this.ticketsParPriorite.set(d.ticketsParPriorite || []);
          this.ticketsParEntite.set(d.ticketsParEntite || []);
          this.ticketsParAgent.set(d.ticketsParAgent || []);
          this.ticketsSLA.set(d.ticketsSLA);
          this.ticketsReclamations.set(d.ticketsReclamations || []);
          this.ticketsEnRetard.set(d.ticketsEnRetard || []);

          this.utilisateurs.set(d.utilisateurs);
          this.utilisateursParProfil.set(d.utilisateursParProfil || []);
          this.utilisateursParEntite.set(d.utilisateursParEntite || []);
          this.utilisateursActifs.set(d.utilisateursActifs || []);
          this.utilisateursInactifs.set(d.utilisateursInactifs || []);

          this.entites.set(d.entites);
          this.entitesPerformance.set(d.entitesPerformance || []);

          this.elements.set(d.elements);
          this.elementsParType.set(d.elementsParType || []);
          this.elementsParEtat.set(d.elementsParEtat || []);
          this.elementsDefectueux.set(d.elementsDefectueux || []);
          this.elementsMaintenance.set(d.elementsMaintenance || []);

          this.sla.set(d.sla);
          this.performance.set(d.performance);
          this.delais.set(d.delais);

          this.activite.set(d.activite);
          this.activiteParUtilisateur.set(d.activiteParUtilisateur || []);
          this.connexions.set(d.connexions || []);

          this.logDebug('✅ Rapports chargés', d);
        },
        error: (e) => console.error('❌ Erreur rapports:', e),
      });
  }

  private buildFilters(): any {
    const f: any = {};
    if (this.filterDateDebut()) f.date_debut = this.filterDateDebut();
    if (this.filterDateFin()) f.date_fin = this.filterDateFin();
    if (this.filterStatut() !== 'tous') f.statut = this.filterStatut();
    if (this.filterPriorite() !== 'toutes') f.priorite = this.filterPriorite();
    if (this.filterEntite()) f.entite_id = this.filterEntite();
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
    this.filterEntite.set('');
    this.loadAllData();
  }

  setSection(s: string): void { this.activeSection.set(s); }

  refreshData(): void { this.loadAllData(); }

  printPage(): void { window.print(); }

  goBackToTickets(): void { this.router.navigate(['/tickets']); }

  // ===== EXPORT =====
  exporterRapportSection(type: string): void {
    this.isLoadingExport.set(true);
    const filters = this.buildFilters();

    this.rapportService
      .exporterRapport(type, this.filterFormat(), filters)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoadingExport.set(false))
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `rapport-${type}-${new Date().toISOString().slice(0, 10)}.${this.getExtension()}`;
          link.click();
          URL.revokeObjectURL(url);
        },
        error: (e) => console.error('❌ Erreur export:', e),
      });
  }

  exporterCSV(): void {
    const rows: string[][] = [
      ['=== SYNTHÈSE GLOBALE ==='],
      ['Total tickets', String(this.rapportGlobal()?.total_tickets || 0)],
      ['Total utilisateurs', String(this.rapportGlobal()?.total_utilisateurs || 0)],
      ['Total entités', String(this.rapportGlobal()?.total_entites || 0)],
      ['Total éléments', String(this.rapportGlobal()?.total_elements || 0)],
      [],
      ['=== TICKETS PAR STATUT ==='],
      ['Statut', 'Nombre', 'Pourcentage'],
      ...this.ticketsParStatut().map(i => [i.label, String(i.value), `${i.pourcentage || 0}%`]),
      [],
      ['=== TICKETS PAR PRIORITÉ ==='],
      ['Priorité', 'Nombre', 'Pourcentage'],
      ...this.ticketsParPriorite().map(i => [i.label, String(i.value), `${i.pourcentage || 0}%`]),
      [],
      ['=== TICKETS PAR CATÉGORIE ==='],
      ['Catégorie', 'Nombre', 'Pourcentage'],
      ...this.ticketsParCategorie().map(i => [i.label, String(i.value), `${i.pourcentage || 0}%`]),
      [],
      ['=== TICKETS PAR ENTITÉ ==='],
      ['Entité', 'Nombre', 'Pourcentage'],
      ...this.ticketsParEntite().map(i => [i.label, String(i.value), `${i.pourcentage || 0}%`]),
    ];

    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private getExtension(): string {
    const map: any = { pdf: 'pdf', excel: 'xlsx', csv: 'csv' };
    return map[this.filterFormat()] || 'pdf';
  }

  // ===== RAPPORT PERSONNALISÉ =====
  toggleSectionPersonnalisable(index: number): void {
    const sections = [...this.sectionsPersonnalisables];
    sections[index].selected = !sections[index].selected;
    this.sectionsPersonnalisables.length = 0;
    this.sectionsPersonnalisables.push(...sections);
  }

  genererRapportPersonnalise(): void {
    const selected = this.sectionsPersonnalisables
      .filter(s => s.selected)
      .map(s => s.key);

    if (selected.length === 0) {
      alert('Veuillez sélectionner au moins une section');
      return;
    }

    const config = {
      nom: this.rapportPersonnalise().nom || 'Rapport personnalisé',
      description: this.rapportPersonnalise().description,
      sections: selected,
      format: this.rapportPersonnalise().format,
      ...this.buildFilters(),
    };

    this.isLoadingExport.set(true);
    this.rapportService
      .genererRapportPersonnalise(config)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoadingExport.set(false))
      )
      .subscribe({
        next: () => this.logDebug('✅ Rapport généré'),
        error: (e) => console.error('❌ Erreur:', e),
      });
  }

  // ===== FORMATAGE =====
  formatDate(date: string): string {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
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

  formatPourcentage(v: number): string {
    return `${Math.round(v || 0)}%`;
  }

  getFullName(item: any): string {
    return `${item.prenom || ''} ${item.nom || ''}`.trim() || `Utilisateur #${item.user_id}`;
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

  getStatutClass(statut: string): string {
    const map: any = {
      ouvert: 'statut-ouvert', en_cours: 'statut-en-cours',
      resolu: 'statut-resolu', ferme: 'statut-ferme',
      en_attente: 'statut-ouvert', clos: 'statut-ferme',
    };
    return map[statut] || '';
  }

  isSuperAdmin(): boolean {
    const u = this.authService.getCurrentUser()();
    return u?.profil === 'superadmin';
  }
}
