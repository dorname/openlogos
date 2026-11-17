# OpenLogos CLI（团队协作个人版）

> **这是一个个人开发版（personal fork），不是官方版本。**
>
> 本包基于开源项目 [openlogos](https://github.com/miniidealab/openlogos)（Apache-2.0）改造而来，在官方能力之上**增加了团队协作特性**：单人多分支并行会话、多人跨 clone 汇合、编号冲突自动消解。
> 官方包是 [`@miniidealab/openlogos`](https://www.npmjs.com/package/@miniidealab/openlogos)；本包是 [`@dorname/openlogos`](https://www.npmjs.com/package/@dorname/openlogos)。两者互不替代，请按需选择。

**一句话**：想用原汁原味的 openlogos → 装官方包；想同时开多个 AI 会话、或多人 clone 同一仓库并行开发 → 装本包。

---

## 目录

- [我该装哪个包](#我该装哪个包)
- [相对官方 openlogos 多了什么](#相对官方-openlogos-多了什么)
- [团队协作：单人多分支（同一仓库，多个 AI 会话）](#团队协作单人多分支同一仓库多个-ai-会话)
- [团队协作：多人跨 clone（多个人，同一仓库）](#团队协作多人跨-clone多个人同一仓库)
- [协作专用命令速查](#协作专用命令速查)
- [冲突会怎么处理](#冲突会怎么处理)
- [安装](#安装)
- [常用命令](#常用命令)
- [OpenCode 用户](#opencode-用户)
- [可运行示例](#可运行示例)
- [版本信息与升级](#版本信息与升级)
- [License](#license)

---

## 我该装哪个包

| | 官方 `@miniidealab/openlogos` | 本包 `@dorname/openlogos` |
|---|---|---|
| 方法论与 AI Skills | ✅ | ✅（与官方同源） |
| 阶段检测 / verify 验收 / 变更提案 | ✅ | ✅ |
| **单人多分支并行（worktree 会话）** | ❌ | ✅ |
| **多人跨 clone 汇合与编号消解** | ❌ | ✅ |
| 维护者 | openlogos 官方团队 | 个人（dorname） |
| 版本节奏 | 跟随官方 | 独立 |

两个包**可以共存**（npm 包名不同），但它们都会安装 `openlogos` 这个命令，后装的会覆盖前一个的命令入口。因此建议二选一：

```bash
# 想用协作能力（本包）
npm install -g @dorname/openlogos

# 或想用官方原版
npm install -g @miniidealab/openlogos
```

已装过官方包、现在换到本包：

```bash
npm uninstall -g @miniidealab/openlogos
npm install -g @dorname/openlogos
openlogos --version    # 0.17.2+
```

> 本包与上游官方仓库无隶属关系，名称、图标、官网归属均属官方项目；本包仅在其基础上做协作能力增强。

---

## 相对官方 openlogos 多了什么

| 能力 | 说明 |
|---|---|
| **单人多分支并行** | `openlogos change <slug> --worktree` 一条龙创建独立工作区 + 短期分支，多个 AI 会话互不干扰地推进多个提案 |
| **多人跨 clone 汇合** | 两人从同一基线各自提案，编号必然撞号——本包在落盘时自动定稿、push 前自动重排到空号 |
| **编号冲突自动消解** | `scenario_counter` 等计数器改为派生（不再写回 yaml），撞号由机制消解而非人工协调 |
| **本地状态隔离** | guard 锁、运行时目录、worktree 会话目录、同步戳一律不入库，从根上消除多人互写 |
| **协作缺陷修复** | 双 worktree 提交后 merge-back 的时间戳冲突；`next_scenario_id` 未按已落盘场景派生 |

---

## 团队协作：单人多分支（同一仓库，多个 AI 会话）

**场景**：你在同一个仓库里想同时推进两个提案——比如提案 A 在等人类确认，同时开另一个 AI 会话做提案 B。

**问题**：同一目录里 CLI 的「工作目录锁（guard）」是单锁语义，第二个会话直接建提案会被拒绝（这是刻意保留的正确行为）。

**本包的解法**：每个会话开一个独立的 git worktree（独立目录 + 独立短期分支），锁、提案、代码天然隔离。

### 完整流程

**第 1 步 · 开两个并行会话**

```bash
# 会话 A
openlogos change feat-login --worktree
# → 分支 openlogos/feat-login，工作区 .worktrees/feat-login
# → 输出："请从 .worktrees/feat-login 启动新会话"

# 会话 B
openlogos change feat-search --worktree
# → 分支 openlogos/feat-search，工作区 .worktrees/feat-search
```

**第 2 步 · 在各自目录里启动 AI 会话**

```bash
cd .worktrees/feat-login    # 会话 A 的 AI 在这里工作
cd .worktrees/feat-search   # 会话 B 的 AI 在这里工作
```

两个会话里的命令行为与主工作区**完全一致**（同一条 `openlogos` 流程、同样的门禁），只是工作目录不同。

**第 3 步 · 各自走完单提案全流程**

```
plan → delta → merge → slice → code → verify
```

**第 4 步 · 依次合回主分支**

```bash
# 主工作区
git merge --no-ff openlogos/feat-login
git merge --no-ff openlogos/feat-search
```

> 两个分支的产物互不重叠时不会冲突。同步时间戳等本地状态已被自动忽略，不会再出现"第二个分支合不进去"。

**第 5 步 · 收敛并清理**

```bash
openlogos sync                                  # 编号收敛 + resource_index 重建
git worktree remove .worktrees/feat-login
git worktree remove .worktrees/feat-search
git branch -D openlogos/feat-login
git branch -D openlogos/feat-search
openlogos archive feat-login
openlogos archive feat-search
```

### 手把手：会话 A 的 AI 在 worktree 里做什么

```bash
cd .worktrees/feat-login
openlogos status                 # 确认 active_change = feat-login
# ... 让 AI 按 change-writer / code-implementor 正常产出 proposal / delta / 代码 / 测试 ...
openlogos verify                 # 验收通过才合回主分支
```

### 同目录第二个会话被拒怎么办

如果你忘了加 `--worktree`：

```
$ openlogos change feat-b
Error: 当前工作目录已有活跃提案 'feat-a'……
并行开发请使用：openlogos change feat-b --worktree
```

按提示加 `--worktree` 即可，**不需要任何额外配置**。

---

## 团队协作：多人跨 clone（多个人，同一仓库）

**场景**：你和同事各自 clone 同一仓库，并行提 PR，最后汇合。

**问题**：两个人基于同一基线各自取号，**必然拿到同一个场景号**（比如都叫 S44）——文件名不同，git 不会报冲突，两份语义会静默合入。

**本包的解法**：把"协调"变成"机制"——落盘时定稿保证本地不撞号，push 前自动重排保证全局不撞号。

### 完整流程

**第 1 步 · 各自 clone 并正常推进**

```bash
git clone <repo-url> && cd <repo>
openlogos status                 # 确认 core 模块是 launched
openlogos change my-feature      # 正常建提案，走完整流程
```

**第 2 步 · 合并到主干（编号自动定稿）**

```bash
git pull --rebase
openlogos merge my-feature
```

合并时如果拟用的编号已被别人占用，CLI 会**自动定稿**为下一个空号，并同步改写本提案内的文件名、标题、`UT-*` / `ST-*` 引用，同时输出改写清单。

**第 3 步 · push 之前先收敛（关键一步）**

```bash
git pull --rebase                # 先同步远端
openlogos sync                   # 收敛：重排 + 重建索引
```

`openlogos sync` 会扫描已落盘全集，检出「同号异 slug」，然后：

- **别人已推送的编号 → 冻结**，绝不改写；
- **你自己还没推送的工件 → 自动重排到空号**（文件名、`# SXX` 标题、`UT-SXX-*` 等全部同步改写）；
- 随后自动重建 `resource_index`。

**第 4 步 · 推送**

```bash
git push
```

**第 5 步 · 同文档冲突了怎么办**

如果两个人改了同一份主文档的同一节，合并前 CLI 会拦住并提示：

```
Error: delta_section_anchor_unresolvable
目标文档在 origin 有新版本、§X 被改动过
恢复路径：基于新 view 重写该 delta 后重放 merge
```

按提示处理（**不要在 git 冲突标记里手工缝合章节**）：

```bash
git pull --rebase                              # 先同步
# 基于新 view 重写 deltas 里的章节锚
openlogos merge my-feature                      # 重放（幂等）
```

---

## 协作专用命令速查

| 命令 | 用在哪 | 作用 |
|---|---|---|
| `openlogos change <slug> --worktree` | 单人多分支 | 创建独立工作区 + 短期分支 + 提案 + 锁 |
| `openlogos status` | 任意 | 看阶段进度、活跃提案、下一步建议 |
| `openlogos next` | 任意 | 输出下一步该做什么（可直接贴给 AI） |
| `openlogos sync` | 多人汇合 / 分支合回后 | 收敛重排 + 重建索引 + 刷新 AI 资产 |
| `openlogos merge <slug>` | 多人汇合 | 合并提案（编号自动定稿） |
| `openlogos verify` | 任意 | 验收；通过后才合回主分支 |
| `openlogos archive <slug>` | 收尾 | 归档提案、释放锁 |
| `openlogos status --format json` | 脚本化 | 取 `next_scenario_id` 等派生字段 |

---

## 冲突会怎么处理

一句话：**能从规则推导出来的冲突，机器自动消解；需要人来判断意图的冲突，机器只负责拦住你并给足上下文。**

| 冲突 | 谁处理 | 行为 |
|---|---|---|
| 场景编号撞号（同基线两人同号） | 🤖 自动 | 落盘定稿 + push 前自动重排到空号 |
| 计数器行冲突 | 🤖 自动 | 计数器已改为派生，根本不再写回 yaml |
| `resource_index` 漂移 | 🤖 自动 | 收敛时整体重建 |
| 本地状态互写（锁、同步戳等） | 🤖 自动 | 固定忽略，永不入库 |
| 两个分支改不同文件 | 🤖 自动 | git 正常合并 |
| 文法外歧义引用（散文里手写"见 S44"） | 🧑 人工 | 整体不落盘，列出位置要求人工消除歧义后重跑 |
| 双方都已推送同号 | 🧑 人工 | 只报告不自动改写（已推送编号冻结），需另开 fix 提案重排 |
| 同一份主文档同一节被两人改 | 🧑 人工 | 阻塞 + 给出 origin 上下文；基于新 view 重写 delta 后重放 |
| `modules[]` / `features[]` 同位置插入 | 🧑 人工 | git 常规合并语义，人工保两侧 |

---

## 安装

需要 **Node.js ≥ 18**。

```bash
npm install -g @dorname/openlogos
openlogos --version
```

离线安装（GitHub Release 附件）：

```bash
npm install -g ./dorname-openlogos-0.17.2.tgz
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `openlogos init [name]` | 初始化项目：`logos.config.json`、`logos-project.yaml`、`AGENTS.md` / `CLAUDE.md`、Skills 与方法论 `spec/` 等 |
| `openlogos sync` | 按当前配置重新生成 AI 指令文件并同步 Skills（多人汇合后必跑） |
| `openlogos status` | 查看方法论阶段进度与下一步建议 |
| `openlogos next` | 输出下一阶段的引导提示 |
| `openlogos verify` | 读取测试结果 JSONL 与测试用例文档，生成验收报告 |
| `openlogos change <slug>` | 创建变更提案（Delta 工作流） |
| `openlogos change <slug> --worktree` | 创建变更提案并开独立并行会话（见协作章节） |
| `openlogos merge` / `archive` | 合并与归档变更 |
| `openlogos launch` | 从首轮开发切换到「活跃迭代」并强化变更管理 |
| `openlogos module <sub>` | 管理项目模块（list / add / rename / remove） |

**注意**：请在**项目根目录**（存在 `logos/logos.config.json`）下执行上述命令。

---

## OpenCode 用户

使用 OpenCode 时建议安装**最新版本的本包**，以便获得 `.opencode/commands/` 斜杠命令模板与单包插件部署。说明见仓库内 [OpenCode 使用指南](https://github.com/dorname/openlogos/blob/team/docs/opencode.md)。

---

## 可运行示例（需克隆仓库）

- **FlowTask**（Tauri，Claude Code 演示）：`examples/flowtask/`
- **Money Log**（Electron，OpenCode 演示）：`examples/money-log/`

详见仓库 [examples/README.md](https://github.com/dorname/openlogos/blob/team/examples/README.md)。

---

## 版本信息

npm 页展示的**当前包版本**以本页顶部包名为准；**历史版本与变更说明**请以仓库 [CHANGELOG.md](https://github.com/dorname/openlogos/blob/team/CHANGELOG.md) 为准。

- 源码与完整文档：[github.com/dorname/openlogos](https://github.com/dorname/openlogos)
- 上游官方项目：[github.com/miniidealab/openlogos](https://github.com/miniidealab/openlogos)

---

## License

Apache-2.0
