const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building server components...');

// Compile TypeScript files to JavaScript
try {
  execSync('npx tsc --target es2020 --module commonjs --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --outDir src/server/dist src/server/middleware.ts src/server/services/ServiceDiscoveryService.ts', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  console.log('✅ TypeScript compilation complete');
} catch (error) {
  console.error('❌ TypeScript compilation failed:', error.message);
  process.exit(1);
}

// Copy the compiled files to the correct location
const srcDir = path.join(__dirname, 'dist');
const destDir = __dirname;

if (fs.existsSync(srcDir)) {
  // Copy middleware.js as middleware.cjs and fix require paths
  if (fs.existsSync(path.join(srcDir, 'middleware.js'))) {
    let middlewareContent = fs.readFileSync(path.join(srcDir, 'middleware.js'), 'utf8');
    // Fix the require path for ServiceDiscoveryService
    middlewareContent = middlewareContent.replace(
      'require("./services/ServiceDiscoveryService")',
      'require("./services/ServiceDiscoveryService.cjs")'
    );
    fs.writeFileSync(path.join(destDir, 'middleware.cjs'), middlewareContent);
    console.log('✅ Copied middleware.cjs');
  }
  
  // Copy ServiceDiscoveryService.js
  const servicesDir = path.join(destDir, 'services');
  if (!fs.existsSync(servicesDir)) {
    fs.mkdirSync(servicesDir, { recursive: true });
  }
  
  if (fs.existsSync(path.join(srcDir, 'services', 'ServiceDiscoveryService.js'))) {
    fs.copyFileSync(
      path.join(srcDir, 'services', 'ServiceDiscoveryService.js'),
      path.join(servicesDir, 'ServiceDiscoveryService.cjs')
    );
    console.log('✅ Copied ServiceDiscoveryService.cjs');
  }
  
  // Clean up temporary dist directory
  fs.rmSync(srcDir, { recursive: true, force: true });
  console.log('✅ Cleaned up temporary files');
}

console.log('🎉 Server build complete!');
