const esbuild = require('esbuild');
const path = require('path');

console.log('🔨 Building server components with Hono...');

const buildServer = async () => {
  try {
    // Bundle the server application using esbuild
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/server/app.ts')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: path.join(__dirname, '../src/server/app.cjs'),
      external: [
        // External Node.js built-ins
        'node:*',
        // External dependencies that should not be bundled
        'dockerode',
        '@dangerprep/logging',
      ],
      minify: false, // Keep readable for debugging
      sourcemap: false,
      logLevel: 'info',
      metafile: false,
    });

    console.log('✅ Server bundle created: src/server/app.cjs');
    console.log('🎉 Server build complete!');
  } catch (error) {
    console.error('❌ Server build failed:', error.message);
    process.exit(1);
  }
};

buildServer();
