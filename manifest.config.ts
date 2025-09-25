import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  icons: {
    48: 'public/logo.png',
  },
  permissions: [
    'activeTab',
    'tabs',
    'scripting',
    'windows',
    'webRequest',
    'webNavigation',
    'sidePanel',
    'declarativeNetRequest',
    'downloads',
    'desktopCapture',
    'cookies',
    'storage',
  ],
  host_permissions: [
    '<all_urls>',
    '*://*.mesoor.com/*',
    '*://*.nadileaf.com/*',
  ],
  action: {
    default_icon: {
      48: 'public/logo.png',
    },
    // default_popup: "src/popup/index.html", // 使用side panel
  },
  content_scripts: [
    {
      js: ['src/content/main.tsx'],
      matches: [
        '*://*.lagou.com/*',
        '*://*.zhipin.com/*',
        '*://*.linkedin.com/*',
        '*://*.linkedin.cn/*',
        '*://*.liepin.com/im/showmsgnewpage*',
        '*://*.liepin.com/resume/showresumedetail/*',
        '*://*.zhaopin.com/*',
        '*://*.51job.com/*',
        '*://maimai.cn/*',
        '*://*.58.com/*',
        '*://*.shixiseng.com/*',
        '*://*.duolie.com/*',
        '*://lpt.liepin.com/*',
        '*://*.yupao.com/*',
      ],
    },
    {
      js: ['src/content/broswer-use.js'],
      matches: [
        '*://*.lagou.com/*',
        '*://*.zhipin.com/*',
        '*://*.linkedin.com/*',
        '*://*.linkedin.cn/*',
        '*://h.liepin.com/*',
        '*://lpt.liepin.com/*',
        '*://*.zhaopin.com/*',
        '*://*.51job.com/*',
        '*://maimai.cn/*',
        '*://*.58.com/*',
        '*://*.shixiseng.com/*',
        '*://*.yupao.com/*',
      ],
    },
    {
      matches: [
        // 领英个人主页
        '*://www.linkedin.com/in/*',
        // 猎聘城猎通非沟通页面-解析效果不好，换成json抽取
        // '*://h.liepin.com/resume/showresumedetail/*',
        // 脉脉个人主页
        '*://maimai.cn/profile/detail*',
      ],
      run_at: 'document_end',
      js: ['src/content/sync-html.ts'],
    },
    {
      matches: ['<all_urls>'],
      js: ['src/content/tip.ts'],
    },
  ],
  background: {
    service_worker: 'src/background.js',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidebar/index.html',
  },
});
