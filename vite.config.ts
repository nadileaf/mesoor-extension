import path from 'node:path';
import fs from 'node:fs';
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
  process.env.VITE_NOTIFICATION_ICON = env.VITE_NOTIFICATION_ICON;
  process.env.VITE_EXTENSION_NAME = env.VITE_EXTENSION_NAME;

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
      // 修复 MAIN world 脚本的 loader: chrome.runtime.getURL 在 MAIN world 不可用
      // closeBundle 在所有文件写入后触发，直接改 manifest.json 指向内联脚本
      {
        name: 'fix-main-world-loader',
        closeBundle() {
          const distDir = path.resolve(__dirname, 'dist');
          const manifestPath = path.join(distDir, 'manifest.json');
          if (!fs.existsSync(manifestPath)) return;
          
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          let changed = false;
          for (const cs of manifest.content_scripts || []) {
            if (cs.world === 'MAIN') {
              cs.js = cs.js.map((j: string) => j.replace('-loader.js', '.js'));
              changed = true;
            }
          }
          if (changed) {
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            console.log('[fix-main-world-loader] ✅ manifest.json 已修复 MAIN world 引用');
          }
        },
      },
      zip({
        outDir: 'release',
        outFileName: `crx-${env.VITE_EXTENSION_SLUG || name}-${mode}-v${version}.zip`,
      }),
    ],
    server: {
      cors: {
        origin: [/chrome-extension:\/\//],
      },
    },
  };
});
