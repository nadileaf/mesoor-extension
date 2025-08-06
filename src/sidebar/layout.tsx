import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import React, { useEffect } from 'react';
import { TabType } from './App';
import { ThemeProvider } from '@/components/theme-provider';

interface LayoutProps {
  children: React.ReactNode;
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

export default function Layout({
  children,
  activeTab,
  onTabChange,
}: LayoutProps) {
  return (
    // <ThemeProvider>
    <SidebarProvider defaultOpen={true}>
      <main className="flex-1 h-screen overflow-hidden scrollbar-hide">
        <div className="h-full w-full relative">
          <SidebarTrigger className="absolute top-2 right-2 z-10" />
          {children}
        </div>
      </main>
      <AppSidebar activeTab={activeTab} onTabChange={onTabChange} />
    </SidebarProvider>
    // </ThemeProvider>
  );
}
