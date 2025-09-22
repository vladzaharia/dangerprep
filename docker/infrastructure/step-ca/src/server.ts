import fs from 'fs';
import path from 'path';

import express, { type Request, type Response } from 'express';

// Import template utilities
import { TemplateRenderer, createTemplateData } from './utils/template-renderer.js';

// Simple app discovery for CA service
const defaultApps = [
  {
    name: 'CDN Manager',
    description: 'Content Delivery Network Management',
    icon: 'rocket',
    url: 'https://cdn.danger',
    category: 'Infrastructure',
    status: 'healthy',
  },
  {
    name: 'Certificate Authority',
    description: 'SSL Certificate Management',
    icon: 'shield-check',
    url: 'https://root.danger',
    category: 'Security',
    status: 'healthy',
  },
];

// Simple logger to replace console statements
const logger = {
  info: (message: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`, ...args);
  },
};

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Initialize template renderer
const templateRenderer = new TemplateRenderer();

// Configuration
const CA_NAME = process.env.CA_NAME || 'DangerPrep Internal CA';
const CA_URL = process.env.CA_URL || 'https://ca.danger:9000';
const CA_ORGANIZATION = process.env.CA_ORGANIZATION || 'DangerPrep';
const CA_COUNTRY = process.env.CA_COUNTRY || 'US';
const CA_LOCALITY = process.env.CA_LOCALITY || 'Emergency Response';

// Paths
const CA_DATA_DIR = '/ca-data';
const ROOT_CERT_PATH = path.join(CA_DATA_DIR, 'certs', 'root_ca.crt');

// Middleware
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// App discovery endpoint
app.get('/api/apps', (_req: Request, res: Response): void => {
  res.json(defaultApps);
});

// Root certificate download
app.get('/root-ca.crt', (_req: Request, res: Response): void => {
  try {
    if (!fs.existsSync(ROOT_CERT_PATH)) {
      res.status(404).json({ error: 'Root certificate not found' });
      return;
    }

    const cert = fs.readFileSync(ROOT_CERT_PATH);
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="root-ca.crt"');
    res.send(cert);
  } catch (error) {
    logger.error('Error serving root certificate:', error);
    res.status(500).json({ error: 'Failed to serve certificate' });
  }
});

// Root certificate download as PEM
app.get('/root-ca.pem', (_req: Request, res: Response): void => {
  try {
    if (!fs.existsSync(ROOT_CERT_PATH)) {
      res.status(404).json({ error: 'Root certificate not found' });
      return;
    }

    const cert = fs.readFileSync(ROOT_CERT_PATH);
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="root-ca.pem"');
    res.send(cert);
  } catch (error) {
    logger.error('Error serving root certificate:', error);
    res.status(500).json({ error: 'Failed to serve certificate' });
  }
});

// iOS MDM profile
app.get('/profiles/ios.mobileconfig', (_req: Request, res: Response): void => {
  try {
    if (!fs.existsSync(ROOT_CERT_PATH)) {
      res.status(404).json({ error: 'Root certificate not found' });
      return;
    }

    const cert = fs.readFileSync(ROOT_CERT_PATH, 'utf8');
    const certBase64 = Buffer.from(cert).toString('base64');

    const profile = generateMDMProfile(certBase64);

    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="dangerprep-ca.mobileconfig"');
    res.send(profile);
  } catch (error) {
    logger.error('Error generating iOS MDM profile:', error);
    res.status(500).json({ error: 'Failed to generate MDM profile' });
  }
});

// macOS MDM profile
app.get('/profiles/macos.mobileconfig', (_req: Request, res: Response): void => {
  try {
    if (!fs.existsSync(ROOT_CERT_PATH)) {
      res.status(404).json({ error: 'Root certificate not found' });
      return;
    }

    const cert = fs.readFileSync(ROOT_CERT_PATH, 'utf8');
    const certBase64 = Buffer.from(cert).toString('base64');

    const profile = generateMDMProfile(certBase64, 'macOS');

    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="dangerprep-ca-macos.mobileconfig"');
    res.send(profile);
  } catch (error) {
    logger.error('Error generating macOS MDM profile:', error);
    res.status(500).json({ error: 'Failed to generate MDM profile' });
  }
});

// Main page
app.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check certificate status
    const rootCertExists = fs.existsSync(ROOT_CERT_PATH);

    // Prepare CA app template data
    const caAppData = {
      caName: CA_NAME,
      caOrganization: CA_ORGANIZATION,
      caCountry: CA_COUNTRY,
      caLocality: CA_LOCALITY,
      caUrl: CA_URL,
      rootCertExists,
      acmeEnabled: true, // Assume ACME is enabled
      certExpiry: rootCertExists ? getCertificateExpiry() : null,
    };

    const caAppContent = await templateRenderer.render('ca-app', caAppData);

    // Prepare base template data
    const templateData = createTemplateData('Certificate Authority', caAppContent, {
      appTitle: 'Certificate Authority',
      headerActions: `
          <wa-button appearance="outlined" variant="success" size="small" href="/root-ca.crt">
            <wa-icon slot="start" name="download" variant="regular"></wa-icon>
            Download CA
          </wa-button>
          <wa-button appearance="outlined" variant="neutral" size="small" href="/health">
            <wa-icon slot="start" name="heart-pulse" variant="regular"></wa-icon>
            Status
          </wa-button>
        `,
    });

    const html = await templateRenderer.render('base', { ...templateData });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Failed to render homepage:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Helper function to get certificate expiry
function getCertificateExpiry(): string | null {
  try {
    // This is a simplified version - in a real implementation,
    // you would parse the certificate to get the actual expiry date
    const stats = fs.statSync(ROOT_CERT_PATH);
    const created = new Date(stats.birthtime);
    const expiry = new Date(created.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from creation
    return expiry.toLocaleDateString();
  } catch (error) {
    logger.warn('Failed to get certificate expiry:', error);
    return null;
  }
}

// Generate MDM profile for iOS/macOS
function generateMDMProfile(certBase64: string, platform: string = 'iOS'): string {
  const uuid = generateUUID();
  const certUuid = generateUUID();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadCertificateFileName</key>
            <string>root-ca.crt</string>
            <key>PayloadContent</key>
            <data>${certBase64}</data>
            <key>PayloadDescription</key>
            <string>${CA_NAME} Root Certificate</string>
            <key>PayloadDisplayName</key>
            <string>${CA_NAME} (${platform})</string>
            <key>PayloadIdentifier</key>
            <string>com.dangerprep.ca.cert.${platform.toLowerCase()}.${certUuid}</string>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadUUID</key>
            <string>${certUuid}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Install ${CA_NAME} root certificate for secure connections</string>
    <key>PayloadDisplayName</key>
    <string>${CA_NAME}</string>
    <key>PayloadIdentifier</key>
    <string>com.dangerprep.ca.${uuid}</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${uuid}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;
}

// Generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// This function has been replaced by the template system

// Start server
app.listen(PORT, () => {
  logger.info(`CA Download Service running on port ${PORT}`);
  logger.info(`CA Name: ${CA_NAME}`);
  logger.info(`CA URL: ${CA_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});
