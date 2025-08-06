import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Bot, Settings } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { TabType } from '../sidebar/App';

interface AppSidebarProps {
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const navItems = [
    {
      id: 'Sourcing' as TabType,
      icon: Bot,
      label: 'AI Sourcing',
    },
    {
      id: 'settings' as TabType,
      icon: Settings,
      label: '设置',
    },
  ];

  return (
    <Sidebar side="right" variant="sidebar" collapsible="offcanvas">
      <SidebarHeader>
        <div className="px-2 py-2">
          <h2 className="text-lg font-semibold ">Mesoor TIP</h2>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className=" font-medium">应用</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeTab === item.id}
                    onClick={() => onTabChange?.(item.id)}
                    className={`w-full transition-all duration-200 ${
                      activeTab === item.id
                        ? 'bg-primary/10 text-primary hover:bg-primary/30'
                        : 'hover:bg-sidebar-accent'
                    }`}
                  >
                    <item.icon
                      className={`w-5 h-5 transition-colors ${
                        activeTab === item.id ? 'text-primary' : ''
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        activeTab === item.id ? 'text-primary' : ''
                      }`}
                    >
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
