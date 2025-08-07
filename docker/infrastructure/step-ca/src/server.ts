import fs from 'fs';
import path from 'path';

import express, { type Request, type Response } from 'express';

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

// iOS/macOS MDM profile
app.get('/ios-profile.mobileconfig', (_req: Request, res: Response): void => {
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
    logger.error('Error generating MDM profile:', error);
    res.status(500).json({ error: 'Failed to generate MDM profile' });
  }
});

// Main page
app.get('/', (_req: Request, res: Response): void => {
  const html = generateMainPage();
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Generate MDM profile for iOS/macOS
function generateMDMProfile(certBase64: string): string {
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
            <string>${CA_NAME}</string>
            <key>PayloadIdentifier</key>
            <string>com.dangerprep.ca.cert.${certUuid}</string>
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

// Generate main HTML page using Web Awesome components
function generateMainPage(): string {
  return `<!DOCTYPE html>
<html class="wa-theme-default wa-palette-default wa-brand-blue wa-neutral-gray wa-success-green wa-warning-yellow wa-danger-red" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CA_NAME} - Certificate Download</title>

    <!-- Web Awesome (Self-hosted) -->
    <link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/webawesome.css">
    <link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/themes/default.css">
    <link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/color/palettes/default.css">
    <script type="module" src="https://cdn.danger/webawesome/dist/webawesome.loader.js"></script>
    <script type="module">
        import { setDefaultIconFamily } from 'https://cdn.danger/webawesome/dist/webawesome.js';
        setDefaultIconFamily('duotone');
    </script>

    <style>
        :root {
            --wa-border-radius-scale: 1;
            --wa-border-width-scale: 1;
            --wa-space-scale: 1;
        }

        html, body {
            min-height: 100%;
            height: 100%;
            padding: 0;
            margin: 0;
        }

        .hero-section {
            background: linear-gradient(135deg, var(--wa-color-brand-600) 0%, var(--wa-color-brand-800) 100%);
            color: white;
            padding: var(--wa-space-2xl);
            text-align: center;
        }

        .hero-title {
            font-size: var(--wa-font-size-3xl);
            font-weight: var(--wa-font-weight-bold);
            margin-bottom: var(--wa-space-md);
        }

        .hero-subtitle {
            font-size: var(--wa-font-size-lg);
            opacity: 0.9;
        }

        .content-section {
            padding: var(--wa-space-xl);
            max-width: 1200px;
            margin: 0 auto;
        }

        .download-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: var(--wa-space-lg);
            margin-bottom: var(--wa-space-xl);
        }

        .download-card {
            text-align: center;
        }

        .download-icon {
            font-size: 3rem;
            margin-bottom: var(--wa-space-md);
            color: var(--wa-color-brand-600);
        }

        .code-block {
            background: var(--wa-color-neutral-100);
            border: 1px solid var(--wa-color-neutral-300);
            border-radius: var(--wa-border-radius-md);
            padding: var(--wa-space-md);
            font-family: var(--wa-font-mono);
            font-size: var(--wa-font-size-sm);
            overflow-x: auto;
            white-space: pre-wrap;
        }

        .footer-info {
            text-align: center;
            padding: var(--wa-space-lg);
            background: var(--wa-color-neutral-50);
            border-top: 1px solid var(--wa-color-neutral-200);
        }

        .footer-info a {
            color: var(--wa-color-brand-600);
            text-decoration: none;
        }

        .footer-info a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <wa-page>
        <!-- Hero Section -->
        <div class="hero-section">
            <div class="hero-title">
                <wa-icon name="shield-check" style="margin-right: var(--wa-space-sm);"></wa-icon>
                ${CA_NAME}
            </div>
            <div class="hero-subtitle">
                Secure Certificate Authority for DangerPrep Infrastructure
            </div>
        </div>

        <!-- Main Content -->
        <main class="content-section">
            <!-- Download Cards -->
            <div class="download-grid">
                <wa-card class="download-card">
                    <div class="download-icon">
                        <wa-icon name="download"></wa-icon>
                    </div>
                    <h3>Root Certificate</h3>
                    <p>Download the root certificate for manual installation on servers and applications.</p>
                    <wa-button-group>
                        <wa-button href="/root-ca.crt" variant="primary">
                            <wa-icon slot="prefix" name="file-certificate"></wa-icon>
                            Download CRT
                        </wa-button>
                        <wa-button href="/root-ca.pem" variant="default">
                            <wa-icon slot="prefix" name="file-text"></wa-icon>
                            Download PEM
                        </wa-button>
                    </wa-button-group>
                </wa-card>

                <wa-card class="download-card">
                    <div class="download-icon">
                        <wa-icon name="mobile"></wa-icon>
                    </div>
                    <h3>iOS/macOS Profile</h3>
                    <p>Install the certificate automatically on iOS and macOS devices using a configuration profile.</p>
                    <wa-button href="/ios-profile.mobileconfig" variant="primary">
                        <wa-icon slot="prefix" name="apple"></wa-icon>
                        Download Profile
                    </wa-button>
                </wa-card>
            </div>

            <!-- Information Tabs -->
            <div style="margin-top: var(--wa-space-2xl);">
                <wa-card>
                    <wa-tab-group>
                        <wa-tab slot="nav" panel="installation">Installation</wa-tab>
                        <wa-tab slot="nav" panel="details">CA Details</wa-tab>
                        <wa-tab slot="nav" panel="acme">ACME</wa-tab>

                        <wa-tab-panel name="installation">
                            <h4>Installation Instructions</h4>

                            <wa-details summary="Manual Installation (Linux/Windows)">
                                <ol>
                                    <li>Download the root certificate in CRT or PEM format</li>
                                    <li><strong>Linux:</strong> Copy to <code>/usr/local/share/ca-certificates/</code> and run <code>sudo update-ca-certificates</code></li>
                                    <li><strong>Windows:</strong> Double-click the certificate and install to "Trusted Root Certification Authorities"</li>
                                </ol>
                            </wa-details>

                            <wa-details summary="iOS/macOS Installation">
                                <ol>
                                    <li>Download the iOS/macOS configuration profile</li>
                                    <li>Open the downloaded .mobileconfig file</li>
                                    <li>Follow the system prompts to install the certificate</li>
                                    <li><strong>iOS:</strong> Go to Settings > General > About > Certificate Trust Settings and enable the certificate</li>
                                </ol>
                            </wa-details>

                            <wa-details summary="Browser Installation">
                                <ol>
                                    <li>Download the root certificate</li>
                                    <li>Import into your browser's certificate store</li>
                                    <li><strong>Chrome:</strong> Settings > Privacy and security > Security > Manage certificates</li>
                                    <li><strong>Firefox:</strong> Settings > Privacy & Security > Certificates > View Certificates</li>
                                </ol>
                            </wa-details>
                        </wa-tab-panel>

                        <wa-tab-panel name="details">
                            <h4>Certificate Authority Information</h4>
                            <dl style="display: grid; grid-template-columns: auto 1fr; gap: var(--wa-space-sm) var(--wa-space-lg);">
                                <dt><strong>CA Name:</strong></dt>
                                <dd>${CA_NAME}</dd>
                                <dt><strong>Organization:</strong></dt>
                                <dd>${CA_ORGANIZATION}</dd>
                                <dt><strong>Country:</strong></dt>
                                <dd>${CA_COUNTRY}</dd>
                                <dt><strong>Locality:</strong></dt>
                                <dd>${CA_LOCALITY}</dd>
                            </dl>
                        </wa-tab-panel>

                        <wa-tab-panel name="acme">
                            <p>This CA supports ACME for automatic certificate issuance and renewal:</p>
                            <dl style="display: grid; grid-template-columns: auto 1fr; gap: var(--wa-space-sm) var(--wa-space-lg);">
                                <dt><strong>ACME Directory:</strong></dt>
                                <dd><code>${CA_URL}/acme/acme/directory</code></dd>
                                <dt><strong>Challenge Types:</strong></dt>
                                <dd>HTTP-01, DNS-01</dd>
                                <dt><strong>Root Certificate:</strong></dt>
                                <dd>Download from this page</dd>
                            </dl>

                            <wa-details summary="Example: Using with Certbot">
                                <div class="code-block">REQUESTS_CA_BUNDLE=/path/to/root_ca.crt \\<br>certbot certonly -n --standalone -d example.danger \\<br>  --server ${CA_URL}/acme/acme/directory</div>
                            </wa-details>
                        </wa-tab-panel>
                    </wa-tab-group>
                </wa-card>
            </div>
        </main>

        <!-- Footer -->
        <footer slot="footer" class="footer-info">
            <p>
                <wa-icon name="shield-check" style="margin-right: var(--wa-space-xs);"></wa-icon>
                ${CA_NAME} • Powered by <a href="https://smallstep.com" target="_blank">Smallstep step-ca</a>
            </p>
            <p style="font-size: var(--wa-font-size-sm); margin-top: var(--wa-space-sm);">
                For support, contact your system administrator
            </p>
        </footer>
    </wa-page>
</body>
</html>`;
}

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
