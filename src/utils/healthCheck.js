import http from 'http';
import { createLogger } from './logger.js';
import { HEALTH_CHECK_PORT } from './constants.js';

const logger = createLogger('HealthCheck');

/**
 * Create and start a health check HTTP server
 * Provides a simple endpoint for monitoring bot status
 * @param {Function} getStatus - Function that returns bot status
 * @returns {Object} HTTP server instance
 */
export function createHealthCheckServer(getStatus) {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS preflight request
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
      try {
        const status = getStatus();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          healthy: true,
          timestamp: new Date().toISOString(),
          ...status
        }, null, 2));

        logger.debug('Health check request served');
      } catch (error) {
        logger.error('Health check failed', { error: error.message });

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }, null, 2));
      }
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not found',
      availableEndpoints: ['/health']
    }, null, 2));
  });

  server.on('error', (error) => {
    logger.error('Health check server error', { error: error.message });
  });

  server.listen(HEALTH_CHECK_PORT, () => {
    logger.info(`Health check server listening on port ${HEALTH_CHECK_PORT}`);
  });

  return server;
}

export default createHealthCheckServer;
