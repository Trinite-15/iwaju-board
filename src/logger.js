// src/logger.js
// Système de logs pour identifier les erreurs en production

const LOG_LEVELS = {
  INFO:  '📋 INFO',
  WARN:  '⚠️ WARN',
  ERROR: '🔴 ERROR',
};

const logs = []; // Stockage en mémoire des logs

const logger = {
  info: (message, data = {}) => {
    const entry = {
      level: LOG_LEVELS.INFO,
      message,
      data,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
    };
    logs.push(entry);
    console.log(`${entry.level} | ${entry.timestamp} | ${message}`, data);
  },

  warn: (message, data = {}) => {
    const entry = {
      level: LOG_LEVELS.WARN,
      message,
      data,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
    };
    logs.push(entry);
    console.warn(`${entry.level} | ${entry.timestamp} | ${message}`, data);
  },

  error: (message, error = {}) => {
    const entry = {
      level: LOG_LEVELS.ERROR,
      message,
      error: error.toString?.() || error,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
    };
    logs.push(entry);
    console.error(`${entry.level} | ${entry.timestamp} | ${message}`, error);
  },

  // Exporter tous les logs (utile pour déboguer à distance)
  export: () => {
    const blob = new Blob(
      [JSON.stringify(logs, null, 2)],
      { type: 'application/json' }
    );
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `iwaju-logs-${Date.now()}.json`;
    a.click();
  },

  getLogs: () => logs,
};

// Capturer automatiquement les erreurs non gérées
window.addEventListener('error', (e) => {
  logger.error('Erreur non gérée', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  logger.error('Promise rejetée', e.reason);
});

export default logger
