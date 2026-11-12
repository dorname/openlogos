## S44 测试用例：worktree 并行会话（新文件，整文件）

### S44: worktree 并行会话 — 测试用例

> 来源变更：multi-user-collaboration。前置项目形态：launched、git 仓库、`.worktrees/` 已在固定条目；每条用例执行前后对项目全部文件做 SHA-256 快照断言零残留。

#### 一、单元测试（UT）

| ID | 描述 | 前置条件 | 操作 | 预期结果 |
|----|------|----------|------|----------|
| UT-S44-01 | --worktree 一条龙创建全量断言 | 干净仓库，主工作区有 `logos/logos.config.json` | 调用 change 层（slug、`--worktree`） | 分支 `openlogos/<slug>` 存在；`.worktrees/<slug>` 检出该分支；worktree 内 AI 资产等效 sync 产物；config 在场（复制自主工作区）；提案目录与 guard（指向该提案）在 worktree 内；主工作区 guard 与提案状态不变 |
| UT-S44-02 | worktree 已有 config 不覆盖 | worktree 内 config 已存在且内容异于主工作区 | 同 UT-S44-01 | config 保持 worktree 原值，不复制 |
| UT-S44-03 | 同名分支已存在零残留 | 分支 `openlogos/<slug>` 已存在 | 同 UT-S44-01 | 稳定错误 `WORKTREE_TARGET_EXISTS`（或既有错误码族）；不建 worktree、不部署资产、不建提案；快照等于执行前 |
| UT-S44-04 | worktree 路径被占用零残留 | `.worktrees/<slug>` 目录已存在非空 | 同 UT-S44-01 | 稳定错误；已建分支被清理；快照等于执行前（除分支清理留痕外无残留） |
| UT-S44-05 | 资产部署中途失败清理 | 注入部署第 N 步失败 | 同 UT-S44-01 | 清理 worktree 与分支后稳定错误；不留半套工作区 |
| UT-S44-06 | 主工作区 guard 隔离不变 | 主工作区 guard 指向提案 a | 创建 worktree 提案 b 后读主工作区 guard | 主工作区 guard 仍指向 a、内容逐字节不变 |
| UT-S44-07 | 同目录双会话 guardConflict 指引 | guard 指向 a（无 --worktree） | 第二 change 调用 slug b | 拒绝语义与错误码不变；文案含 `--worktree`（与 UT-S09-467 同判据、双锚定） |

#### 二、场景测试（ST）

| ID | 描述 | 覆盖 Steps | 前置条件 | 操作序列 | 预期结果 |
|----|------|-----------|----------|----------|----------|
| ST-S44-01 | worktree 会话端到端（创建→内流程→清理） | S44 Step 1→4 | 隔离 launched git 项目 | ① `openlogos change <slug> --worktree`；② 在 `.worktrees/<slug>` 内执行 `openlogos status --format json`；③ `git worktree remove` + 删分支 | ① exit 0 且输出「从 .worktrees/<slug> 启动新会话」指引；② 正常输出、`active_change` 为该 slug（以 worktree 为项目根）；③ 清理后 `git worktree list` 无该项、`.worktrees/` 为空 |
| ST-S44-02 | 创建失败端到端零残留 | EX-44.1 | 同名分支已存在 | ① `openlogos change <slug> --worktree`；② 全项目快照 | ① 稳定错误 + 处置指引；② 快照与执行前一致 |

#### 三、测试数据与断言要求

- worktree 断言一律以 `.worktrees/<slug>` 为项目根（cwd 切入后执行），不得用主工作区路径断言会话内行为；
- 「零残留」= 主工作区 + git 分支列表 + `git worktree list` 三方与执行前一致（临时分支清理本身除外）；
- config 复制断言逐字节相等（本地机器状态整体复制，不做字段级合并）。

#### 四、覆盖度校验

- EX-44.1→UT-S44-03/04、ST-S44-02；EX-44.2→UT-S44-05；EX-44.3→UT-S44-01/02；EX-44.4→UT-S44-07；EX-44.5→ST-S44-01 ③ 清理路径；S44-AC-01→UT-S44-07、AC-02→UT-S44-01~05/ST-S44-01、AC-03→ST-S44-01 ②、AC-04→ST-S44-01 ③。
