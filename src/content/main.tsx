import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DupeCheck } from './views/dupe-check';
import { ToastProvider } from './components/toast';
import { ToastListener } from './components/toast-listener';
import { CopyModalProvider } from './components/copy-modal';
import { CopyModalListener } from './components/copy-modal-listener';

console.log('[CRXJS] Hello world from content script!');

const container = document.createElement('div');
container.id = 'crxjs-app';
document.body.appendChild(container);
createRoot(container).render(
  <StrictMode>
    <DupeCheck />
    <ToastProvider>
      <ToastListener />
    </ToastProvider>
    <CopyModalProvider>
      <CopyModalListener />
    </CopyModalProvider>
  </StrictMode>
);
