import ChatContainer from '@/components/chat-container';
import SettingsContainer from '@/components/settings-container';
import { useState } from 'react';

import Layout from './layout';

export type TabType = 'Sourcing' | 'settings';

function App() {
  const enableSourcingChat =
    import.meta.env.VITE_ENABLE_SOURCING_CHAT !== 'false';
  const hideSettingsPanel =
    import.meta.env.VITE_HIDE_SETTINGS_PANEL === 'true';
  const [activeTab, setActiveTab] = useState<TabType>(
    enableSourcingChat ? 'Sourcing' : 'settings'
  );

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="w-full h-full overflow-hidden">
        {hideSettingsPanel ? (
          <ChatContainer />
        ) : (
          activeTab === 'Sourcing' ? <ChatContainer /> : <SettingsContainer />
        )}
      </div>
    </Layout>
  );
}

export default App;
