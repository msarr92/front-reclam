// dashboard.ts - Version avec Signals (sans forkJoin et map)
import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import Chart from 'chart.js/auto';
import { DashboardService } from '../../services/dashboard-services';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class Dashboard implements OnInit, AfterViewInit {

  @ViewChild('ticketChart') ticketChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('ticketStatusChart') ticketStatusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('userActivityChart') userActivityChartRef!: ElementRef<HTMLCanvasElement>;

  // ===== SIGNALS POUR LES DONNÉES =====
  statisticsSignal = signal<any[]>([]);
  recentTicketsSignal = signal<any[]>([]);
  userActivitiesSignal = signal<any[]>([]);
  isSidebarCollapsed = signal<boolean>(false);

  // ===== SIGNAL POUR LES DONNÉES BRUTES =====
  statsGeneralesSignal = signal<any>({
    utilisateurs_actifs: { total: 0, pourcentage: 0 },
    tickets_crees: { total: 0, pourcentage: 0 },
    tickets_resolus: { total: 0, pourcentage: 0 },
    tickets_ouverts: { total: 0, pourcentage: 0 },
    temps_moyen_resolution: { valeur: 0, unite: 'heures' }
  });

  // ===== SIGNALS POUR LES ÉTATS =====
  selectedDateRangeSignal = signal<string>('month');
  isLoadingSignal = signal<boolean>(true);
  lastUpdateSignal = signal<Date>(new Date());
  loadedCountSignal = signal<number>(0);
  totalCallsSignal = signal<number>(5); // Nombre total d'appels

  // ===== SIGNAL POUR LES DONNÉES D'ÉVOLUTION =====
  evolutionTicketsSignal = signal<any>({
    par_jour: [],
    par_mois: [],
    par_annee: []
  });

  // Getter pour le template
  get evolutionTickets() { return this.evolutionTicketsSignal(); }

  // ===== SIGNAL POUR LES DONNÉES DE RÉPARTITION =====
  repartitionStatutsSignal = signal<any>({
    en_attente: { total: 0, pourcentage: 0 },
    en_cours: { total: 0, pourcentage: 0 },
    resolu: { total: 0, pourcentage: 0 },
    total_tickets: 0
  });

  // Getter pour le template
  get repartitionStatuts() { return this.repartitionStatutsSignal(); }

  // ===== COMPUTED SIGNALS =====
  totalTickets = computed(() => this.statsGeneralesSignal().tickets_crees?.total || 0);
  ticketsOuverts = computed(() => this.statsGeneralesSignal().tickets_ouverts?.total || 0);
  ticketsResolus = computed(() => this.statsGeneralesSignal().tickets_resolus?.total || 0);

  setSidebarState(collapsed: boolean): void {
    this.isSidebarCollapsed.set(collapsed);
  }

  // Pourcentage de tickets résolus
  pourcentageResolus = computed(() => {
    const total = this.totalTickets();
    const resolus = this.ticketsResolus();
    return total > 0 ? Math.round((resolus / total) * 100) : 0;
  });

  // Temps moyen formaté
  tempsMoyenFormate = computed(() => {
    const valeur = this.statsGeneralesSignal().temps_moyen_resolution?.valeur || 0;
    return valeur + 'h';
  });

  // Tickets en cours (calculé)
  ticketsEnCours = computed(() => {
    return this.totalTickets() - this.ticketsOuverts() - this.ticketsResolus();
  });

  // ===== PROPRIÉTÉS STANDARD =====
  Math = Math;

  // Getters pour le template
  get statistics() { return this.statisticsSignal(); }
  get recentTickets() { return this.recentTicketsSignal(); }
  get userActivities() { return this.userActivitiesSignal(); }
  get selectedDateRange() { return this.selectedDateRangeSignal(); }
  get isLoading() { return this.isLoadingSignal(); }
  get lastUpdate() { return this.lastUpdateSignal(); }

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.statistics.length > 0) {
        this.initCharts();
      }
    }, 500);
  }

  // ===== MÉTHODE POUR FORMATER LES STATISTIQUES =====
  private formatStatistics(stats: any): any[] {
    return [
      {
        icon: '👥',
        label: 'Utilisateurs actifs',
        value: stats.utilisateurs_actifs?.total?.toLocaleString() || '0',
        trend: stats.utilisateurs_actifs?.pourcentage || 0,
        color: '#667eea'
      },
      {
        icon: '🎫',
        label: 'Tickets ouverts',
        value: stats.tickets_ouverts?.total?.toLocaleString() || '0',
        trend: stats.tickets_ouverts?.pourcentage || 0,
        color: '#fbbf24'
      },
      {
        icon: '✅',
        label: 'Tickets résolus',
        value: stats.tickets_resolus?.total?.toLocaleString() || '0',
        trend: stats.tickets_resolus?.pourcentage || 0,
        color: '#48bb78'
      },
      {
        icon: '⏳',
        label: 'Temps moyen',
        value: (stats.temps_moyen_resolution?.valeur || 0) + 'h',
        trend: 0,
        color: '#ed64a6'
      }
    ];
  }

  // ===== MÉTHODE POUR VÉRIFIER SI TOUTES LES DONNÉES SONT CHARGÉES =====
  private checkLoadingComplete(): void {
    this.loadedCountSignal.set(this.loadedCountSignal() + 1);
    if (this.loadedCountSignal() >= this.totalCallsSignal()) {
      this.isLoadingSignal.set(false);
      this.lastUpdateSignal.set(new Date());

      // Initialiser les graphiques après chargement complet
      setTimeout(() => {
        this.initCharts();
      }, 300);
    }
  }

  // ===== CHARGER TOUTES LES DONNÉES SÉPARÉMENT =====
  loadData(): void {
    this.isLoadingSignal.set(true);
    this.loadedCountSignal.set(0);

    // 1. Charger les statistiques générales
    this.dashboardService.getStatistiquesGenerales().subscribe({
      next: (response) => {
        // Extraire les données de la réponse
        const stats = response.success ? response.data : response;

        // Mettre à jour le signal des statistiques brutes
        this.statsGeneralesSignal.set(stats);

        // Formater et mettre à jour les statistiques pour l'affichage
        this.statisticsSignal.set(this.formatStatistics(stats));

        // Vérifier si tout est chargé
        this.checkLoadingComplete();
      },
      error: (error) => {
        console.error('❌ Erreur chargement statistiques:', error);
        this.checkLoadingComplete();
      }
    });

    // 2. Charger l'évolution des tickets
    this.dashboardService.getEvolutionTickets().subscribe({
      next: (response) => {
        // Extraire les données de la réponse
        const evolution = response.success ? response.data : response;
        this.evolutionTicketsSignal.set(evolution);
        this.checkLoadingComplete();
      },
      error: (error) => {
        console.error('❌ Erreur chargement évolution:', error);
        this.checkLoadingComplete();
      }
    });

    // 3. Charger la répartition des statuts
    this.dashboardService.getRepartitionStatuts().subscribe({
      next: (response) => {
        // Extraire les données de la réponse
        const repartition = response.success ? response.data : response;
        this.repartitionStatutsSignal.set(repartition);
        this.checkLoadingComplete();
      },
      error: (error) => {
        console.error('❌ Erreur chargement répartition:', error);
        this.checkLoadingComplete();
      }
    });

    // 4. Charger les tickets récents
    this.dashboardService.getRecentTickets(10).subscribe({
      next: (response) => {
        // Transformer les données pour le format attendu par le template
        if (response.success && response.data) {
          const tickets = response.data.map((ticket: any) => ({
            id: ticket.id,
            title: ticket.objet || 'Sans objet',
            user: ticket.demandeur?.nom || 'Utilisateur inconnu',
            status: ticket.statut || 'Inconnu',
            priority: ticket.priorite || 'Moyenne',
            date: ticket.date_creation ? new Date(ticket.date_creation).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          }));
          this.recentTicketsSignal.set(tickets);
        } else {
          this.recentTicketsSignal.set([]);
        }
        this.checkLoadingComplete();
      },
      error: (error) => {
        console.error('❌ Erreur chargement tickets récents:', error);
        this.recentTicketsSignal.set([]);
        this.checkLoadingComplete();
      }
    });

    // 5. Charger les activités utilisateurs
    this.dashboardService.getUserActivities(10).subscribe({
      next: (response) => {
        // Transformer les données pour le format attendu par le template
        if (response.success && response.data) {
          const activities = response.data.map((user: any) => {
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nom)}&background=667eea&color=fff`;

            let action = 'a été actif';
            if (user.tickets_crees > 0) {
              action = `a créé ${user.tickets_crees} ticket(s)`;
            } else if (user.tickets_assignes > 0) {
              action = `a ${user.tickets_assignes} ticket(s) assigné(s)`;
            }

            return {
              name: user.nom,
              avatar: avatarUrl,
              action: action,
              time: user.derniere_activite_formattee || 'Récemment'
            };
          });
          this.userActivitiesSignal.set(activities);
        } else {
          this.userActivitiesSignal.set([]);
        }
        this.checkLoadingComplete();
      },
      error: (error) => {
        console.error('❌ Erreur chargement activités utilisateurs:', error);
        this.userActivitiesSignal.set([]);
        this.checkLoadingComplete();
      }
    });
  }

  // ===== INITIALISATION DES GRAPHIQUES =====
  initCharts(): void {
    this.initTicketEvolutionChart();
    this.initTicketStatusChart();
    this.initUserActivityChart();
  }

  // Graphique d'évolution des tickets
  initTicketEvolutionChart(): void {
    if (!this.ticketChartRef?.nativeElement) return;

    const periode = this.selectedDateRangeSignal();
    let labels: string[] = [];
    let ticketsCrees: number[] = [];
    let ticketsResolus: number[] = [];

    const evolutionData = this.evolutionTicketsSignal();

    switch(periode) {
      case 'today':
        labels = this.getLastHours(24);
        ticketsCrees = this.getTicketsParHeure(evolutionData, 'cree');
        ticketsResolus = this.getTicketsParHeure(evolutionData, 'resolu');
        break;

      case 'week':
        const semaine = evolutionData.par_jour?.slice(-7) || [];
        labels = semaine.map((item: any) => this.formatDate(item.date));
        ticketsCrees = semaine.map((item: any) => item.tickets_crees || 0);
        ticketsResolus = semaine.map((item: any) => item.tickets_resolus || 0);
        break;

      case 'month':
        const mois = evolutionData.par_jour?.slice(-30) || [];
        labels = mois.map((item: any) => this.formatDate(item.date));
        ticketsCrees = mois.map((item: any) => item.tickets_crees || 0);
        ticketsResolus = mois.map((item: any) => item.tickets_resolus || 0);
        break;

      case 'year':
        const annee = evolutionData.par_mois || [];
        labels = annee.map((item: any) => this.formatMonth(item.mois));
        ticketsCrees = annee.map((item: any) => item.tickets_crees || 0);
        ticketsResolus = annee.map((item: any) => item.tickets_resolus || 0);
        break;

      default:
        const defaut = evolutionData.par_jour?.slice(-30) || [];
        labels = defaut.map((item: any) => this.formatDate(item.date));
        ticketsCrees = defaut.map((item: any) => item.tickets_crees || 0);
        ticketsResolus = defaut.map((item: any) => item.tickets_resolus || 0);
    }

    if (labels.length === 0) {
      labels = this.getDefaultLabels();
      ticketsCrees = this.getDefaultCreesData();
      ticketsResolus = this.getDefaultResolusData();
    }

    new Chart(this.ticketChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Tickets créés',
            data: ticketsCrees,
            borderColor: '#0066b3',
            backgroundColor: 'rgba(0, 102, 179, 0.04)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#0066b3',
            pointBorderColor: 'white',
            pointHoverBackgroundColor: 'white',
            pointHoverBorderColor: '#0066b3',
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Tickets résolus',
            data: ticketsResolus,
            borderColor: '#28a745',
            backgroundColor: 'rgba(40, 167, 69, 0.04)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: '#28a745',
            pointBorderColor: 'white',
            pointHoverBackgroundColor: 'white',
            pointHoverBorderColor: '#28a745',
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0, 0, 0, 0.03)' },
            ticks: { stepSize: 1 }
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 45 }
          }
        }
      }
    });
  }

  // ===== MÉTHODES UTILITAIRES =====

  private formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  private formatMonth(monthString: string): string {
    if (!monthString) return '';
    const date = new Date(monthString);
    return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  }

  private getLastHours(count: number): string[] {
    const hours = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const hour = new Date(now);
      hour.setHours(now.getHours() - i);
      hours.push(hour.getHours() + 'h');
    }
    return hours;
  }

  private getTicketsParHeure(evolutionData: any, type: 'cree' | 'resolu'): number[] {
    if (evolutionData.par_jour && evolutionData.par_jour.length > 0) {
      const today = evolutionData.par_jour[evolutionData.par_jour.length - 1];
      if (today) {
        const value = type === 'cree' ? today.tickets_crees || 0 : today.tickets_resolus || 0;
        return Array(24).fill(0).map((_, index) => {
          return Math.round(value / 24 * (index + 1));
        });
      }
    }
    return Array(24).fill(0).map(() => Math.floor(Math.random() * 3));
  }

  private getDefaultLabels(): string[] {
    const labels = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      labels.push(date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
    }
    return labels;
  }

  private getDefaultCreesData(): number[] {
    return [65, 59, 80, 81, 56, 55, 40, 45, 67, 78, 89, 94,
            65, 59, 80, 81, 56, 55, 40, 45, 67, 78, 89, 94,
            65, 59, 80, 81, 56, 55];
  }

  private getDefaultResolusData(): number[] {
    return [45, 52, 68, 74, 48, 52, 38, 42, 58, 69, 82, 88,
            45, 52, 68, 74, 48, 52, 38, 42, 58, 69, 82, 88,
            45, 52, 68, 74, 48, 52];
  }

  // Graphique circulaire des statuts
  initTicketStatusChart(): void {
    if (!this.ticketStatusChartRef?.nativeElement) return;

    const repartition = this.repartitionStatutsSignal();
    const enAttente = repartition.en_attente?.total || 0;
    const enCours = repartition.en_cours?.total || 0;
    const resolus = repartition.resolu?.total || 0;

    const data = [enAttente, enCours, resolus];
    if (data.every(v => v === 0)) {
      data[0] = 30;
      data[1] = 45;
      data[2] = 25;
    }

    new Chart(this.ticketStatusChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['En attente', 'En cours', 'Résolu'],
        datasets: [{
          data: data,
          backgroundColor: ['#ffc107', '#0066b3', '#28a745'],
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw as number;
                const total = data.reduce((a, b) => a + b, 0);
                const percentage = Math.round((value / total) * 100);
                return `${label}: ${percentage}% (${value} tickets)`;
              }
            }
          }
        },
        cutout: '70%'
      }
    });
  }

  // Graphique d'activité utilisateurs
  initUserActivityChart(): void {
    if (!this.userActivityChartRef?.nativeElement) return;

    new Chart(this.userActivityChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
        datasets: [
          {
            label: 'Connexions',
            data: [145, 152, 168, 174, 190, 120, 85],
            backgroundColor: '#ed64a6',
            borderRadius: 8,
            barPercentage: 0.6,
            categoryPercentage: 0.8
          },
          {
            label: 'Actions',
            data: [289, 302, 315, 328, 356, 245, 167],
            backgroundColor: '#0066b3',
            borderRadius: 8,
            barPercentage: 0.6,
            categoryPercentage: 0.8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0, 0, 0, 0.03)' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  onDateRangeChange(event: any): void {
    this.selectedDateRangeSignal.set(event.target.value);
    this.refreshData();
  }

  formatLastUpdate(): string {
    return this.lastUpdateSignal().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  refreshData(): void {
    this.isLoadingSignal.set(true);

    this.dashboardService.getEvolutionTickets().subscribe({
      next: (response) => {
        const evolution = response.success ? response.data : response;
        this.evolutionTicketsSignal.set(evolution);

        if (this.ticketChartRef?.nativeElement) {
          const chart = Chart.getChart(this.ticketChartRef.nativeElement);
          if (chart) {
            chart.destroy();
          }
          this.initTicketEvolutionChart();
        }

        this.isLoadingSignal.set(false);
        this.lastUpdateSignal.set(new Date());
      },
      error: (error) => {
        console.error('❌ Erreur rafraîchissement:', error);
        this.isLoadingSignal.set(false);
      }
    });
  }

  refreshAllData(): void {
    this.loadData();
  }
}
