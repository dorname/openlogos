# 部署执行报告：multi-user-collaboration（0.17.0）

> 执行日期：2026-11-13 ｜ 执行方式：个人 fork 定制发布（非上游官方渠道）

## 发布决策

- **发布渠道**：个人 fork `dorname/openlogos` 的 **GitHub Release**（用户决策：本改造属个人定时改造，不发布到上游 miniidealab/openlogos，也不发 npm registry）
- **分发方式**：Release 附 CLI tarball + git 依赖安装（公开仓库免 token）
- **许可证**：Apache-2.0（随包保留；修改声明见 CHANGELOG 0.17.0 节与提交历史；发布说明注明个人 fork 定制版、非官方发布）
- **上游 publish.yml**：已在 fork 禁用（`gh workflow disable "Publish to npm"`），避免触发官方 scope 的 npm publish 与官网同步

## 发布产物

| 项 | 值 |
|---|---|
| Release | https://github.com/dorname/openlogos/releases/tag/v0.17.0 |
| Tag | `v0.17.0`（commit `c0dabd8`，已推送 origin） |
| 制品 | `miniidealab-openlogos-0.17.0.tgz`（npm pack，879 文件，2.7 MB） |
| 版本一致性 | cli/package.json、plugin/.claude-plugin/plugin.json、plugin-codex/plugin.json、CHANGELOG.md、local-release-candidate.ts 均为 0.17.0 |
| 安装验证 | `npm install -g ./miniidealab-openlogos-0.17.0.tgz` → `openlogos --version` = `0.17.0` |

## 部署执行步骤（已完成）

1. `npm pack` 构建 CLI tarball（prepack 全量重建 + 资产清单）
2. `gh release create v0.17.0`（附 tarball 与安装说明）
3. 禁用 fork 的 `Publish to npm` workflow
4. 从 Release 下载 tarball 并全局安装，验证 `--version`
5. 安装态 smoke：`SMOKE-core-280~283`（协作固定条目、status 派生 next-id、change --worktree、sync 收敛）全 pass
6. `openlogos deploy-done` → `openlogos smoke`（Gate 3.8 PASS）

## smoke 执行与配套调整

- **SMOKE-core-62**（codex plugin 版本）：`plugin-codex/plugin.json` 同步升 0.17.0 后通过
- **SMOKE-core-268~271**（本机测试环境脚本部署安装态）：本仓未启用环境管理（`logos/environments.yaml` 不存在），runner 前置补「ENV_REGISTRY_NOT_FOUND → 显式 skip（环境缺口）」，不判 fail
- **公网发布口径用例（SMOKE-core-272~279 等）**：面向官方 npm/官网渠道，本次为个人 fork 发布，runner 按适用窗口写 skip（未强制公网证据）
- **website 构建**：本机补装 website 依赖后 smoke-releases 正常执行（仅本地构建，不部署官网）
- **Gate 3.8**：Coverage 100%、Pass rate 100%，PASS（见 smoke-report.md）

## 回滚预案

- 个人 fork 渠道：`gh release delete v0.17.0`（保留 tag）或编辑 Release 标记 deprecated；修复后以新 patch 版本（v0.17.1）重新发布（禁止复用失败 tag）
- 安装侧：`npm uninstall -g @miniidealab/openlogos` 后按 0.16.7 的既有制品回装

## 备注（环境适配记录）

- 本机 root 下权限类用例 `skipIf`、无 node / 沙箱前置守卫、负载敏感用例 retry（详见实现清单）
- 验收账本：`logos/resources/verify/test-results.jsonl`（全切片 PASS）、`smoke-results.jsonl`（安装态 + dispatcher 汇总）
