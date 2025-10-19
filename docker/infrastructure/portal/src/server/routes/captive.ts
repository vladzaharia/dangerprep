import { Hono } from 'hono';
import { html } from 'hono/html';

import type { LoggerVariables } from '../middleware/logging';
import { ConfigService } from '../services/ConfigService';

// Initialize services
const configService = new ConfigService();

// Create router with typed variables
const captive = new Hono<{ Variables: LoggerVariables }>();

/**
 * GET /captive
 * Captive portal splash page that auto-redirects to the welcome page
 * This is the entry point for devices detecting the captive portal
 */
captive.get('/', c => {
  const logger = c.get('logger');
  logger.info('Captive portal splash page requested');

  // Get base domain from config
  const config = configService.getAppConfig();
  const baseDomain = config.global.baseDomain;
  const portalUrl = `https://portal.${baseDomain}/welcome`;

  // Return a simple HTML page that auto-redirects to the welcome page
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="refresh" content="0; url=${portalUrl}" />
        <title>Welcome to DangerPrep</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family:
              -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
              sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
          }

          .container {
            text-align: center;
            max-width: 500px;
          }

          h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            font-weight: 700;
          }

          p {
            font-size: 1.2rem;
            margin-bottom: 2rem;
            opacity: 0.9;
          }

          .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 2rem;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          a {
            color: white;
            text-decoration: underline;
            font-weight: 600;
          }

          a:hover {
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h1>Welcome to DangerPrep</h1>
          <p>Redirecting you to the portal...</p>
          <p>
            <small
              >If you are not redirected automatically,
              <a href="${portalUrl}">click here</a>.</small
            >
          </p>
        </div>
      </body>
    </html>
  `);
});

/**
 * GET /generate_204
 * Android captive portal detection endpoint
 * Returns 204 No Content to indicate captive portal is present
 */
captive.get('/generate_204', c => {
  const logger = c.get('logger');
  logger.debug('Android captive portal detection (generate_204)');

  // Redirect to captive portal splash page
  return c.redirect('/captive', 302);
});

/**
 * GET /hotspot-detect.html
 * iOS/macOS captive portal detection endpoint
 */
captive.get('/hotspot-detect.html', c => {
  const logger = c.get('logger');
  logger.debug('iOS/macOS captive portal detection (hotspot-detect.html)');

  // Redirect to captive portal splash page
  return c.redirect('/captive', 302);
});

/**
 * GET /connecttest.txt
 * Windows captive portal detection endpoint
 */
captive.get('/connecttest.txt', c => {
  const logger = c.get('logger');
  logger.debug('Windows captive portal detection (connecttest.txt)');

  // Redirect to captive portal splash page
  return c.redirect('/captive', 302);
});

/**
 * GET /ncsi.txt
 * Windows Network Connectivity Status Indicator
 */
captive.get('/ncsi.txt', c => {
  const logger = c.get('logger');
  logger.debug('Windows NCSI detection (ncsi.txt)');

  // Redirect to captive portal splash page
  return c.redirect('/captive', 302);
});

/**
 * GET /success.txt
 * Generic captive portal detection endpoint
 */
captive.get('/success.txt', c => {
  const logger = c.get('logger');
  logger.debug('Generic captive portal detection (success.txt)');

  // Redirect to captive portal splash page
  return c.redirect('/captive', 302);
});

export default captive;
