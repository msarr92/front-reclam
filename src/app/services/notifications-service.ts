// services/notifications-service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of, timeout, retry } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly enableDebug = environment.enableDebug;
  private readonly timeoutDuration = environment.timeout;
  private readonly retryAttempts = environment.retryAttempts;

  // ===== SIGNALS =====
  private notificationsSignal = signal<any[]>([]);
  readonly notifications = computed(() => this.notificationsSignal());

  private unreadCountSignal = signal<number>(0);
  readonly unreadCount = computed(() => this.unreadCountSignal());

  constructor() {}

  private getToken(): string {
    const token = localStorage.getItem(environment.tokenKey);
    return token ? token.replace(/^"(.*)"$/, '$1').trim() : '';
  }

  private createHeaders() {
    const token = this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  loadNotifications(): void {
    if (this.enableDebug) {
      console.log('📤 Chargement des notifications');
    }

    this.http
      .get(`${this.apiUrl}/notifications`, { headers: this.createHeaders() })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) {
            // Transformer les notifications pour le frontend
            return response.data.map((notification: any) => ({
              id: notification.id,
              ticket_id: notification.ticket_id,
              type: notification.type,
              message: notification.contenu,
              lu: notification.lu === 1 || notification.lu === true,
              created_at: notification.created_at,
              titre_ticket: notification.ticket?.type || 'Ticket',
              num_ticket: notification.ticket?.num_ticket || '#' + notification.ticket_id
            }));
          }
          return [];
        }),
        catchError((error) => {
          console.error('❌ Erreur chargement notifications:', error);
          return of([]);
        })
      )
      .subscribe((notifications) => {
        this.notificationsSignal.set(notifications);
        const unread = notifications.filter((n: any) => !n.lu).length;
        this.unreadCountSignal.set(unread);

        if (this.enableDebug) {
          console.log(`📬 ${notifications.length} notifications chargées, ${unread} non lues`);
        }
      });
  }

  markAsRead(notificationId: number): Observable<any> {
    if (this.enableDebug) {
      console.log(`📤 Marquage notification #${notificationId} comme lue`);
    }

    return this.http
      .patch(`${this.apiUrl}/notifications/${notificationId}/lire`, {}, {
        headers: this.createHeaders()
      })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) {
            // Mettre à jour localement avec les signaux
            const current = this.notificationsSignal();
            const updated = current.map(n =>
              n.id === notificationId ? { ...n, lu: true } : n
            );
            this.notificationsSignal.set(updated);
            const unread = updated.filter((n: any) => !n.lu).length;
            this.unreadCountSignal.set(unread);

            return response;
          }
          throw new Error(response.message);
        }),
        catchError((error) => {
          console.error('❌ Erreur marquage notification:', error);
          return of(null);
        })
      );
  }

  markAllAsRead(): Observable<any> {
    if (this.enableDebug) {
      console.log('📤 Marquage toutes notifications comme lues');
    }

    return this.http
      .patch(`${this.apiUrl}/notifications/lire-toutes`, {}, {
        headers: this.createHeaders()
      })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) {
            // Mettre à jour localement avec les signaux
            const current = this.notificationsSignal();
            const updated = current.map(n => ({ ...n, lu: true }));
            this.notificationsSignal.set(updated);
            this.unreadCountSignal.set(0);

            return response;
          }
          throw new Error(response.message);
        }),
        catchError((error) => {
          console.error('❌ Erreur marquage toutes notifications:', error);
          return of(null);
        })
      );
  }

  addNotification(notification: any): void {
    const current = this.notificationsSignal();
    const formattedNotification = {
      id: notification.id,
      ticket_id: notification.ticket_id,
      type: notification.type,
      message: notification.contenu || notification.message,
      lu: false,
      created_at: notification.created_at || new Date().toISOString(),
      titre_ticket: notification.titre_ticket || 'Ticket',
      num_ticket: notification.num_ticket || '#' + notification.ticket_id
    };
    this.notificationsSignal.set([formattedNotification, ...current]);
    this.unreadCountSignal.set(this.unreadCountSignal() + 1);
  }

  resetNotifications(): void {
    this.notificationsSignal.set([]);
    this.unreadCountSignal.set(0);
  }
}
