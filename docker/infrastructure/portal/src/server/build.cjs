const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Building server components with Hono...');

// Compile TypeScript files to JavaScript
try {
  execSync('npx tsc --target es2020 --module commonjs --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --outDir src/server/dist src/server/app.ts src/server/routes/*.ts src/server/services/*.ts', {
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
  // Copy app.js as app.cjs
  if (fs.existsSync(path.join(srcDir, 'app.js'))) {
    let appContent = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
    // Fix require paths for routes
    appContent = appContent.replace(/require\("\.\/routes\//g, 'require("./routes/');
    appContent = appContent.replace(/require\("\.\/services\//g, 'require("./services/');
    appContent = appContent.replace(/\.js"\)/g, '.cjs")');
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
        content = content.replace(/require\("\.\.\/services\//g, 'require("../services/');
        content = content.replace(/\.js"\)/g, '.cjs")');
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
}

console.log('🎉 Server build complete!');
