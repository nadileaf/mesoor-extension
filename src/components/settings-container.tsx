import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// 引入browser polyfill支持
declare global {
  interface Window {
    browser: any;
  }
}

interface SettingsState {
  autoSync: boolean;
  enableSocketConnection: boolean;
}

interface VersionInfo {
  version: string;
  file: string;
}

async function queryVersion() {
  const baseUrl = import.meta.env.VITE_UPDATE_CDN_BASE_URL;
  const versionUrl = baseUrl + 'version.json';

  let versionData: { version: string; file: string };

  try {
    const response = await fetch(versionUrl);

    // 检查响应是否成功
    if (!response.ok) {
      // 如果响应状态码不是 2xx，抛出错误
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 解析 JSON 响应
    versionData = await response.json();
  } catch (error) {
    console.error('Error fetching version.json:', error);
    // 根据你的需求处理错误，例如抛出或返回默认值
    throw error; // 重新抛出错误以便上层捕获
  }

  const { version, file } = versionData;
  return { version, file: baseUrl + file };
}

// 版本比较函数
function compareVersions(
  current: string,
  latest: string
): 'up-to-date' | 'outdated' | 'error' {
  try {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (
      let i = 0;
      i < Math.max(currentParts.length, latestParts.length);
      i++
    ) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (currentPart < latestPart) {
        return 'outdated';
      } else if (currentPart > latestPart) {
        return 'up-to-date';
      }
    }

    return 'up-to-date';
  } catch (error) {
    console.error('Version comparison error:', error);
    return 'error';
  }
}

const SettingsContainer: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState>({
    autoSync: false,
    enableSocketConnection: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'up-to-date' | 'outdated' | 'error'
  >('idle');
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateDialogInfo, setUpdateDialogInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);

  // 获取插件版本信息
  const getManifestVersion = () => {
    try {
      return (
        (window as any).browser?.runtime?.getManifest?.()?.version || '1.0.11'
      );
    } catch {
      return '1.0.11';
    }
  };

  // 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await (window as any).browser?.storage?.sync?.get([
          'wait',
          'preferences',
        ]);

        if (result) {
          setSettings({
            autoSync: !result.wait?.isSyncWait,
            enableSocketConnection: !result.preferences?.disabled,
          });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // 保存设置
  const saveSettings = async (newSettings: SettingsState) => {
    const isSyncWait = !newSettings.autoSync;
    const preferences = { disabled: !newSettings.enableSocketConnection };
    try {
      // 更新preferences中的disabled属性
      await (window as any).browser?.storage?.sync?.set({
        wait: { isSyncWait },
        preferences: preferences,
      });
      setSettings(newSettings);
      const wait = await (window as any).browser?.storage?.sync?.get(['wait']);
      console.log('wait', wait);
      console.log('设置已保存', preferences);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleToggle = (key: keyof SettingsState) => {
    const newSettings = {
      ...settings,
      [key]: !settings[key],
    };
    saveSettings(newSettings);
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('checking');

    try {
      const latestVersionInfo = await queryVersion();
      setLatestVersion(latestVersionInfo);

      const currentVersion = getManifestVersion();
      const status = compareVersions(currentVersion, latestVersionInfo.version);
      setUpdateStatus(status);

      if (status === 'outdated') {
        setUpdateDialogInfo({
          currentVersion,
          latestVersion: latestVersionInfo.version,
        });
        setShowUpdateDialog(true);
      } else if (status === 'up-to-date') {
        alert('当前已是最新版本！');
      } else {
        alert('版本检查失败，请稍后重试');
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus('error');
      alert('检查更新失败，请检查网络连接');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // 获取版本状态显示文本
  const getVersionStatusText = () => {
    const currentVersion = getManifestVersion();

    if (updateStatus === 'checking') {
      return '检查中...';
    } else if (updateStatus === 'outdated' && latestVersion) {
      return `可更新至 v${latestVersion.version}`;
    } else if (updateStatus === 'up-to-date') {
      return '已是最新版本';
    } else if (updateStatus === 'error') {
      return '检查失败';
    } else {
      return '';
    }
  };

  // 获取版本状态颜色
  const getVersionStatusColor = () => {
    if (updateStatus === 'checking') {
      return 'text-muted-foreground';
    } else if (updateStatus === 'outdated') {
      return 'text-orange-600';
    } else if (updateStatus === 'up-to-date') {
      return 'text-green-600';
    } else if (updateStatus === 'error') {
      return 'text-red-600';
    } else {
      return 'text-muted-foreground';
    }
  };

  // 获取版本检查按钮文本
  const getVersionCheckButtonText = () => {
    if (isCheckingUpdate) {
      return '检查中...';
    } else if (updateStatus === 'outdated') {
      return '下载更新';
    } else {
      return '检查更新';
    }
  };

  // 处理版本检查/下载按钮点击
  const handleVersionAction = () => {
    if (updateStatus === 'outdated' && latestVersion) {
      downloadPlugin();
    } else {
      handleCheckUpdate();
    }
  };

  async function downloadPlugin() {
    if (latestVersion?.file) {
      window.open(latestVersion.file, '_blank');
    }
  }

  // 处理下载确认
  const handleDownloadConfirm = () => {
    downloadPlugin();
    setShowUpdateDialog(false);
    setUpdateDialogInfo(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <div className="text-foreground">加载设置中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-y-auto">
      {/* 头部 */}
      <div className="bg-background px-6 py-4">
        <h1 className="text-xl font-semibold ">⚙️ 插件设置</h1>
        <p className="text-muted-foreground text-sm mt-1">
          配置您的插件偏好设置
        </p>
      </div>

      {/* 设置内容 */}
      <div className="p-6 space-y-6">
        {/* 简历同步设置 */}
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <span className="mr-2">📄</span>
              简历同步设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 自动同步开关 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-medium text-foreground">
                  浏览简历自动入库
                </div>
                <div className="text-sm text-muted-foreground">
                  自动将浏览的简历同步到人才库中
                </div>
              </div>
              <Switch
                checked={settings.autoSync}
                onCheckedChange={() => handleToggle('autoSync')}
              />
            </div>

            {/* 后端通信开关 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-medium text-foreground">
                  后端通信
                </div>
                <div className="text-sm text-muted-foreground">
                  启用与后端服务器的数据通信功能
                </div>
              </div>
              <Switch
                checked={settings.enableSocketConnection}
                onCheckedChange={() => handleToggle('enableSocketConnection')}
              />
            </div>

            {/* 确认提示开关 */}
            {/* <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">同步前确认提示</div>
                <div className="text-sm text-muted-foreground">
                  在同步简历前显示确认弹窗
                </div>
              </div>
              <Switch
                checked={settings.showPrompt}
                onCheckedChange={() => handleToggle("showPrompt")}
              />
            </div> */}
          </CardContent>
        </Card>

        {/* 版本信息 */}
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <span className="mr-2">📱</span>
              版本信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">当前版本</span>
              <span className="font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                v{getManifestVersion()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">版本状态</span>
                <span className={`text-sm ${getVersionStatusColor()}`}>
                  {getVersionStatusText()}
                </span>
              </div>
              <Button
                onClick={handleVersionAction}
                size="sm"
                disabled={isCheckingUpdate}
                variant={updateStatus === 'outdated' ? 'default' : 'outline'}
              >
                {getVersionCheckButtonText()}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 帮助信息 */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="">
            <div className="flex items-start">
              <span className="text-primary mr-2">💡</span>
              <div className="text-sm">
                <div className="font-medium mb-2 text-foreground">使用提示</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• 启用自动同步后，浏览简历时将自动触发同步</li>
                  <li>• 如遇问题，请检查是否已登录 tip.mesoor.com</li>
                  <li>• 定期检查更新以获取最新功能和安全修复</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 更新确认对话框 */}
      <AlertDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <span className="mr-2">🔄</span>
              发现新版本
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>发现新版本可用！</p>
              <div className="bg-muted p-3 rounded-md space-y-1">
                <div className="flex justify-between">
                  <span>当前版本：</span>
                  <span className="font-mono">
                    v{updateDialogInfo?.currentVersion}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>最新版本：</span>
                  <span className="font-mono text-primary">
                    v{updateDialogInfo?.latestVersion}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                建议更新到最新版本以获得最佳体验和最新功能。
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>稍后再说</AlertDialogCancel>
            <AlertDialogAction onClick={handleDownloadConfirm}>
              立即下载
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SettingsContainer;
