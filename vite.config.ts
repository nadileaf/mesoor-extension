import path from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import zip from 'vite-plugin-zip-pack';
import { name, version } from './package.json';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 动态设置环境变量供 manifest.config.ts 使用
  process.env.VITE_ICON_PATH = env.VITE_ICON_PATH;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const manifest = require('./manifest.config.ts').default;

  return {
    resolve: {
      alias: {
        '@': `${path.resolve(__dirname, 'src')}`,
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      crx({ manifest }),
      zip({
        outDir: 'release',
        outFileName: `crx-${name}-${version}-${mode}.zip`,
      }),
    ],
    server: {
      cors: {
        origin: [/chrome-extension:\/\//],
      },
    },
  };
});
