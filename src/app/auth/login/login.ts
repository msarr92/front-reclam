import { Component, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth-services';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login implements OnInit {
  // ===== SIGNALS =====
  loginForm!: FormGroup;

  // États avec Signals
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  loginAttempts = signal<number>(0);
  isLocked = signal<boolean>(false);
  lockTimeRemaining = signal<number>(0);





  // Timer pour le verrouillage
  private lockInterval: any = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.initForm();

    // Effect pour surveiller les changements (optionnel)
    effect(() => {
      if (this.isLocked()) {
       // console.log(`🔒 Compte verrouillé pour ${this.lockTimeRemaining()} secondes`);
      }
    });
  }

  ngOnInit(): void {
    this.checkLockStatus();
  }

  initForm(): void {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });
  }

  checkLockStatus(): void {
    const lockUntil = localStorage.getItem('login_lock_until');
    if (lockUntil) {
      const lockTime = parseInt(lockUntil);
      if (Date.now() < lockTime) {
        this.isLocked.set(true);
        this.lockTimeRemaining.set(Math.ceil((lockTime - Date.now()) / 1000));
        this.startLockCountdown();
      } else {
        localStorage.removeItem('login_lock_until');
        localStorage.removeItem('login_attempts');
      }
    }
  }

  startLockCountdown(): void {
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
    }

    this.lockInterval = setInterval(() => {
      this.lockTimeRemaining.update(value => value - 1);

      if (this.lockTimeRemaining() <= 0) {
        clearInterval(this.lockInterval);
        this.isLocked.set(false);
        localStorage.removeItem('login_lock_until');
        localStorage.removeItem('login_attempts');
      }
    }, 1000);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(value => !value);
  }



onSubmit(): void {
  // Vérifier si le compte est verrouillé
  if (this.isLocked()) {
    this.errorMessage.set(`Trop de tentatives. Réessayez dans ${this.lockTimeRemaining()} secondes.`);
    return;
  }

  // Vérifier si le formulaire est valide
  if (this.loginForm.invalid) {
    // Marquer tous les champs comme touchés pour afficher les erreurs
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });

    // Message d'erreur générique
    this.errorMessage.set('❌ Veuillez remplir tous les champs correctement.');
    return;
  }

  // Activer l'état de chargement
  this.isLoading.set(true);
  this.errorMessage.set(''); // Réinitialiser le message d'erreur

  // Récupérer les valeurs du formulaire
  const { username, password, rememberMe } = this.loginForm.value;

 // console.log('📤 Tentative de connexion pour:', username);
 // console.log('📝 Formulaire soumis:', { username, password: '********', rememberMe });

  // Appel au service d'authentification
  this.authService.login(username, password).subscribe({

    next: (response) => {
     // console.log("✅ Réponse API reçue:", response);
     // console.log("📦 Structure complète:", JSON.stringify(response, null, 2));

      // ===== STOCKAGE DU TOKEN =====
      let token = null;
      let user = null;

      // Adapter selon la structure de votre API
     if (response.data?.tokens?.access_token) {
  // Structure: { success: true, data: { user: {...}, tokens: { access_token: "..." } } }
  token = response.data.tokens.access_token;
  user = response.data.user;
 // console.log("🔑 Token trouvé dans response.data.tokens.access_token");
}
     // Garder les autres conditions pour compatibilité
else if (response.data?.token) {
  token = response.data.token;
  user = response.data.user;
 // console.log("🔑 Token trouvé dans response.data.token");
}
     else if (response.data?.access_token) {
  token = response.data.access_token;
  user = response.data.user;
 // console.log("🔑 Token trouvé dans response.data.access_token");
}
else if (response.token) {
  token = response.token;
  user = response.user;
 // console.log("🔑 Token trouvé dans response.token");
}
else if (response.access_token) {
  token = response.access_token;
  user = response.user;
 // console.log("🔑 Token trouvé dans response.access_token");
}

     // Vérifier que le token a été trouvé
if (!token) {
  console.error ("❌ Aucun token trouvé dans la réponse!");
  console.error("Structure reçue:", response);
  console.error("Clés disponibles:", Object.keys(response));
  if (response.data) console.error("Clés dans response.data:", Object.keys(response.data));
  if (response.data?.tokens) console.error("Clés dans response.data.tokens:", Object.keys(response.data.tokens));

  this.isLoading.set(false);
  this.errorMessage.set("❌ Erreur de réponse du serveur. Contactez l'administrateur.");
  return;
}

      // Nettoyer le token (enlever les guillemets éventuels)
      const cleanToken = token.replace(/^"(.*)"$/, '$1').trim();

      // Stocker le token dans localStorage
      localStorage.setItem('token', cleanToken);
     // console.log("🔑 Token stocké dans localStorage:", cleanToken.substring(0, 20) + '...');

      // ===== STOCKAGE DE L'UTILISATEUR =====
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
       // console.log("👤 Utilisateur stocké dans localStorage:", user.email || user.username || user.prenom);

        // Mettre à jour le signal utilisateur dans AuthService
        this.authService['setUser'](user);
      } else {
        console.warn("⚠️ Aucun utilisateur trouvé dans la réponse");
      }

      // ===== GESTION DU "SE SOUVENIR DE MOI" =====
      if (rememberMe) {
        // Optionnel: prolonger la durée du token ou stocker un refresh token
       // console.log("🔐 Option 'Se souvenir de moi' activée");
      }

      // Réinitialiser les tentatives de connexion
      this.loginAttempts.set(0);
      localStorage.removeItem('login_attempts');
      localStorage.removeItem('login_lock_until');

      // ===== VÉRIFICATION FINALE =====
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

     // console.log("✅ Vérification finale - Token présent:", !!storedToken);
     // console.log("✅ Vérification finale - Utilisateur présent:", !!storedUser);

      if (!storedToken) {
        console.error("❌ ÉCHEC CRITIQUE: Le token n'a pas été stocké correctement!");
        this.isLoading.set(false);
        this.errorMessage.set("❌ Erreur lors de la création de la session. Veuillez réessayer.");
        return;
      }

      // ===== REDIRECTION VERS LE DASHBOARD =====
     // console.log("✅ Authentification réussie, redirection vers le dashboard...");

      // Petit délai pour laisser le temps au stockage de se faire
      setTimeout(() => {
        // Utiliser replaceUrl pour éviter de pouvoir revenir en arrière avec le bouton back
        this.router.navigate(['/dashboard'], { replaceUrl: true })
          .then(success => {
            if (success) {
             // console.log("📌 Redirection vers dashboard réussie");
            } else {
              console.error("❌ Échec de la redirection");
              // Fallback: redirection forcée
              window.location.href = '/dashboard';
            }
            this.isLoading.set(false);
          })
          .catch(err => {
            console.error("❌ Erreur lors de la redirection:", err);
            // Fallback: redirection forcée
            window.location.href = '/dashboard';
            this.isLoading.set(false);
          });
      }, 100); // Petit délai de 100ms
    },

    error: (error) => {
      console.error("❌ Erreur API reçue:", error);
      this.isLoading.set(false);
      this.handleLoginError(error); // Appel à la méthode de gestion d'erreur
    }
  });
}

/**
 * Gestion des erreurs de connexion
 */
/**
 * Gestion des erreurs de connexion
 */
handleLoginError(error: any): void {
  //console.log('🔍 Gestion erreur avec status:', error.status);
  //console.log('📦 Corps de l\'erreur:', error.error);

  // Incrémenter le compteur de tentatives
  this.loginAttempts.update(value => value + 1);
  //console.log('🔢 Tentatives échouées:', this.loginAttempts());

  // Verrouillage après 5 tentatives
  if (this.loginAttempts() >= 5) {
    const lockTime = Date.now() + (5 * 60 * 1000); // 5 minutes
    localStorage.setItem('login_lock_until', lockTime.toString());
    this.isLocked.set(true);
    this.lockTimeRemaining.set(300); // 5 minutes en secondes
    this.startLockCountdown();
    this.errorMessage.set('🔒 Trop de tentatives. Compte verrouillé pour 5 minutes.');

    // Effacer les champs en cas de verrouillage
    this.clearFormFields();
    return;
  }

  // Gestion des différentes erreurs HTTP
  if (error.status === 401) {
    // Identifiants incorrects
    const message = error.error?.message || 'Identifiants incorrects. Vérifiez votre nom d\'utilisateur et mot de passe.';
    this.errorMessage.set(`❌ ${message}`);

    // ===== EFFACER TOUS LES CHAMPS =====
    this.clearFormFields();

    // Marquer les champs comme touchés pour afficher les erreurs
    this.loginForm.get('username')?.markAsTouched();
    this.loginForm.get('password')?.markAsTouched();

  } else if (error.status === 422) {
    // Erreurs de validation
    const errors = error.error?.errors;
    if (errors) {
      if (errors.username) {
        this.loginForm.get('username')?.setErrors({ apiError: errors.username[0] });
      }
      if (errors.password) {
        this.loginForm.get('password')?.setErrors({ apiError: errors.password[0] });
      }
    }
    this.errorMessage.set('❌ Veuillez vérifier les champs du formulaire.');

    // Effacer les champs pour les erreurs de validation aussi
    this.clearFormFields();

  } else if (error.status === 403) {
    // Compte désactivé
    this.errorMessage.set('❌ Compte désactivé. Contactez l\'administrateur.');
    // Effacer les champs pour les comptes désactivés
    this.clearFormFields();

  } else if (error.status === 429) {
    // Trop de requêtes
    this.errorMessage.set('❌ Trop de tentatives. Veuillez patienter quelques minutes.');
    // Ne pas effacer les champs pour ne pas aggraver la situation

  } else if (error.status === 0) {
    // Erreur réseau (serveur inaccessible)
    this.errorMessage.set('❌ Impossible de contacter le serveur. Vérifiez votre connexion internet.');
    // Ne pas effacer les champs pour les erreurs réseau

  } else if (error.status >= 500) {
    // Erreur serveur
    this.errorMessage.set('❌ Erreur serveur. Veuillez réessayer plus tard.');
    // Ne pas effacer les champs pour les erreurs serveur

  } else {
    // Erreur générique
    const message = error.error?.message || 'Erreur interne. Veuillez réessayer plus tard.';
    this.errorMessage.set(`❌ ${message}`);
    // Effacer les champs pour les autres erreurs
    this.clearFormFields();
  }

  // Animation de secousse sur le formulaire (optionnel)
  const formElement = document.querySelector('.login-form');
  if (formElement) {
    formElement.classList.add('shake');
    setTimeout(() => formElement.classList.remove('shake'), 500);
  }
}

/**
 * Efface tous les champs du formulaire de connexion
 */
private clearFormFields(): void {
  // Réinitialiser les valeurs des champs
  this.loginForm.patchValue({
    username: '',
    password: '',
    rememberMe: false // Optionnel : réinitialiser aussi la case à cocher
  });

  // Réinitialiser l'état "touché" des champs
  this.loginForm.get('username')?.markAsUntouched();
  this.loginForm.get('password')?.markAsUntouched();

  // Réinitialiser les erreurs spécifiques des champs
  this.loginForm.get('username')?.setErrors(null);
  this.loginForm.get('password')?.setErrors(null);

  // Mettre le focus sur le champ username pour une nouvelle tentative
  setTimeout(() => {
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
      usernameInput.focus();
    }
  }, 100);
}

  // Nettoyage à la destruction du composant
  ngOnDestroy(): void {
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
    }
  }
}
