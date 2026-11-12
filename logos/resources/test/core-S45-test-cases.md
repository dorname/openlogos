## S45 测试用例：跨 clone 汇合与编号唯一性（新文件，整文件）

### S45: 跨 clone 汇合与编号唯一性 — 测试用例

> 来源变更：multi-user-collaboration。前置项目形态：launched、git 仓库；跨 clone 用例以两个一次性工作副本 + 本地 bare 仓库模拟远端（cloneA 先推、cloneB 后合）。

#### 一、单元测试（UT）

| ID | 描述 | 前置条件 | 操作 | 预期结果 |
|----|------|----------|------|----------|
| UT-S45-01 | 派生取号公式三分支 | 已落盘集合分别构造：configured 缺失 / configured 落后 / configured 领先 | 调用派生取号 | 三分支均 `max(configured ?? 0, max已落盘+1)`；configured 领先时取 configured（下限语义） |
| UT-S45-02 | 编号落盘定稿与引用改写 | 已落盘 max=S46；delta 拟用 S46，正文含 `# S46` 标题与 `UT-S46-01`/`ST-S46-01` 引用 | 执行定稿 | 落盘 S47；deltas 内文件名、标题、`UT-S46-*`/`ST-S46-*` 引用确定性改写；输出改写清单 |
| UT-S45-03 | 收敛重排：同号异 slug 检出与改写 | 已落盘 `core-S44-a`（origin 可见）；本地未推送 `pay-S44-b`（含 `UT-S44-01` 引用） | 执行 sync 收敛 | 本地工件重排 `pay-S45-b`：文件名、`# S45` 标题、`UT-S44-*`→`UT-S45-*` 改写；`core-S44-a` 逐字节不变（origin 冻结） |
| UT-S45-04 | 重排 diff 清单输出 | 同 UT-S45-03 | 读取收敛输出 | 逐文件列出改动（旧值→新值），供人工过目 |
| UT-S45-05 | 文法外歧义引用 fail-closed | 待重排工件正文含散文「见 S44」（注册文法外歧义形态） | 执行 sync 收敛 | 稳定错误报告位置清单；全部改动不落盘（无半套重排） |
| UT-S45-06 | counter 不写回 yaml | yaml 含旧 `scenario_counter` | 执行取号与 sync | yaml counter 行逐字节不变；取号走派生值 |
| UT-S45-07 | status JSON 派生 next-id | 已落盘 max：S43/F08/D15 | `openlogos status --format json` | 输出 `next_scenario_id: 44`、`next_feature_id: 9`、`next_decision_id: 16`（派生字段 additive） |
| UT-S45-08 | index 重建收口 | 重排后 resource_index 含旧条目 | 执行 sync 收敛 | resource_index 自动重建（`openlogos index` 等效），无需人工调用 |
| UT-S45-09 | merge preflight fetch 检查双分支 | origin 目标文档分别领先 / 一致 | 执行 preflight | 领先→稳定错误提示先 pull；一致→放行；fetch 失败→警告放行（与 UT-S09-468/469 同判据、双锚定） |
| UT-S45-10 | 锚失效报错增强 | 锚 0 命中且 origin blob 异于本地 | 触发锚解析失败 | 报错含 origin 新版本与被改小节上下文（与 UT-S09-472 同判据、双锚定） |
| UT-S45-11 | 重排幂等 | 已完成一次收敛 | 再次执行 sync 收敛 | 无可重排项；资源与 yaml 快照不变 |

#### 二、场景测试（ST）

| ID | 描述 | 覆盖 Steps | 前置条件 | 操作序列 | 预期结果 |
|----|------|-----------|----------|----------|----------|
| ST-S45-01 | 双 clone 撞号端到端 | S45 Step 1→5 | cloneA/cloneB 同源 bare 仓库；两边各起一个含新场景的提案 | ① A：merge→push；② B：merge（同基线定稿同号）；③ B：`openlogos sync`（按提示 pull --rebase）→ 重排 → index 重建；④ B：push | ① A 落盘 `core-S44-a`；② B 本地落盘 `pay-S44-b`；③ 后 B 工件变 `pay-S45-b` 且输出 diff 清单、`core-S44-a` 不变；④ push 无冲突、无 counter 行冲突（yaml 无写回） |
| ST-S45-02 | 同文档冲突恢复重放端到端 | S45 Step 6、EX-45.4 | A 与 B 的 delta 触达同一主文档同一节；A 先 push 且改了节标题 | ① B：merge（旧 view 成功）；② B：pull → git 冲突；③ B：`git checkout` 该文档至 origin 版完成 pull；④ B：重放 `openlogos merge` → 锚失效报错（含 origin 上下文）；⑤ B：基于新 view 重写 delta 再重放 | ④ 稳定错误指引重写；⑤ 落盘成功且基于新 view；全程未手工缝合冲突标记 |
| ST-S45-03 | 离线收敛端到端 | EX-45.3 | 无远端访问（bare 路径移除） | ① B：`openlogos sync` | 本地重排与 index 重建照常；fetch 相关仅警告；exit 0 |

#### 三、测试数据与断言要求

- 「origin 可见 = 冻结」断言：重排前后对比 bare 侧对象字节（通过 `git cat-file`），必须逐字节相等；
- 重排断言覆盖注册文法全族：文件名、`# SXX` 标题、`UT-*`、`ST-*`、`SMOKE-*`、`DXX`、`FXX`；
- counter 断言同时验证「不写回」与「兼容读取作下限」两个方向（UT-S45-01 × UT-S45-06）。

#### 四、覆盖度校验

- EX-45.1→UT-S45-05；EX-45.2→文档化惯例（防御报告路径，不设自动改写用例）；EX-45.3→UT/ST-S45-03；EX-45.4→UT-S45-10/ST-S45-02；EX-45.5→文档化惯例；EX-45.6→UT-S45-01/06；S45-AC-01→UT-S45-02、AC-02→UT-S45-03/04、AC-03→UT-S45-05、AC-04→UT-S45-01/06/07、AC-05→ST-S45-02、AC-06→UT-S45-09、AC-07→UT-S40-30~33/ST-S40-16。
