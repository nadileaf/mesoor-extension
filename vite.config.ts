import path from "node:path";
import fs from "node:fs";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import zip from "vite-plugin-zip-pack";
import manifest from "./manifest.config.ts";
import { name, version } from "./package.json";
import tailwindcss from "@tailwindcss/vite";

// 环境变量类型定义
interface EnvVariables {
  WS_SERVER?: string;
  BACKGROUND_SERVER_HOST?: string;
  TOKEN_HOST?: string;
  SPACE_SERVER?: string;
  [key: string]: string | undefined;
}

// 自定义环境文件加载函数
function loadCustomEnv(mode: string): EnvVariables {
  // 默认环境变量
  const env: EnvVariables = {};
  
  // 尝试加载自定义env文件
  const customEnvFile = path.resolve(process.cwd(), `env.${mode}`);
  if (fs.existsSync(customEnvFile)) {
    console.log(`加载环境配置: env.${mode}`);
    const content = fs.readFileSync(customEnvFile, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // 去掉引号
        value = value.replace(/^['"]+|['"]+$/g, '');
        env[key] = value;
      }
    });
  } else {
    console.log(`未找到环境配置文件: env.${mode}`);
  }
  
  return env;
}

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const customEnv = loadCustomEnv(mode);
  const viteEnv = loadEnv(mode, process.cwd());
  const env = { ...viteEnv, ...customEnv };
  
  console.log(`当前构建环境: ${mode}`);
  console.log('环境变量:', env);
  
  return {
    resolve: {
      alias: {
        "@": `${path.resolve(__dirname, "src")}`,
      },
    },
    define: {
      // 将环境变量注入到客户端代码
      'import.meta.env.WS_SERVER': JSON.stringify(env.WS_SERVER),
      'import.meta.env.BACKGROUND_SERVER_HOST': JSON.stringify(env.BACKGROUND_SERVER_HOST),
      'import.meta.env.TOKEN_HOST': JSON.stringify(env.TOKEN_HOST),
      'import.meta.env.SPACE_SERVER': JSON.stringify(env.SPACE_SERVER),
    },
    plugins: [
      react(),
      tailwindcss(),
      crx({ manifest }),
      zip({ outDir: "release", outFileName: `crx-${name}-${version}-${mode}.zip` })
    ],
    server: {
      cors: {
        origin: [/chrome-extension:\/\//],
      },
    },
}});
