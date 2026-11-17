# OpenLogos

[English](./README.en.md)

> [!IMPORTANT]
> **本仓库是 openlogos 的个人开发版（personal fork），不是官方仓库。**
>
> 基于开源项目 [miniidealab/openlogos](https://github.com/miniidealab/openlogos)（Apache-2.0）改造，**增加了团队协作特性**：单人多分支并行会话、多人跨 clone 汇合、编号冲突自动消解。
> npm 包名 [`@dorname/openlogos`](https://www.npmjs.com/package/@dorname/openlogos)（官方包为 [`@miniidealab/openlogos`](https://www.npmjs.com/package/@miniidealab/openlogos)），两者互不替代。
> 协作能力详解见 [团队协作](#团队协作) 章节与 [cli/README.md](./cli/README.md)。

<p align="center">
  <img src="./logos/resources/reference/openlogos-index.png" alt="OpenLogos 首页展示图" width="1200" />
</p>

**面向 AI 时代的开源软件研发方法论。**

> OpenLogos 定义标准，RunLogos 让它更高效地落地。

## 什么是 OpenLogos？

OpenLogos 是一套面向 AI 时代的软件研发方法论，用来约束和引导 AI 参与真实软件项目的完整过程。

它反对直接把 AI 当作“代码自动生成器”使用，而是强调先明确：

- 为什么做
- 做什么
- 如何做

OpenLogos 把这套过程沉淀为可执行的规范、Skills、CLI 命令和验收规则，让 AI 在项目里沿着正确轨道推进，而不是把项目带向失控的 Vibe Coding。

## OpenLogos 与 RunLogos

**OpenLogos 定义标准。RunLogos 让标准更好落地。**

- **OpenLogos** 是开源方法论，提供研发流程、AI Skills、CLI 工具和规范文档
- **RunLogos** 是构建在 OpenLogos 之上的专业桌面工具，用来把 AI 生成的文档、API、DB、测试与变更结果变成可视化、可编辑、可编排、可调试的工作空间

OpenLogos 可以独立工作，兼容多种 AI 编码工具。  
RunLogos 则是它的效率增强层，适合需要更强可视化编辑、API 编排调试和结构化评审体验的团队或个人。

了解更多：

- OpenLogos 官网：[openlogos.ai](https://openlogos.ai)
- RunLogos 国际站：[runlogos.com](https://runlogos.com)
- RunLogos 中国站：[runlogos.cn](https://runlogos.cn)

### RunLogos 站点选择

- **`runlogos.com`**：面向国际用户
- **`runlogos.cn`**：面向中国区用户

两者对应同一产品体系，但会根据不同区域用户提供更合适的访问入口与信息。

## 核心工作流

```text
WHY  -> 需求文档
WHAT -> 产品设计
HOW  -> 技术架构 -> 场景建模 -> API / DB -> 测试设计 -> 代码实现 -> 验收验证
```

核心原则：

- **反 Vibe Coding**：AI 负责执行，人负责判断
- **场景驱动**：从真实业务场景推导实现方案
- **测试先行**：测试不是补充材料，而是开发规格的一部分
- **变更可追溯**：通过 proposal / merge / archive 管理迭代

## 全自动流程（Flow 引擎）

从 `0.11` 起，OpenLogos 把整个变更生命周期建模为一台**声明式状态机**（flow 引擎），作为唯一事实源——`status` / `next` / `watch` 都从它被动派生「下一步该做什么」。launched 项目的每次变更沿固定链路推进：

```text
plan（方案）→ spec（规格/delta）→ merge（合并）→ slice（切片规划）
  → implement（实现·切片循环 ↻）→ deliver（verify/部署/smoke）→ close（归档/push）
```

**两档授权：**

- **半自动（默认）**：merge、verify、部署、smoke、archive、push 都是人类确认点。
- **全自动 / 无人值守（`openlogos next --auto`）**：一次授权即让提案全链路自动跑到底，自动放行可跳过的门，代码转绿后自动执行 verify / smoke / archive / push，并把每次放行追加到 `GATE_AUTO_PASSED` 审计轨迹。

**硬红线（安全底座）**：implement 段对代码切片循环，直到测试转绿；达迭代上限仍未收敛会升级为不可跳过的 `loop-exhausted` 门。**任何模式——即便 `--auto`——都绝不自动放行未通过测试的代码。**

```bash
openlogos change add-dark-mode     # 创建变更提案
openlogos next --auto              # 一条命令，无人值守跑完整条链路
openlogos flow show --resolved     # 查看应用 overlay 后的真实编排
openlogos watch                    # 流式查看实时派生状态
```

深入了解：[可编排研发流程](https://openlogos.ai/deep-dive/orchestratable-flow)

## 安装与前置条件

### 第一步：安装 OpenLogos CLI

需要 `Node.js >= 18`。

```bash
npm install -g @dorname/openlogos
openlogos --version
```

CLI 包说明见 [cli/README.md](./cli/README.md)。

### 第二步：安装宿主 AI 工具

OpenLogos 本身提供方法论、Skills、规范和 CLI，但 `agent` / 插件 / 命令面板是否可见，取决于你使用的宿主 AI 工具是否已正确安装并完成登录。

## 快速开始

```bash
openlogos init my-project
cd my-project
openlogos status
openlogos next
```

一个典型流程通常是：

1. 用 `openlogos init` 初始化项目
2. 让 AI 按当前 Phase 逐步补齐文档与设计
3. 用 `openlogos status` / `openlogos next` 检查进度和下一步动作
4. 按场景实现代码与测试，并写入 OpenLogos reporter
5. 用 `openlogos verify` 生成验收结果
6. 首轮开发完成后，用 `openlogos launch` 进入活跃迭代阶段
7. 后续迭代通过 `openlogos change <slug>`、`merge`、`archive` 管理

## 支持的 AI 工具

OpenLogos 当前已支持：

| 工具 | 集成方式 |
|------|----------|
| Cursor | `AGENTS.md` + `.cursor/rules/` |
| Claude Code | 原生插件或 `CLAUDE.md` |
| OpenCode | 原生插件 + `.opencode/commands/`，或 `AGENTS.md` |
| Codex | 原生插件模式（`.codex-plugin/` + `.codex/config.toml`）+ `AGENTS.md` 兜底 |

补充说明：

- Codex 已是一等集成能力，可自动部署 `.agents/skills/`、`.codex-plugin/` 和 `.codex/config.toml`
- OpenLogos Skills 本身是平台无关的 Markdown 规范，因此也具备较强的跨工具兼容性

### AI 工具安装前置条件

如果宿主 AI 工具本身没有安装好、没有登录成功，或者没有完全重启，OpenLogos 部署出来的 Skills / 插件 / agent 面板通常不会正常显示。

建议至少确认以下几点：

| 工具 | 需要先满足的条件 |
|------|------------------|
| Cursor | 已安装 Cursor 桌面端；可正常打开项目；允许读取项目根目录下的 `AGENTS.md` 与 `.cursor/rules/`；若规则未生效，重启 Cursor 或重新打开项目窗口 |
| Claude Code | 已安装 Claude Code；当前终端可正常启动；插件市场可用；安装或同步完成后重启 Claude Code，确保插件与 agent 面板重新加载 |
| OpenCode | 已安装 OpenCode；终端中可执行 `opencode`；项目根目录启动；`openlogos sync` 后重启 OpenCode，确保 `.opencode/plugins/` 与 `.opencode/commands/` 被重新加载 |
| Codex | 已安装 Codex CLI；当前终端可正常启动 `codex`；项目内允许读取 `.codex/config.toml` 与 `.codex-plugin/`；同步完成后重启会话，确保 hooks 与 `.agents/skills/` 生效 |

通用建议：

- 先安装并确认 `openlogos` CLI：`npm install -g @dorname/openlogos`
- 再安装对应 AI 工具本体，并确认命令可在当前终端环境中执行
- 在项目根执行 `openlogos init` 或 `openlogos sync`
- 最后完全退出并重新打开 AI 工具

推荐顺序：

1. 安装 `openlogos` CLI
2. 安装并登录宿主 AI 工具
3. 在项目根执行 `openlogos init` 或 `openlogos sync`
4. 完全重启宿主工具，检查 Skills / 插件 / agent 面板是否出现

如果 agent / 插件面板仍不显示，优先检查：

- AI 工具是否已登录
- CLI 是否在当前终端 `PATH` 中
- 是否在项目根目录启动
- 同步后是否真正重启了工具

## 核心 CLI 命令

| 命令 | 说明 |
|------|------|
| `openlogos init [name]` | 初始化项目 |
| `openlogos sync` | 重新生成 AI 指令文件与 Skills |
| `openlogos status` | 查看当前阶段进度 |
| `openlogos next [--auto]` | 输出下一步建议；`--auto` 为全自动无人值守模式 |
| `openlogos watch` | 流式查看实时派生的研发流程状态 |
| `openlogos flow show` | 查看 flow 编排（`--resolved` 应用 overlay） |
| `openlogos verify` | 生成测试验收报告 |
| `openlogos deploy-done` | 部署完成后受控落标 |
| `openlogos launch` | 从首轮开发切换到活跃迭代 |
| `openlogos change <slug>` | 创建变更提案 |
| `openlogos merge <slug>` | 合并提案 deltas |
| `openlogos archive <slug>` | 归档已完成提案 |
| `openlogos module list/add/rename/remove` | 管理多模块项目 |

注意：以上命令应在项目根目录执行，也就是 `logos/logos.config.json` 所在目录。

## 团队协作

> 本 fork 的核心增量。两种形态：**单人多分支**（同一仓库开多个 AI 会话）与**多人跨 clone**（多个人并行开发同一仓库）。
> 完整图文版见 [cli/README.md](./cli/README.md#团队协作单人多分支同一仓库多个-ai-会话)。

### 相对官方 openlogos 多了什么

| 能力 | 说明 |
|---|---|
| **单人多分支并行** | `openlogos change <slug> --worktree` 一条龙创建独立工作区 + 短期分支，多个 AI 会话互不干扰地推进多个提案 |
| **多人跨 clone 汇合** | 两人从同一基线各自提案必然撞号——本包在落盘时自动定稿、push 前自动重排到空号 |
| **编号冲突自动消解** | 计数器改为派生（不再写回 yaml），撞号由机制消解而非人工协调 |
| **本地状态隔离** | guard 锁、运行时目录、worktree 会话目录、同步戳一律不入库，从根上消除多人互写 |

### 单人多分支（同一仓库，多个 AI 会话）

同一目录的第二个会话会被工作目录锁拒绝（刻意保留的正确行为）。要用并行，就给每个会话开一个独立 git worktree：

```bash
# 会话 A
openlogos change feat-login --worktree
# → 分支 openlogos/feat-login，工作区 .worktrees/feat-login
# → 提示："请从 .worktrees/feat-login 启动新会话"

# 会话 B
openlogos change feat-search --worktree
```

然后在各自目录里启动 AI 会话，走**完全一致**的单提案全流程：

```
cd .worktrees/feat-login     # 会话 A 的 AI 在这里工作
openlogos status             # 确认 active_change = feat-login
# ... plan → delta → merge → slice → code → verify ...
```

各自 verify 通过后，依次合回主分支并清理：

```bash
# 主工作区
git merge --no-ff openlogos/feat-login
git merge --no-ff openlogos/feat-search
openlogos sync                                  # 编号收敛 + index 重建
git worktree remove .worktrees/feat-login
git worktree remove .worktrees/feat-search
git branch -D openlogos/feat-login
git branch -D openlogos/feat-search
openlogos archive feat-login
openlogos archive feat-search
```

### 多人跨 clone（多个人，同一仓库）

各自 clone 后正常推进；**push 前必须先收敛**，否则同基线的两人会拿到同一个场景号：

```bash
# 你的分支
openlogos merge my-feature      # 编号自动定稿（被占则改写到下一个空号）
git pull --rebase               # 先同步远端
openlogos sync                  # 收敛：重排本人未推送工件 + 重建索引
git push
```

`openlogos sync` 的收敛规则：**别人已推送的编号冻结不改写**，**你自己未推送的工件自动重排到空号**（文件名、标题、`UT-SXX-*` 引用同步改写）。

### 冲突怎么处理

| 冲突 | 谁处理 | 行为 |
|---|---|---|
| 场景编号撞号 | 🤖 自动 | 落盘定稿 + push 前自动重排 |
| 计数器行冲突 | 🤖 自动 | 计数器已派生，不再写回 yaml |
| `resource_index` 漂移 | 🤖 自动 | 收敛时整体重建 |
| 本地状态互写 | 🤖 自动 | 固定忽略，永不入库 |
| 文法外歧义引用 | 🧑 人工 | 整体不落盘，列出位置要求人工消除歧义 |
| 双方都已推送同号 | 🧑 人工 | 只报告不改写（已推送编号冻结） |
| 同一份主文档同一节被两人改 | 🧑 人工 | 阻塞并给出 origin 上下文；基于新 view 重写 delta 后重放 merge |

## 可运行示例

仓库内提供了两个完整示例：

- [examples/flowtask](./examples/flowtask/README.md)：Tauri 桌面应用，侧重 Claude Code 集成
- [examples/money-log](./examples/money-log/README.md)：Electron 桌面应用，侧重 OpenCode 集成

总览见 [examples/README.md](./examples/README.md)。

## 仓库结构

```text
openlogos/
├── cli/              # OpenLogos CLI
├── skills/           # 平台无关的 AI Skills
├── spec/             # 方法论规范源码
├── docs/             # 工具与使用文档
├── plugin/           # Claude Code 插件
├── plugin-codex/     # Codex 插件模板
├── plugin-opencode/  # OpenCode 插件模板
└── examples/         # 可运行示例项目
```

## `openlogos init` 后的项目结构

```text
your-project/
├── AGENTS.md
├── CLAUDE.md                # 适用时生成
├── logos/
│   ├── logos.config.json
│   ├── logos-project.yaml
│   ├── resources/
│   ├── changes/
│   └── spec/
└── src/
```

OpenLogos 会把方法论资产集中在 `logos/` 目录中，尽量减少对现有代码结构的侵入。

## 许可证

- 代码与规范：[Apache License 2.0](./LICENSE)
- 文档与教程：[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## 链接

- 本 fork（个人开发版）：[github.com/dorname/openlogos](https://github.com/dorname/openlogos) ｜ npm：`@dorname/openlogos`
- 上游官方项目：[github.com/miniidealab/openlogos](https://github.com/miniidealab/openlogos) ｜ npm：`@miniidealab/openlogos`
- 官网：[openlogos.ai](https://openlogos.ai)
- RunLogos 国际站：[runlogos.com](https://runlogos.com)
- RunLogos 中国站：[runlogos.cn](https://runlogos.cn)
- OpenCode 指南：[docs/opencode.md](./docs/opencode.md)
- CLI 说明（含团队协作完整指南）：[cli/README.md](./cli/README.md)
