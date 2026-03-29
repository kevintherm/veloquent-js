import * as esbuild from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = './dist';

// Ensure dist directory exists
if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR);
}

const baseConfig = {
  entryPoints: ['src/index.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'browser',
  target: ['es2020'],
  format: 'esm',
};

const isWatch = process.argv.includes('--watch');

async function build() {
  console.log(isWatch ? '👀 Starting watch mode...' : '🚀 Starting SDK build...');

  try {
    const contexts = [];

    // 1. ESM Build
    contexts.push(await esbuild.context({
      ...baseConfig,
      outfile: join(DIST_DIR, 'index.mjs'),
      format: 'esm',
    }));

    // 2. CJS Build
    contexts.push(await esbuild.context({
      ...baseConfig,
      outfile: join(DIST_DIR, 'index.cjs'),
      format: 'cjs',
      platform: 'node',
    }));

    // 3. Browser IIFE Build
    contexts.push(await esbuild.context({
      ...baseConfig,
      outfile: join(DIST_DIR, 'index.global.js'),
      format: 'iife',
      globalName: 'VeloPHP',
    }));

    if (isWatch) {
      await Promise.all(contexts.map(ctx => ctx.watch()));
      console.log('✅ Watching for changes...');
    } else {
      await Promise.all(contexts.map(ctx => ctx.rebuild()));
      await Promise.all(contexts.map(ctx => ctx.dispose()));
      console.log('✅ Build completed successfully!');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
