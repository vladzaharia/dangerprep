const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building server components with Hono...');

// Ensure the dist directory exists
const distDir = path.join(__dirname, '../src/server/dist');
if (!fs.existsSync(distDir)) {
  console.error('❌ TypeScript compilation output not found. Make sure tsc ran successfully.');
  process.exit(1);
}

// Copy the compiled files to the correct location
const srcDir = distDir;
const destDir = path.join(__dirname, '../src/server');

try {
  // Copy app.js as app.cjs
  if (fs.existsSync(path.join(srcDir, 'app.js'))) {
    let appContent = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
    // Fix require paths for routes and services
    appContent = appContent.replace(/require\("\.\/routes\/([^"]+)"\)/g, 'require("./routes/$1.cjs")');
    appContent = appContent.replace(/require\("\.\/services\/([^"]+)"\)/g, 'require("./services/$1.cjs")');
    fs.writeFileSync(path.join(destDir, 'app.cjs'), appContent);
    console.log('✅ Copied app.cjs');
  }

  // Copy routes
  const routesDir = path.join(destDir, 'routes');
  if (!fs.existsSync(routesDir)) {
    fs.mkdirSync(routesDir, { recursive: true });
  }

  const routesSrcDir = path.join(srcDir, 'routes');
  if (fs.existsSync(routesSrcDir)) {
    const routeFiles = fs.readdirSync(routesSrcDir);
    routeFiles.forEach(file => {
      if (file.endsWith('.js')) {
        let content = fs.readFileSync(path.join(routesSrcDir, file), 'utf8');
        // Fix service imports
        content = content.replace(/require\("\.\.\/services\/([^"]+)"\)/g, 'require("../services/$1.cjs")');
        const cjsFile = file.replace('.js', '.cjs');
        fs.writeFileSync(path.join(routesDir, cjsFile), content);
        console.log(`✅ Copied routes/${cjsFile}`);
      }
    });
  }

  // Copy services
  const servicesDir = path.join(destDir, 'services');
  if (!fs.existsSync(servicesDir)) {
    fs.mkdirSync(servicesDir, { recursive: true });
  }

  const servicesSrcDir = path.join(srcDir, 'services');
  if (fs.existsSync(servicesSrcDir)) {
    const serviceFiles = fs.readdirSync(servicesSrcDir);
    serviceFiles.forEach(file => {
      if (file.endsWith('.js')) {
        const cjsFile = file.replace('.js', '.cjs');
        fs.copyFileSync(
          path.join(servicesSrcDir, file),
          path.join(servicesDir, cjsFile)
        );
        console.log(`✅ Copied services/${cjsFile}`);
      }
    });
  }

  // Clean up temporary dist directory
  fs.rmSync(srcDir, { recursive: true, force: true });
  console.log('✅ Cleaned up temporary files');

  console.log('🎉 Server build complete!');
} catch (error) {
  console.error('❌ Server build failed:', error.message);
  process.exit(1);
}
