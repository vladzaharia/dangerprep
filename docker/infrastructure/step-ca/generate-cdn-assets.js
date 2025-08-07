#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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
const CDN_ASSETS_DIR = '/cdn-assets/step-ca';

// Ensure CDN assets directory exists
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created directory: ${dirPath}`);
    }
}

// Generate UUID for MDM profile
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

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

// Generate main HTML page
function generateMainPage() {
    return `<!DOCTYPE html>
<html class="wa-theme-default wa-palette-default wa-brand-blue wa-neutral-gray wa-success-green wa-warning-yellow wa-danger-red" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CA_NAME} - Certificate Download</title>

    <!-- Web Awesome (Self-hosted via CDN) -->
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

        .download-link {
            display: inline-block;
            padding: var(--wa-space-md) var(--wa-space-lg);
            background: var(--wa-color-brand-600);
            color: white;
            text-decoration: none;
            border-radius: var(--wa-border-radius-md);
            margin: var(--wa-space-sm);
            transition: background-color 0.2s;
        }

        .download-link:hover {
            background: var(--wa-color-brand-700);
        }

        .download-link.secondary {
            background: var(--wa-color-neutral-600);
        }

        .download-link.secondary:hover {
            background: var(--wa-color-neutral-700);
        }
    </style>
</head>
<body>
    <div class="hero-section">
        <div class="hero-title">
            🛡️ Certificate Authority
        </div>
        <div class="hero-subtitle">
            ${CA_NAME} - Secure your internal services with trusted certificates
        </div>
    </div>

    <div class="content-section">
        <!-- Security Warning -->
        <div style="background: var(--wa-color-warning-100); border: 1px solid var(--wa-color-warning-300); border-radius: var(--wa-border-radius-md); padding: var(--wa-space-lg); margin: var(--wa-space-lg) 0;">
            <strong>⚠️ Security Notice:</strong> Only install this certificate if you trust this Certificate Authority.
            Installing this certificate will allow it to issue certificates for any domain that your device will trust.
        </div>

        <!-- Download Grid -->
        <div class="download-grid">
            <!-- Mobile Devices Card -->
            <div class="platform-card">
                <div class="platform-icon">📱</div>
                <h2>Mobile Devices</h2>
                <p>iOS, iPadOS - Automatic Installation</p>
                
                <p>For iOS and iPadOS devices, use the configuration profile for automatic installation:</p>
                
                <div class="button-group">
                    <a href="https://cdn.danger/step-ca/dangerprep-ca.mobileconfig" class="download-link" download>
                        📱 Download iOS Profile
                    </a>
                </div>
                
                <details>
                    <summary><strong>Installation Steps</strong></summary>
                    <ol>
                        <li>Download the profile above</li>
                        <li>Open Settings → General → VPN & Device Management</li>
                        <li>Tap the downloaded profile and follow the installation prompts</li>
                        <li>Go to Settings → General → About → Certificate Trust Settings</li>
                        <li>Enable full trust for the ${CA_NAME} certificate</li>
                    </ol>
                </details>
            </div>

            <!-- Desktop Card -->
            <div class="platform-card">
                <div class="platform-icon">💻</div>
                <h2>Desktop & Manual</h2>
                <p>Windows, macOS, Linux</p>
                
                <p>For manual installation or other platforms:</p>
                
                <div class="button-group">
                    <a href="https://cdn.danger/step-ca/root-ca.crt" class="download-link" download>
                        📄 Download .crt
                    </a>
                    <a href="https://cdn.danger/step-ca/root-ca.pem" class="download-link secondary" download>
                        📄 Download .pem
                    </a>
                </div>
                
                <details>
                    <summary><strong>Installation Instructions</strong></summary>
                    <h4>macOS:</h4>
                    <ol>
                        <li>Download the certificate file above</li>
                        <li>Double-click the certificate file to open Keychain Access</li>
                        <li>Add it to the "System" keychain</li>
                        <li>Double-click the certificate in Keychain Access</li>
                        <li>Expand "Trust" and set "When using this certificate" to "Always Trust"</li>
                    </ol>
                    
                    <h4>Windows:</h4>
                    <ol>
                        <li>Download the certificate file above</li>
                        <li>Right-click the certificate and select "Install Certificate"</li>
                        <li>Choose "Local Machine" and click Next</li>
                        <li>Select "Place all certificates in the following store"</li>
                        <li>Browse and select "Trusted Root Certification Authorities"</li>
                        <li>Complete the installation</li>
                    </ol>
                    
                    <h4>Linux:</h4>
                    <p>Copy the certificate to the system trust store:</p>
                    <div class="code-block">sudo cp root-ca.crt /usr/local/share/ca-certificates/dangerprep-ca.crt<br>sudo update-ca-certificates</div>
                </details>
            </div>
        </div>

        <!-- Technical Information -->
        <div class="tech-info">
            <h2>🔧 Technical Information</h2>
            
            <h3>General Information</h3>
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
            
            <h3>ACME Configuration</h3>
            <p>This CA supports ACME for automatic certificate issuance and renewal:</p>
            <dl style="display: grid; grid-template-columns: auto 1fr; gap: var(--wa-space-sm) var(--wa-space-lg);">
                <dt><strong>ACME Directory:</strong></dt>
                <dd><code>${CA_URL}/acme/acme/directory</code></dd>
                <dt><strong>Challenge Types:</strong></dt>
                <dd>HTTP-01, DNS-01</dd>
                <dt><strong>Root Certificate:</strong></dt>
                <dd>Download from this page</dd>
            </dl>
            
            <details>
                <summary><strong>Example: Using with Certbot</strong></summary>
                <div class="code-block">REQUESTS_CA_BUNDLE=/path/to/root_ca.crt \\<br>certbot certonly -n --standalone -d example.danger \\<br>  --server ${CA_URL}/acme/acme/directory</div>
            </details>
        </div>
    </div>

    <!-- Footer -->
    <div class="footer-info">
        <p>
            🛡️ ${CA_NAME} • Powered by <a href="https://smallstep.com" target="_blank">Smallstep step-ca</a>
        </p>
        <p style="font-size: var(--wa-font-size-sm); margin-top: var(--wa-space-sm);">
            For support, contact your system administrator
        </p>
    </div>
</body>
</html>`;
}

// Main function to generate all assets
async function generateAssets() {
    console.log('🚀 Starting CDN asset generation for step-ca...');
    
    try {
        // Check if root certificate exists
        if (!fs.existsSync(ROOT_CERT_PATH)) {
            console.error('❌ Root certificate not found at:', ROOT_CERT_PATH);
            console.log('💡 Make sure step-ca is initialized and running');
            process.exit(1);
        }

        // Ensure CDN assets directory exists
        ensureDirectoryExists(CDN_ASSETS_DIR);

        // Read root certificate
        const rootCert = fs.readFileSync(ROOT_CERT_PATH);
        const rootCertBase64 = Buffer.from(rootCert).toString('base64');

        // Generate and save certificate files
        fs.writeFileSync(path.join(CDN_ASSETS_DIR, 'root-ca.crt'), rootCert);
        fs.writeFileSync(path.join(CDN_ASSETS_DIR, 'root-ca.pem'), rootCert);
        console.log('✅ Generated certificate files');

        // Generate and save MDM profile
        const mdmProfile = generateMDMProfile(rootCertBase64);
        fs.writeFileSync(path.join(CDN_ASSETS_DIR, 'dangerprep-ca.mobileconfig'), mdmProfile);
        console.log('✅ Generated MDM profile');

        // Generate and save HTML page
        const htmlPage = generateMainPage();
        fs.writeFileSync(path.join(CDN_ASSETS_DIR, 'index.html'), htmlPage);
        console.log('✅ Generated HTML page');

        // Generate CDN configuration
        const cdnConfig = {
            name: 'Step-CA Assets',
            description: 'Certificate Authority root certificates and installation profiles',
            version: '1.0.0',
            type: 'certificate-authority',
            homepage: 'https://cdn.danger/step-ca/',
            license: 'Internal Use',
            endpoints: [
                {
                    path: '/root-ca.crt',
                    description: 'Root CA certificate in CRT format',
                    type: 'certificate'
                },
                {
                    path: '/root-ca.pem',
                    description: 'Root CA certificate in PEM format',
                    type: 'certificate'
                },
                {
                    path: '/dangerprep-ca.mobileconfig',
                    description: 'iOS/macOS configuration profile for automatic installation',
                    type: 'profile'
                },
                {
                    path: '/index.html',
                    description: 'Certificate download and installation page',
                    type: 'webpage'
                }
            ],
            usage: {
                html_example: '<a href="https://cdn.danger/step-ca/">Download CA Certificate</a>',
                import_example: 'curl -O https://cdn.danger/step-ca/root-ca.crt'
            },
            tags: ['security', 'certificates', 'ca', 'ssl', 'tls']
        };

        fs.writeFileSync(path.join(CDN_ASSETS_DIR, 'cdn.config.json'), JSON.stringify(cdnConfig, null, 2));
        console.log('✅ Generated CDN configuration');

        console.log('🎉 CDN asset generation completed successfully!');
        console.log(`📁 Assets available at: ${CDN_ASSETS_DIR}`);
        console.log('🌐 Assets will be served at: https://cdn.danger/step-ca/');

    } catch (error) {
        console.error('❌ Error generating CDN assets:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    generateAssets();
}

module.exports = { generateAssets };
