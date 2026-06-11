import { useContext } from 'react';
import { CopyModalContext } from './copy-modal-context';

export function useCopyModal() {
  const ctx = useContext(CopyModalContext);
  if (!ctx)
    throw new Error('useCopyModal must be used within CopyModalProvider');
  return ctx;
}
