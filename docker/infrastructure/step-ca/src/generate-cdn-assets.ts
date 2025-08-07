#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

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

// Configuration
const CA_NAME = process.env.CA_NAME || 'DangerPrep Internal CA';

// Paths
const CA_DATA_DIR = '/ca-data';
const ROOT_CERT_PATH = path.join(CA_DATA_DIR, 'certs', 'root_ca.crt');
const CDN_ASSETS_DIR = '/cdn-assets/step-ca';

// Ensure CDN assets directory exists
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`✅ Created directory: ${dirPath}`);
  }
}

// Generate UUID for MDM profile
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

// Interface for CDN configuration
interface CDNEndpoint {
  path: string;
  description: string;
  type: string;
}

interface CDNUsage {
  html_example: string;
  import_example: string;
}

interface CDNConfig {
  name: string;
  description: string;
  version: string;
  type: string;
  homepage: string;
  license: string;
  endpoints: CDNEndpoint[];
  usage: CDNUsage;
  tags: string[];
}

// Main function to generate all assets
async function generateAssets(): Promise<void> {
  logger.info('🚀 Starting CDN asset generation for step-ca...');

  try {
    // Check if root certificate exists
    if (!fs.existsSync(ROOT_CERT_PATH)) {
      logger.error('❌ Root certificate not found at:', ROOT_CERT_PATH);
      logger.info('💡 Make sure step-ca is initialized and running');
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
    logger.info('✅ Generated certificate files');

    // Generate and save MDM profile
    const mdmProfile = generateMDMProfile(rootCertBase64);
    fs.writeFileSync(path.join(CDN_ASSETS_DIR, 'dangerprep-ca.mobileconfig'), mdmProfile);
    logger.info('✅ Generated MDM profile');

    // Generate CDN configuration
    const cdnConfig: CDNConfig = {
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
          type: 'certificate',
        },
        {
          path: '/root-ca.pem',
          description: 'Root CA certificate in PEM format',
          type: 'certificate',
        },
        {
          path: '/dangerprep-ca.mobileconfig',
          description: 'iOS/macOS configuration profile for automatic installation',
          type: 'profile',
        },
      ],
      usage: {
        html_example: '<a href="https://cdn.danger/step-ca/">Download CA Certificate</a>',
        import_example: 'curl -O https://cdn.danger/step-ca/root-ca.crt',
      },
      tags: ['security', 'certificates', 'ca', 'ssl', 'tls'],
    };

    fs.writeFileSync(
      path.join(CDN_ASSETS_DIR, 'cdn.config.json'),
      JSON.stringify(cdnConfig, null, 2)
    );
    logger.info('✅ Generated CDN configuration');

    logger.info('🎉 CDN asset generation completed successfully!');
    logger.info(`📁 Assets available at: ${CDN_ASSETS_DIR}`);
    logger.info('🌐 Assets will be served at: https://cdn.danger/step-ca/');
  } catch (error) {
    logger.error(
      '❌ Error generating CDN assets:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAssets().catch(error => {
    logger.error('Failed to generate assets:', error);
    process.exit(1);
  });
}

export { generateAssets };
