import { Injectable, NgZone } from '@angular/core';
import Pusher from 'pusher-js';

@Injectable({
  providedIn: 'root'
})
export class PusherService {
  private pusher: any = null;
  private channels: Map<string, any> = new Map();

  constructor(private ngZone: NgZone) {}

  /**
   * Initialiser la connexion Pusher
   */
  initPusher(): void {
    if (this.pusher) return;

    const token = localStorage.getItem('token');
    const cleanToken = token ? token.replace(/^"(.*)"$/, '$1').trim() : '';

    this.pusher = new Pusher('4948c4797bc353134865', {
      cluster: 'mt1',
      forceTLS: true,
      authEndpoint: 'http://127.0.0.1:8000/api/broadcasting/auth',
      auth: {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json'
        }
      }
    });

    //console.log ('✅ Pusher initialisé avec succès');
  }

  /**
   * S'abonner à un canal privé
   */
  subscribeToTicket(ticketId: number, callback: (data: any) => void): void {
    if (!this.pusher) {
      this.initPusher();
    }

    const channelName = `private-ticket.${ticketId}`;

    // Vérifier si déjà abonné
    if (this.channels.has(channelName)) {
      //console.log(`⚠️ Déjà abonné au canal ${channelName}`);
      return;
    }

    // S'abonner au canal
    const channel = this.pusher.subscribe(channelName);

    // Écouter l'événement MessageSent
    channel.bind('MessageSent', (data: any) => {
      //console.log('📨 Nouveau message via Pusher:', data);

      this.ngZone.run(() => {
        callback(data);
      });
    });

    // Gérer les erreurs
    channel.bind('pusher:subscription_error', (error: any) => {
      console.error('❌ Erreur abonnement Pusher:', error);
    });

    channel.bind('pusher:subscription_succeeded', () => {
      //console.log(`✅ Abonné au canal ${channelName}`);
    });

    this.channels.set(channelName, channel);
  }

  /**
   * Se désabonner d'un canal
   */
  unsubscribeFromTicket(ticketId: number): void {
    const channelName = `private-ticket.${ticketId}`;

    if (this.channels.has(channelName)) {
      this.pusher.unsubscribe(channelName);
      this.channels.delete(channelName);
      //console.log(`⏹️ Désabonné du canal ${channelName}`);
    }
  }

  /**
   * Se désabonner de tous les canaux
   */
  unsubscribeAll(): void {
    this.channels.forEach((_, channelName) => {
      this.pusher.unsubscribe(channelName);
    });
    this.channels.clear();
    //console.log('🔇 Désabonné de tous les canaux');
  }

  /**
   * Déconnecter Pusher
   */
  disconnect(): void {
    if (this.pusher) {
      this.unsubscribeAll();
      this.pusher.disconnect();
      this.pusher = null;
      //console.log('🔌 Pusher déconnecté');
    }
  }
}
