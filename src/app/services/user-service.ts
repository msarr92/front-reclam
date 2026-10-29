import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, throwError, timeout, retry } from 'rxjs';
import * as XLSX from 'xlsx';
import * as FileSaver from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { environment } from '../../environments/environment';


@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private apiUrl = environment.apiUrl;
  private readonly enableDebug = environment.enableDebug;
  private readonly timeoutDuration = environment.timeout;
  private readonly retryAttempts = environment.retryAttempts;

  constructor(private http: HttpClient) {}

  // ===== RÉCUPÉRER LE TOKEN =====
  private getToken(): string {
    const token = localStorage.getItem(environment.tokenKey);
    return token ? token.replace(/^"(.*)"$/, '$1').trim() : '';
  }

  // ===== CRÉER LES HEADERS =====
  private createHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }

  // ===== GESTIONNAIRE D'ERREURS CENTRALISÉ =====
  private handleError<T>(operation: string, fallbackValue?: T) {
    return (error: any): Observable<T> => {
      if (this.enableDebug) {
        console.error(`❌ Erreur ${operation}:`, error);
        if (error.status) console.error('📡 Status:', error.status);
        if (error.message) console.error('📝 Message:', error.message);
      }
      return fallbackValue !== undefined ? of(fallbackValue) : throwError(() => error);
    };
  }

  // ===== LISTER LES UTILISATEURS AVEC PAGINATION ET FILTRES =====


getUsers(page: number = 1, perPage: number = environment.defaultItemsPerPage, filters: any = {}): Observable<any> {
  let params = new HttpParams().set('page', page.toString()).set('per_page', perPage.toString());

  if (filters.search) {
    params = params.set('search', filters.search);
  }
  if (filters.profil && filters.profil !== 'Tous') {
    params = params.set('profil', filters.profil);
  }
  if (filters.statut && filters.statut !== 'Tous') {
    params = params.set('statut', filters.statut);
  }
  if (filters.entite_id) {
    params = params.set('entite_id', filters.entite_id.toString());
  }

  if (this.enableDebug) {
    console.log('📤 Requête API avec params:', params.toString());
  }

  return this.http
    .get(`${this.apiUrl}/users`, {
      headers: this.createHeaders(),
      params: params,
    })
    .pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          const usersData = response.data.users;
          const usersList = usersData.data || [];

          // Transformer les utilisateurs
          const transformedUsers = usersList.map((user: any) => {
            // Récupérer le nom de l'entité depuis la relation entites (many-to-many)
            let entiteNom = 'Non défini';
            if (user.entites && user.entites.length > 0) {
              // Prendre le nom de la première entité ou les joindre
              entiteNom = user.entites.map((e: any) => e.nom).join(', ');
            } else if (user.entite_id) {
              entiteNom = this.getEntiteNom(user.entite_id);
            }

            return {
              id: user.id,
              nom: user.nom,
              prenom: user.prenom,
              username: user.username,
              email: user.email,
              telephone: user.telephone,
              profil: user.profil,
              statut: user.statut,
              created_at: user.created_at,
              derniere_connexion: user.derniere_connexion,
              entite_nom: entiteNom, // Ajouter cette propriété pour l'affichage
              entites: user.entites || [], // Garder la liste complète
              avatar: this.getAvatarUrl(user),
              avatarFallback: this.getInitials(user),
            };
          });

          return {
            users: transformedUsers,
            pagination: {
              current_page: usersData.current_page || page,
              last_page: usersData.last_page || 1,
              per_page: usersData.per_page || perPage,
              total: usersData.total || transformedUsers.length,
            },
          };
        }
        return {
          users: [],
          pagination: { current_page: 1, last_page: 1, per_page: perPage, total: 0 },
        };
      }),
      catchError(this.handleError('getUsers', {
        users: [],
        pagination: { current_page: 1, last_page: 1, per_page: perPage, total: 0 },
      })),
    );
}

  getInitials(user: any): string {
    if (!user) return '';
    const first = (user.prenom || '')[0] || '';
    const last = (user.nom || '')[0] || '';
    return (first + last).toUpperCase();
  }

  getAvatarUrl(user: any): string {
    if (!user) return '';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.prenom || '')}+${encodeURIComponent(user.nom || '')}&background=0066b3&color=fff&size=128&bold=true&length=2`;
  }

  handleImageError(event: any, user: any): void {
    // Fallback en cas d'erreur de chargement
    event.target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' fill='%230066b3'/%3E%3Ctext x='64' y='80' font-size='48' text-anchor='middle' fill='%23ffffff' font-family='Arial'%3E${this.getInitials(user)}%3C/text%3E%3C/svg%3E`;
  }

  // ===== PROFILS DISPONIBLES =====
getProfils(): Observable<any> {
  // Récupérer les profils depuis la réponse API
  return this.http
    .get(`${this.apiUrl}/users`, {
      headers: this.createHeaders(),
      params: new HttpParams().set('page', '1').set('per_page', '1'),
    })
    .pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success && response.data && response.data.profils) {
          return response.data.profils;
        }
        // Fallback avec des profils par défaut
        return ['superadmin', 'backoffice', 'selfservice', 'consultation'];
      }),
      catchError(this.handleError('getProfils', ['superadmin', 'backoffice', 'selfservice', 'consultation'])),
    );
}

  // ===== RÉCUPÉRER LES ENTITÉS (AVEC ARBRE) =====
  getEntites(): Observable<any[]> {
    return this.http
      .get(`${this.apiUrl}/entites`, {
        headers: this.createHeaders(),
      })
      .pipe(
        timeout(this.timeoutDuration),
        retry(this.retryAttempts),
        map((response: any) => {
          if (response.success) {
            // Retourner l'arbre pour l'affichage hiérarchique
            return response.data.arbre || [];
          }
          return [];
        }),
        catchError(this.handleError('getEntites', [])),
      );
  }

  // ===== RÉCUPÉRER LA LISTE PLATE (optionnel) =====
getEntitesListe(): Observable<any[]> {
  return this.http
    .get(`${this.apiUrl}/entites`, {
      headers: this.createHeaders(),
    })
    .pipe(
      timeout(this.timeoutDuration),
      retry(this.retryAttempts),
      map((response: any) => {
        if (response.success) {
          // Retourner la liste plate
          return response.data.liste || [];
        }
        return [];
      }),
      catchError(this.handleError('getEntitesListe', [])),
    );
}

  // ===== AJOUTER UN UTILISATEUR =====

addUser(userData: any): Observable<any> {
  const token = this.getToken();
  const headers = new HttpHeaders({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  // ✅ Nettoyer le téléphone (retirer les espaces)
  const telephoneClean = (userData.telephone || '')
    .toString()
    .replace(/\s/g, '');

  // ✅ S'assurer que "entites" est un tableau d'IDs (nombres)
  let entitesArray: number[] = [];

  if (Array.isArray(userData.entites)) {
    entitesArray = userData.entites.map((id: any) => Number(id));
  } else if (Array.isArray(userData.entite_ids)) {
    entitesArray = userData.entite_ids.map((id: any) => Number(id));
  }

  // ✅ Construire le payload EXACT attendu par Laravel
  const payload: any = {
    nom: userData.nom?.trim(),
    prenom: userData.prenom?.trim(),
    username: userData.username?.trim(),
    email: userData.email?.trim(),
    password: userData.password,
    password_confirmation: userData.password_confirmation,
    profil: userData.profil,
    telephone: telephoneClean,
    // ✅ IMPORTANT : "entites" (nom exact du backend)
    entites: entitesArray,
  };

  console.log('📤 [addUser] Payload FINAL:', JSON.stringify(payload, null, 2));
  console.log('📤 [addUser] Vérifications:', {
    entitesEstTableau: Array.isArray(payload.entites),
    entitesCount: payload.entites.length,
    entites: payload.entites,
    telephone: payload.telephone,
    telephoneLength: payload.telephone.length,
    email: payload.email,
    profil: payload.profil,
  });

  // ✅ Vérification côté client avant envoi
  if (payload.entites.length === 0) {
    return throwError(() => ({
      error: {
        success: false,
        errors: { entites: ['Veuillez sélectionner au moins une entité'] },
      },
      status: 422,
    }));
  }

  return this.http.post(`${this.apiUrl}/users`, payload, { headers }).pipe(
    timeout(this.timeoutDuration),
    map((response: any) => {
      if (response.success) {
        return response.data || response.user || response;
      }
      throw new Error(response.message);
    }),
    catchError((error: HttpErrorResponse) => {
      console.error('❌ [addUser] Erreur détaillée:', {
        status: error.status,
        statusText: error.statusText,
        errors: error.error?.errors,
        message: error.error?.message,
      });
      return throwError(() => error);
    }),
  );
}

  // ===== RÉCUPÉRER UN UTILISATEUR PAR ID =====

getUserById(id: number): Observable<any> {
  if (this.enableDebug) {
    console.log(`📤 Récupération utilisateur #${id}`);
  }

  return this.http
    .get(`${this.apiUrl}/users/${id}`, {
      headers: this.createHeaders(),
    })
    .pipe(
      timeout(this.timeoutDuration),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) console.log('✅ Détails utilisateur:', response.data);
          return response.data;
        }
        throw new Error(response.message || 'Erreur lors de la récupération');
      }),
      catchError((error) => {
        console.error('❌ Erreur getUserById:', error.error);
        return throwError(() => error);
      }),
    );
}

  // ===== MODIFIER UN UTILISATEUR =====
updateUser(id: number, userData: any): Observable<any> {
  const payload: any = {};

  if (userData.nom !== undefined) payload.nom = userData.nom;
  if (userData.prenom !== undefined) payload.prenom = userData.prenom;
  // ⚠️ AJOUT : Transmettre username
  if (userData.username !== undefined) payload.username = userData.username;
  // ⚠️ AJOUT : Transmettre email
  if (userData.email !== undefined) payload.email = userData.email;
  if (userData.telephone !== undefined) payload.telephone = userData.telephone;
  if (userData.profil !== undefined) payload.profil = userData.profil;
  if (userData.statut !== undefined) payload.statut = userData.statut;

  if (userData.entites !== undefined) {
    payload.entites = userData.entites;
  }

  if (userData.password && userData.password.trim() !== '') {
    payload.password = userData.password;
    payload.password_confirmation = userData.password_confirmation;
  }

  if (this.enableDebug) {
    console.log('📤 Payload updateUser:', payload);
  }

  return this.http
    .put(`${this.apiUrl}/users/${id}`, payload, {
      headers: this.createHeaders(),
    })
    .pipe(
      timeout(this.timeoutDuration),
      map((response: any) => {
        if (response.success) {
          if (this.enableDebug) console.log('✅ Utilisateur modifié:', response.data);
          return response.data;
        }
        throw new Error(response.message || 'Erreur lors de la modification');
      }),
      catchError(this.handleError('updateUser')),
    );
}

  // ===== SUPPRIMER UN UTILISATEUR =====
  deleteUser(id: number): Observable<any> {
    return this.http
      .delete(`${this.apiUrl}/users/${id}`, {
        headers: this.createHeaders(),
      })
      .pipe(
        timeout(this.timeoutDuration),
        map((response: any) => response),
        catchError(this.handleError('deleteUser')),
      );
  }

  // ===== CHANGER LE STATUT =====
  changerStatut(id: number, statut: string): Observable<any> {
    return this.http
      .patch(
        `${this.apiUrl}/users/${id}/statut`,
        { statut },
        {
          headers: this.createHeaders(),
        },
      )
      .pipe(
        timeout(this.timeoutDuration),
        map((response: any) => {
          if (response.success) {
            return response.data;
          }
          throw new Error(response.message);
        }),
        catchError(this.handleError('changerStatut')),
      );
  }

  // ===== ACTIVER UN UTILISATEUR =====
  activerUtilisateur(id: number): Observable<any> {
    return this.http
      .patch(
        `${this.apiUrl}/users/${id}/activer`,
        {},
        {
          headers: this.createHeaders(),
        },
      )
      .pipe(
        timeout(this.timeoutDuration),
        map((response: any) => {
          if (response.success) {
            if (this.enableDebug) console.log('✅ Utilisateur activé avec succès:', response.data);
            return response.data;
          }
          throw new Error(response.message || "Erreur lors de l'activation");
        }),
        catchError(this.handleError('activerUtilisateur')),
      );
  }

  // ===== DÉSACTIVER UN UTILISATEUR =====
  desactiverUtilisateur(id: number): Observable<any> {
    return this.http
      .patch(
        `${this.apiUrl}/users/${id}/desactiver`,
        {},
        {
          headers: this.createHeaders(),
        },
      )
      .pipe(
        timeout(this.timeoutDuration),
        map((response: any) => {
          if (response.success) {
            if (this.enableDebug) console.log('✅ Utilisateur désactivé avec succès:', response.data);
            return response.data;
          }
          throw new Error(response.message || 'Erreur lors de la désactivation');
        }),
        catchError(this.handleError('desactiverUtilisateur')),
      );
  }

  // ===== STATISTIQUES UTILISATEURS =====
  getUserStats(): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/users/stats`, {
        headers: this.createHeaders(),
      })
      .pipe(
        timeout(this.timeoutDuration),
        map((response: any) => {
          if (response.success) {
            return {
              total: response.data.total,
              nouveaux: response.data.nouveaux_ce_mois,
              actifs: response.data.actifs,
              inactifs: response.data.inactifs,
              admins: response.data.admins,
              backoffice: response.data.backoffice,
              selfservice: response.data.selfservice,
              consultation: response.data.total,
            };
          }
          return this.getFallbackStats();
        }),
        catchError(this.handleError('getUserStats', this.getFallbackStats())),
      );
  }

  // ===== UTILITAIRES =====
  private getEntiteNom(entiteId: number): string {
    const entites: Record<number, string> = {
      1: 'Direction',
      2: 'Support',
      3: 'Commercial',
      4: 'Marketing',
      5: 'Ressources Humaines',
      6: 'Finance',
      7: 'Informatique',
    };
    return entites[entiteId] || 'Non défini';
  }

  private getFallbackStats(): any {
    return {
      total: 0,
      nouveaux: 0,
      actifs: 0,
      inactifs: 0,
      admins: 0,
      backoffice: 0,
      selfservice: 0,
      consultation: 0,
    };
  }

  // ===== EXPORT EXCEL =====
  exportToExcel(users: any[], fileName: string = 'utilisateurs'): void {
    try {
      // Préparer les données pour l'export
      const dataToExport = users.map((user) => ({
        ID: user.id,
        Prénom: user.prenom,
        Nom: user.nom,
        "Nom d'utilisateur": user.username,
        Email: user.email,
        Profil: user.profil,
        Statut: user.statut,
        Téléphone: user.telephone || '-',
        Entité: user.entite_nom || 'Non défini',
        'Dernière connexion': user.derniereConnexion
          ? new Date(user.derniereConnexion).toLocaleDateString('fr-FR')
          : 'Jamais',
      }));

      // Créer le workbook et la worksheet
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Utilisateurs');

      // Ajuster la largeur des colonnes
      const maxWidth = 50;
      worksheet['!cols'] = [];
      for (let i = 0; i < Object.keys(dataToExport[0] || {}).length; i++) {
        worksheet['!cols'].push({ wch: maxWidth });
      }

      // Générer le fichier
      const excelBuffer: any = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const data: Blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      FileSaver.saveAs(data, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);

      if (this.enableDebug) console.log('✅ Export Excel réussi');
    } catch (error) {
      console.error('❌ Erreur export Excel:', error);
      throw error;
    }
  }

  // ===== EXPORT PDF =====
  async exportToPDF(users: any[], fileName: string = 'utilisateurs'): Promise<void> {
    try {
      // Imports dynamiques
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);

      const doc = new jsPDF('landscape', 'mm', 'a4');

      doc.setFontSize(18);
      doc.text('Liste des utilisateurs', 14, 22);
      doc.setFontSize(11);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);

      const headers = [['ID', 'Prénom', 'Nom', 'Email', 'Profil', 'Statut']];
      const data = users.map(user => [
        user.id.toString(),
        user.prenom || '',
        user.nom || '',
        user.email || '',
        user.profil || '',
        user.statut || ''
      ]);

      autoTable(doc, {
        head: headers,
        body: data,
        startY: 40,
        theme: 'striped',
        headStyles: { fillColor: [0, 102, 179] }
      });

      doc.save(`${fileName}_${new Date().toISOString().slice(0, 10)}.pdf`);

      if (this.enableDebug) console.log('✅ Export PDF réussi');
    } catch (error) {
      console.error('❌ Erreur export PDF:', error);
      throw error;
    }
  }

  // ===== EXPORT WORD =====
  exportToWord(users: any[], fileName: string = 'utilisateurs'): void {
    try {
      // Créer le contenu HTML
      let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Liste des utilisateurs</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #0066b3; }
          .header { margin-bottom: 20px; color: #666; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #0066b3; color: white; padding: 8px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; }
          tr:nth-child(even) { background: #f9f9f9; }
          .statut-actif { color: #28a745; font-weight: bold; }
          .statut-inactif { color: #dc3545; font-weight: bold; }
          .footer { margin-top: 20px; font-size: 11px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <h1>Liste des utilisateurs</h1>
        <div class="header">
          <p>Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
          <p>Total: ${users.length} utilisateur(s)</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Prénom</th>
              <th>Nom</th>
              <th>Username</th>
              <th>Email</th>
              <th>Profil</th>
              <th>Statut</th>
              <th>Téléphone</th>
              <th>Entité</th>
            </tr>
          </thead>
          <tbody>
      `;

      users.forEach((user) => {
        const statutClass = user.statut === 'actif' ? 'statut-actif' : 'statut-inactif';
        htmlContent += `
          <tr>
            <td>${user.id}</td>
            <td>${user.prenom || ''}</td>
            <td>${user.nom || ''}</td>
            <td>${user.username || ''}</td>
            <td>${user.email || ''}</td>
            <td>${user.profil || ''}</td>
            <td class="${statutClass}">${user.statut || ''}</td>
            <td>${user.telephone || '-'}</td>
            <td>${user.entite_nom || 'Non défini'}</td>
          </tr>
        `;
      });

      htmlContent += `
          </tbody>
        </table>
        <div class="footer">
          <p>Document généré automatiquement - ${new Date().toLocaleDateString('fr-FR')}</p>
        </div>
      </body>
      </html>
      `;

      // Créer le blob et télécharger
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      FileSaver.saveAs(blob, `${fileName}_${new Date().toISOString().slice(0, 10)}.doc`);

      if (this.enableDebug) console.log('✅ Export Word réussi');
    } catch (error) {
      console.error('❌ Erreur export Word:', error);
      throw error;
    }
  }

}
