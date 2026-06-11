import { createContext } from 'react';

export interface CopyModalItem {
  id: string;
  title?: string;
  content: string;
}

interface CopyModalContextType {
  openModal: (item: Omit<CopyModalItem, 'id'>) => void;
  closeModal: () => void;
  isOpen: boolean;
  currentItem: CopyModalItem | null;
}

export const CopyModalContext = createContext<CopyModalContextType | null>(
  null
);
