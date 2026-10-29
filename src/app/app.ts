import { Component, signal, OnInit, OnDestroy, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth-services';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('reclam');

  private readonly authService = inject(AuthService);

  constructor() {
    // ✅ Effect : synchronise automatiquement la surveillance du token
    //    avec l'état d'authentification (utilisateur connecté ou non)
    effect(() => {
      // ⚠️ On accède au signal pour que l'effect soit réactif
      const user = this.authService.getCurrentUser()();
      const isAuth = this.authService.isAuthenticated();

      // On ne log rien ici pour éviter le bruit
      // La logique de démarrage/arrêt est gérée dans AuthService.login/logout
      // et dans MainLayout.ngOnInit()
      void user;
      void isAuth;
    });
  }

  ngOnInit(): void {
    // ⚠️ NE PAS démarrer la surveillance ici
    //    La surveillance est démarrée :
    //      - après login() (AuthService)
    //      - au F5 si déjà authentifié (MainLayout.ngOnInit)
  }

  ngOnDestroy(): void {
    // ⚠️ NE PAS arrêter la surveillance ici (ce composant ne se détruit jamais
    //    en pratique, mais par précaution on ne touche pas au token)
  }
}
