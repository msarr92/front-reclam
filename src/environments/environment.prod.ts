// src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.reclam.com/api',
  apiBaseUrl: 'https://api.reclam.com',
  appName: 'RECLAM',
  version: '1.0.0',

  // Configuration des délais
  timeout: 30000,
  retryAttempts: 2,

  // Features flags
  enableDebug: false,
  enableLogging: false,
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
