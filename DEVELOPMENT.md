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
