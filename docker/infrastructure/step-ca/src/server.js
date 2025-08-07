const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const app = express();
const PORT = process.env.PORT || 8080;

// Configuration
const CA_NAME = process.env.CA_NAME || 'DangerPrep Internal CA';
const CA_URL = process.env.CA_URL || 'https://ca.danger:9000';
const CA_ORGANIZATION = process.env.CA_ORGANIZATION || 'DangerPrep';
const CA_COUNTRY = process.env.CA_COUNTRY || 'US';
const CA_LOCALITY = process.env.CA_LOCALITY || 'Emergency Response';
const CA_PROVINCE = process.env.CA_PROVINCE || 'Disaster Zone';

// Paths
const CA_DATA_DIR = '/ca-data';
const ROOT_CERT_PATH = path.join(CA_DATA_DIR, 'certs', 'root_ca.crt');

// Middleware
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root certificate download
app.get('/root-ca.crt', (req, res) => {
    try {
        if (!fs.existsSync(ROOT_CERT_PATH)) {
            return res.status(404).json({ error: 'Root certificate not found' });
        }

        const cert = fs.readFileSync(ROOT_CERT_PATH);
        res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        res.setHeader('Content-Disposition', 'attachment; filename="root-ca.crt"');
        res.send(cert);
    } catch (error) {
        console.error('Error serving root certificate:', error);
        res.status(500).json({ error: 'Failed to serve certificate' });
    }
});

// Root certificate download as PEM
app.get('/root-ca.pem', (req, res) => {
    try {
        if (!fs.existsSync(ROOT_CERT_PATH)) {
            return res.status(404).json({ error: 'Root certificate not found' });
        }

        const cert = fs.readFileSync(ROOT_CERT_PATH);
        res.setHeader('Content-Type', 'application/x-pem-file');
        res.setHeader('Content-Disposition', 'attachment; filename="root-ca.pem"');
        res.send(cert);
    } catch (error) {
        console.error('Error serving root certificate:', error);
        res.status(500).json({ error: 'Failed to serve certificate' });
    }
});

// iOS/macOS MDM profile
app.get('/ios-profile.mobileconfig', (req, res) => {
    try {
        if (!fs.existsSync(ROOT_CERT_PATH)) {
            return res.status(404).json({ error: 'Root certificate not found' });
        }

        const cert = fs.readFileSync(ROOT_CERT_PATH, 'utf8');
        const certBase64 = Buffer.from(cert).toString('base64');
        
        const profile = generateMDMProfile(certBase64);
        
        res.setHeader('Content-Type', 'application/x-apple-aspen-config');
        res.setHeader('Content-Disposition', 'attachment; filename="dangerprep-ca.mobileconfig"');
        res.send(profile);
    } catch (error) {
        console.error('Error generating MDM profile:', error);
        res.status(500).json({ error: 'Failed to generate MDM profile' });
    }
});

// Main page
app.get('/', (req, res) => {
    const html = generateMainPage();
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

// Generate MDM profile for iOS/macOS
function generateMDMProfile(certBase64) {
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
    <string>Install ${CA_NAME} root certificate for secure access to internal services</string>
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

// Generate UUID for MDM profile
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Generate main HTML page using Web Awesome components
function generateMainPage() {
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
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: var(--wa-space-xl);
            margin: var(--wa-space-xl) 0;
        }

        .platform-card {
            border: 1px solid var(--wa-color-neutral-200);
            border-radius: var(--wa-border-radius-lg);
            padding: var(--wa-space-lg);
            background: var(--wa-color-neutral-0);
        }

        .platform-icon {
            font-size: var(--wa-font-size-2xl);
            margin-bottom: var(--wa-space-md);
        }

        .button-group {
            display: flex;
            gap: var(--wa-space-md);
            flex-wrap: wrap;
            margin: var(--wa-space-lg) 0;
        }

        .tech-info {
            background: var(--wa-color-neutral-50);
            border-radius: var(--wa-border-radius-md);
            padding: var(--wa-space-lg);
            margin: var(--wa-space-xl) 0;
        }

        .code-block {
            background: var(--wa-color-neutral-900);
            color: var(--wa-color-neutral-0);
            padding: var(--wa-space-md);
            border-radius: var(--wa-border-radius-sm);
            font-family: var(--wa-font-mono);
            font-size: var(--wa-font-size-sm);
            overflow-x: auto;
            margin: var(--wa-space-sm) 0;
        }

        .warning-banner {
            margin: var(--wa-space-lg) 0;
        }

        .footer-info {
            background: var(--wa-color-neutral-100);
            padding: var(--wa-space-xl);
            text-align: center;
            color: var(--wa-color-neutral-600);
        }
    </style>
</head>
<body>
    <wa-page>
        <!-- Header -->
        <header slot="header">
            <wa-icon name="shield-check" style="font-size: var(--wa-font-size-xl); color: var(--wa-color-brand-600);"></wa-icon>
            <span style="font-weight: var(--wa-font-weight-semibold); font-size: var(--wa-font-size-lg);">${CA_NAME}</span>
        </header>

        <!-- Main Content -->
        <main>
            <!-- Hero Section -->
            <div class="hero-section">
                <div class="hero-title">
                    <wa-icon name="certificate" style="margin-right: var(--wa-space-md);"></wa-icon>
                    Certificate Authority
                </div>
                <div class="hero-subtitle">
                    Secure your internal services with trusted certificates
                </div>
            </div>

            <div class="content-section">
                <!-- Security Warning -->
                <wa-alert variant="warning" open class="warning-banner">
                    <wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
                    <strong>Security Notice:</strong> Only install this certificate if you trust this Certificate Authority.
                    Installing this certificate will allow it to issue certificates for any domain that your device will trust.
                </wa-alert>

                <!-- Download Grid -->
                <div class="download-grid">
                    <!-- Mobile Devices Card -->
                    <wa-card class="platform-card">
                        <div slot="header">
                            <div class="platform-icon">📱</div>
                            <h2>Mobile Devices</h2>
                            <p>iOS, iPadOS - Automatic Installation</p>
                        </div>

                        <p>For iOS and iPadOS devices, use the configuration profile for automatic installation:</p>

                        <div class="button-group">
                            <wa-button variant="primary" href="/ios-profile.mobileconfig" download>
                                <wa-icon slot="prefix" name="mobile"></wa-icon>
                                Download iOS Profile
                            </wa-button>
                        </div>

                        <wa-details summary="Installation Steps">
                            <ol>
                                <li>Download the profile above</li>
                                <li>Open Settings → General → VPN & Device Management</li>
                                <li>Tap the downloaded profile and follow the installation prompts</li>
                                <li>Go to Settings → General → About → Certificate Trust Settings</li>
                                <li>Enable full trust for the ${CA_NAME} certificate</li>
                            </ol>
                        </wa-details>
                    </wa-card>

                    <!-- Desktop Card -->
                    <wa-card class="platform-card">
                        <div slot="header">
                            <div class="platform-icon">💻</div>
                            <h2>Desktop & Manual</h2>
                            <p>Windows, macOS, Linux</p>
                        </div>

                        <p>For manual installation or other platforms:</p>

                        <div class="button-group">
                            <wa-button variant="primary" href="/root-ca.crt" download>
                                <wa-icon slot="prefix" name="download"></wa-icon>
                                Download .crt
                            </wa-button>
                            <wa-button variant="default" href="/root-ca.pem" download>
                                <wa-icon slot="prefix" name="download"></wa-icon>
                                Download .pem
                            </wa-button>
                        </div>

                        <wa-tab-group>
                            <wa-tab slot="nav" panel="macos">
                                <wa-icon name="apple" style="margin-right: var(--wa-space-xs);"></wa-icon>
                                macOS
                            </wa-tab>
                            <wa-tab slot="nav" panel="windows">
                                <wa-icon name="windows" style="margin-right: var(--wa-space-xs);"></wa-icon>
                                Windows
                            </wa-tab>
                            <wa-tab slot="nav" panel="linux">
                                <wa-icon name="linux" style="margin-right: var(--wa-space-xs);"></wa-icon>
                                Linux
                            </wa-tab>

                            <wa-tab-panel name="macos">
                                <ol>
                                    <li>Download the certificate file above</li>
                                    <li>Double-click the certificate file to open Keychain Access</li>
                                    <li>Add it to the "System" keychain</li>
                                    <li>Double-click the certificate in Keychain Access</li>
                                    <li>Expand "Trust" and set "When using this certificate" to "Always Trust"</li>
                                </ol>
                            </wa-tab-panel>

                            <wa-tab-panel name="windows">
                                <ol>
                                    <li>Download the certificate file above</li>
                                    <li>Right-click the certificate and select "Install Certificate"</li>
                                    <li>Choose "Local Machine" and click Next</li>
                                    <li>Select "Place all certificates in the following store"</li>
                                    <li>Browse and select "Trusted Root Certification Authorities"</li>
                                    <li>Complete the installation</li>
                                </ol>
                            </wa-tab-panel>

                            <wa-tab-panel name="linux">
                                <p>Copy the certificate to the system trust store:</p>
                                <div class="code-block">sudo cp root-ca.crt /usr/local/share/ca-certificates/dangerprep-ca.crt<br>sudo update-ca-certificates</div>
                            </wa-tab-panel>
                        </wa-tab-group>
                    </wa-card>
                </div>

                <!-- Technical Information -->
                <wa-card class="tech-info">
                    <div slot="header">
                        <wa-icon name="gear" style="margin-right: var(--wa-space-sm);"></wa-icon>
                        <h2>Technical Information</h2>
                    </div>

                    <wa-tab-group>
                        <wa-tab slot="nav" panel="general">General</wa-tab>
                        <wa-tab slot="nav" panel="acme">ACME</wa-tab>

                        <wa-tab-panel name="general">
                            <dl style="display: grid; grid-template-columns: auto 1fr; gap: var(--wa-space-sm) var(--wa-space-lg);">
                                <dt><strong>CA URL:</strong></dt>
                                <dd><code>${CA_URL}</code></dd>
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
    console.log(`CA Download Service running on port ${PORT}`);
    console.log(`CA Name: ${CA_NAME}`);
    console.log(`CA URL: ${CA_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});
