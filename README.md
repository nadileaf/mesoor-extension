# React + Vite + CRXJS

This template helps you quickly start developing Chrome extensions with React, TypeScript and Vite. It includes the CRXJS Vite plugin for seamless Chrome extension development.

## Features

- React with TypeScript
- TypeScript support
- Vite build tool
- CRXJS Vite plugin integration
- Chrome extension manifest configuration

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
# 本地环境 (localhost)
pnpm dev:localhost

# Tip 开发环境 (development)
pnpm dev:develop
pnpm build --mode development

# Tip 生产环境 (production)
pnpm dev:production
pnpm build --mode production

# App 开发环境 (app-development)
pnpm dev:app-development
pnpm build:app-development

# App 生产环境 (app-production)
pnpm dev:app-production
pnpm build:app-production

# App CGL 环境 (app-cgl)
pnpm dev:app-cgl
pnpm build:app-cgl
mesoor-extention-for-cgl-app
```

3. Open Chrome and navigate to `chrome://extensions/`, enable "Developer mode", and load the unpacked extension from the `dist` directory.

4. Build for production:

```bash
npm run build
```

## Project Structure

- `src/popup/` - Extension popup UI
- `src/content/` - Content scripts
- `manifest.config.ts` - Chrome extension manifest configuration

## Documentation

- [React Documentation](https://reactjs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [CRXJS Documentation](https://crxjs.dev/vite-plugin)

## Chrome Extension Development Notes

- Use `manifest.config.ts` to configure your extension
- The CRXJS plugin automatically handles manifest generation
- Content scripts should be placed in `src/content/`
- Popup UI should be placed in `src/popup/`
