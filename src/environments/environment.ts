// src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  apiBaseUrl: 'http://localhost:8000',
  appName: 'RECLAM - Développement',
  version: '1.0.0-dev',

  // Configuration des délais
  timeout: 30000,
  retryAttempts: 3,

  // Features flags
  enableDebug: true,
  enableLogging: true,
  enableMockData: false,

  // Authentification
  tokenKey: 'token',
  userKey: 'user',

  // Pagination par défaut
  defaultItemsPerPage: 10,

  // SLA thresholds (en heures)
  slaThresholds: {
    haute: 24,
    moyenne: 48,
    basse: 72
  }
};
