# 开发环境配置

## VS Code 配置

项目已包含完整的开发环境配置，确保团队成员使用统一的代码风格。

### 自动安装推荐扩展

首次打开项目时，VS Code 会提示安装以下推荐扩展：

- **Prettier** - 代码格式化
- **ESLint** - 代码检查
- **Tailwind CSS** - CSS 智能提示
- **TypeScript** - TS 支持
- **Auto Rename Tag** - HTML 标签自动重命名
- **Path Intellisense** - 路径智能提示

### 自动格式化

已配置以下自动化功能：

- ✅ 保存时自动格式化 (Prettier)
- ✅ 保存时自动修复 ESLint 问题
- ✅ 统一缩进、引号、分号等代码风格

### 代码风格规则

```json
{
  "semi": false, // 不使用分号
  "singleQuote": true, // 使用单引号
  "trailingComma": "es5", // ES5 尾随逗号
  "printWidth": 80, // 行宽 80 字符
  "tabWidth": 2, // 缩进 2 空格
  "arrowParens": "avoid" // 箭头函数参数不加括号
}
```

## 命令行工具

```bash
# 代码检查
npm run lint

# 自动修复代码问题
npm run lint:fix

# 格式化所有代码
npm run format

# 检查代码格式
npm run format:check
```

## 注意事项

1. **首次使用**: 克隆项目后，VS Code 会自动提示安装推荐扩展
2. **代码提交**: 建议提交前运行 `npm run lint` 检查代码质量
3. **团队协作**: 所有配置文件已提交到代码库，确保团队环境一致

---

配置文件说明：

- `.vscode/settings.json` - VS Code 工作区设置
- `.vscode/extensions.json` - 推荐扩展列表
- `.editorconfig` - 跨编辑器配置
- `eslint.config.js` - ESLint 规则配置
- `.prettierrc` - Prettier 格式化规则
- `.prettierignore` - Prettier 忽略文件

# ========================================

# 环境变量说明（新前端 app.mesoor.com 专用配置）

# ========================================

# VITE_DOMAIN_HOST: 系统后端域名，用于 token/storage 初始化（browser.storage.local.env 的默认值）

# VITE_FRONTEND_HOST: 前端跳转域名，实体详情页所在 host（优先级高于 VITE_DOMAIN_HOST）

# - 此配置使用 app.mesoor.com（新前端）

# VITE_ENTITY_ROUTE_MODE: 实体详情页路由模式

# - legacy_query: 旧规则 /entity/{openId}?type={entityType}

# - app_path: 新前端规则 /entity/{entityType}/{openId}

# - 此配置使用 app_path（新前端路由）

# - 客户本地部署建议显式配置，不要依赖 host 推断

# ========================================

## 运行时域名配置（本地/私有部署）

打包产物根目录包含 `config.json`（源文件 `public/config.json`）。部署时**直接修改它即可切换域名，无需重新构建**；留空的字段回退到构建期 `.env.{mode}` 默认值。

```json
{
  "platformBaseUrl": "https://platform.nadileaf.com",
  "userServicePrefix": "/api/user-proxy",
  "tokenCookieName": "platform-access-token",
  "wsServer": "wss://platform-web-extension-use.nadileaf.com",
  "backgroundServerHost": "https://platform-web-extension-use.nadileaf.com",
  "domainHost": "tip-test.nadileaf.com",
  "actionConfigHost": "platform-web-extension-use.nadileaf.com",
  "agentHost": "https://agent.nadileaf.com",
  "updateCdnBaseUrl": "https://cdn-fe.mesoor.com/tip-plugins/mesoor/",
  "sourcingAgentUrl": "https://agent.nadileaf.com/chat/uo6f9m16c0ymkBTR"
}
```

读取逻辑见 `src/utils/runtime-config.ts`：background 启动时 `loadRuntimeConfig()` 只触发加载，读取一律用同步的 `getRuntimeConfig()`（MV3 Service Worker 禁止顶层 await）。

## 鉴权说明（对齐新前端 platform）

扩展**不主动刷新 token**，只被动读取新前端服务端写入的 cookie：

- `platform-access-token`（HttpOnly，`path=/api/user-proxy`，15 分钟）——新前端每次刷新会话时由服务端重设，扩展用 `chrome.cookies` 读取，解析 JWT 取 `tenantAlias/tenantId/sub`。
- 兼容旧的 `access_token` / `token` cookie（优先级更低）。
- cookie 变化（轮换/切租户/登出删除）通过 `chrome.cookies.onChanged` 驱动 `user$`，登出时发出 `null` 断开 WebSocket。
- 不要再让扩展调用 `/auth/web/token/refresh`：该接口是**严格轮换 + 复用即撤销整个会话**，与网页标签并发刷新会导致全员掉线。
