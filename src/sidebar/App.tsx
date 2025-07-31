import { useEffect, useState } from "react";
import ChatContainer from "@/components/chat-container";
import SettingsContainer from "@/components/settings-container";

import Layout from "./layout";

export type TabType = "Sourcing" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<TabType>("Sourcing");

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="w-full h-full overflow-hidden">
        {activeTab === "Sourcing" ? <ChatContainer /> : <SettingsContainer />}
      </div>
    </Layout>
  );
}

export default App;
