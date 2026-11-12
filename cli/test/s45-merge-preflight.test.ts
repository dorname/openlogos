/**
 * multi-user-collaboration [code] 切片 2：merge preflight 三查与编号定稿。
 *
 * 覆盖 UT-S09-468～472、ST-S09-206、ST-S09-207、UT-S45-02、UT-S45-09、UT-S45-10、ST-S45-02
 * （与 logos/resources/test/core-S09-test-cases.md / core-S45-test-cases.md 对齐）。
 * - UT 以 exec 注入（fetch/diff 哨兵）或 skipFetch 的纯文件系统项目驱动 runCollabPreflight；
 * - ST 走真实 CLI（cli/dist/index.js）+ 本地 bare 仓库模拟 origin。
 * 结果由全局 OpenLogos reporter 写入 logos/resources/verify/test-results.jsonl。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempRoot, scaffoldProject, mergeAdmissibleProposal, mergeAdmissibleTasks, registerCoreModule } from './helpers.js';
import { REPO_ROOT, cleanEnv, git } from './s09-guard-vcs-fixtures.js';
import {
  runCollabPreflight, planScenarioFinalization, checkOriginFreshness, type CollabExec,
} from '../src/lib/collab-preflight.js';

const TIMEOUT = 120_000;
const CLI = join(REPO_ROOT, 'cli', 'dist', 'index.js');
const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

function tempRoot(): string {
  const { root, cleanup } = makeTempRoot();
  cleanups.push(cleanup);
  return root;
}
function put(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}
function runCli(root: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const r = spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8', timeout: TIMEOUT, env: cleanEnv({ OPENLOGOS_INTERNAL_LEGACY_MERGE_APPLY: '0' }) });
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function gitOk(root: string, args: string[]): void {
  expect(git(root, args).status, `git ${args.join(' ')}`).toBe(0);
}
function gitInit(root: string): void {
  for (const args of [['init', '-q'], ['config', 'user.name', 'openlogos-test'], ['config', 'user.email', 'openlogos-test@example.invalid'], ['config', 'commit.gpgsign', 'false']]) {
    gitOk(root, args);
  }
}
function commitAll(root: string, message = 'fixture'): void {
  gitOk(root, ['add', '-A']);
  gitOk(root, ['commit', '-q', '-m', message]);
}
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out[r] = createHash('sha256').update(readFileSync(join(root, r))).digest('hex');
    }
  };
  walk('');
  return out;
}

/** exec 哨兵：fetch 成功、origin/HEAD 存在、三点 diff 按参数返回。 */
function stubExec(diffStatus: number, fetchStatus = 0): CollabExec {
  return (args) => {
    if (args[0] === 'fetch') return { status: fetchStatus, stdout: '', stderr: fetchStatus === 0 ? '' : 'offline' };
    if (args[0] === 'diff') return { status: diffStatus, stdout: '', stderr: '' };
    return { status: 0, stdout: args[0] === 'rev-parse' ? 'true\n' : '', stderr: '' };
  };
}

describe('S09/S45 切片2：preflight fetch 检查与编号定稿', () => {
  it('UT-S09-468: 目标文档在 origin 有更新即阻塞（COLLAB_STALE_VIEW，零写入）', () => {
    const root = tempRoot();
    put(root, 'logos/changes/p1/deltas/test/core-S01-test-cases.md', '## ADDED — 新节\n内容\n');
    const before = snapshot(root);
    const r = runCollabPreflight(root, join(root, 'logos/changes/p1'), { exec: stubExec(1) });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('COLLAB_STALE_VIEW');
    expect(r.message).toContain('git pull --rebase');
    expect(r.staleTargets).toEqual(['logos/resources/test/core-S01-test-cases.md']);
    expect(snapshot(root)).toEqual(before);
  });

  it('UT-S09-469: fetch 失败离线降级为警告，不阻塞本地 merge', () => {
    const root = tempRoot();
    put(root, 'logos/changes/p1/deltas/test/core-S01-test-cases.md', '## ADDED — 新节\n内容\n');
    const r = runCollabPreflight(root, join(root, 'logos/changes/p1'), { exec: stubExec(0, 128) });
    expect(r.ok).toBe(true);
    expect(r.warnings.join('\n')).toContain('降级');
  });

  it('UT-S45-09: preflight fetch 双分支（fresh 放行 / stale 阻塞 / 离线警告）', () => {
    const root = tempRoot();
    put(root, 'logos/changes/p1/deltas/test/core-S01-test-cases.md', '## ADDED — 新节\n内容\n');
    expect(runCollabPreflight(root, join(root, 'logos/changes/p1'), { exec: stubExec(0) }).ok).toBe(true);
    expect(runCollabPreflight(root, join(root, 'logos/changes/p1'), { exec: stubExec(1) }).ok).toBe(false);
    const offline = checkOriginFreshness(root, ['x'], stubExec(0, 128));
    expect(offline.status).toBe('offline');
  });

  it('UT-S09-470: 编号落盘定稿——拟用号被占时定稿 +1 并同步改写引用', () => {
    const root = tempRoot();
    put(root, 'logos/logos-project.yaml', 'scenarios:\n  - id: S46\n    name: 既有场景\n');
    put(root, 'logos/resources/prd/3-technical-plan/2-scenario-implementation/core-S46-existing.md', '# S46: 既有\n');
    put(root, 'logos/changes/p1/deltas/prd/3-technical-plan/2-scenario-implementation/core-S46-new-feature.md',
      '## ADDED — S46: 新场景\n# S46: 新场景\n测试：UT-S46-01、ST-S46-01\n验收：S46-AC-01\n引用 core-S46-test-cases.md\n');
    const r = runCollabPreflight(root, join(root, 'logos/changes/p1'), { skipFetch: true });
    expect(r.ok).toBe(true);
    expect(r.renames).toEqual([{ fromId: 'S46', toId: 'S47' }]);
    const nextPath = join(root, 'logos/changes/p1/deltas/prd/3-technical-plan/2-scenario-implementation/core-S47-new-feature.md');
    expect(existsSync(nextPath)).toBe(true);
    const content = readFileSync(nextPath, 'utf-8');
    expect(content).toContain('# S47: 新场景');
    expect(content).toContain('UT-S47-01');
    expect(content).toContain('ST-S47-01');
    expect(content).toContain('S47-AC-01');
    expect(content).toContain('core-S47-test-cases.md');
    expect(content).not.toContain('UT-S46-01');
  });

  it('UT-S45-02: 定稿引用改写文法全覆盖（与 UT-S09-470 同判据、双锚定）', () => {
    const root = tempRoot();
    put(root, 'logos/resources/prd/3-technical-plan/2-scenario-implementation/core-S46-existing.md', '# S46\n');
    put(root, 'logos/changes/p1/deltas/test/core-S46-test-cases.md',
      '## ADDED — 一、单元\n| UT-S46-01 | 描述 |\n| ST-S46-01 | 描述 |\n标题引用 # S46 与 S46-AC-02\n');
    const r = runCollabPreflight(root, join(root, 'logos/changes/p1'), { skipFetch: true });
    expect(r.ok).toBe(true);
    expect(r.renames).toEqual([{ fromId: 'S46', toId: 'S47' }]);
    const content = readFileSync(join(root, 'logos/changes/p1/deltas/test/core-S47-test-cases.md'), 'utf-8');
    expect(content).toContain('UT-S47-01');
    expect(content).toContain('ST-S47-01');
    expect(content).toContain('S47-AC-02');
    expect(r.touchedFiles.length).toBeGreaterThan(0);
  });

  it('UT-S09-471: 撞号防御——定稿输出与已落盘集合不相交（属性断言）', () => {
    const cases: Array<{ landed: number[]; proposed: number[]; next: number }> = [
      { landed: [46], proposed: [46], next: 1 },
      { landed: [44, 45, 46], proposed: [44, 45], next: 44 },
      { landed: [46, 47], proposed: [46], next: 46 },
      { landed: [], proposed: [44], next: 44 },
    ];
    for (const c of cases) {
      const plan = planScenarioFinalization(c.proposed, new Set(c.landed), c.next);
      for (const r of plan.renames) {
        expect(c.landed, `${r.fromId}→${r.toId} 不得与已落盘冲突`).not.toContain(Number(r.toId.slice(1)));
      }
      expect(plan.collisions).toEqual([]);
    }
    // 防御路径：plan 输出的 collisions 恒为空（算法不会分配已落盘号）；若未来公式缺陷引入冲突，本属性即报警。
  });

  it('ST-S09-206: 同目录第二提案被拒并指引 worktree（端到端，快照一致）', () => {
    const root = tempRoot();
    scaffoldProject(root, { locale: 'zh' });
    put(root, 'logos/.openlogos-guard', '{"activeChange":"a","module":"core"}\n');
    put(root, 'logos/changes/a/proposal.md', '# 变更提案：a\n');
    const before = snapshot(root);
    const r = runCli(root, ['change', 'b']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--worktree');
    expect(snapshot(root)).toEqual(before);
  }, TIMEOUT);

  it('ST-S09-207: merge 在陈旧 view 上被阻塞（端到端，提案与 resources 快照不变）', () => {
    const root = tempRoot();
    scaffoldProject(root, { locale: 'zh' });
    put(root, 'logos/resources/test/core-S01-test-cases.md', '## 一、既有节\n| UT-S01-01 | x |\n');
    put(root, 'logos/changes/p1/proposal.md', mergeAdmissibleProposal());
    put(root, 'logos/changes/p1/tasks.md', mergeAdmissibleTasks(['- [x] 产出 delta 文件到 `deltas/test/core-S01-test-cases.md` — 夹具']) + '\n## [code] 代码实现\n（夹具：plan 段留空。）\n');
    put(root, 'logos/changes/p1/deltas/test/core-S01-test-cases.md', '## MODIFIED — 一、既有节\n| UT-S01-01 | x |\n');
    gitInit(root);
    commitAll(root, 'baseline');
    const bare = tempRoot();
    gitOk(bare, ['init', '-q', '--bare', '.']);
    gitOk(root, ['remote', 'add', 'origin', bare]);
    gitOk(root, ['push', '-q', 'origin', 'HEAD:master']);
    // A 侧（第二工作区）更新目标文档并推送
    const a = tempRoot();
    gitOk(a, ['clone', '-q', bare, '.']);
    gitOk(a, ['config', 'user.name', 'a']);
    gitOk(a, ['config', 'user.email', 'a@example.invalid']);
    put(a, 'logos/resources/test/core-S01-test-cases.md', '## 一、既有节\n| UT-S01-01 | x |\n## 二、A 新节\n');
    commitAll(a, 'A update');
    gitOk(a, ['push', '-q', 'origin', 'HEAD:master']);

    const before = snapshot(root);
    const r = runCli(root, ['merge', 'p1']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('COLLAB_STALE_VIEW');
    expect(r.stderr).toContain('core-S01-test-cases.md');
    expect(snapshot(root)).toEqual(before);
  }, TIMEOUT);

  it('UT-S09-472 / UT-S45-10: 锚失效报错含 origin 上下文与恢复重放指引（同判据双锚定）', () => {
    const root = tempRoot();
    scaffoldProject(root, { locale: 'zh' });
    registerCoreModule(root, 'launched');
    put(root, 'logos/resources/test/core-S01-test-cases.md', '## 一、既有节\n| UT-S01-01 | x |\n');
    put(root, 'logos/changes/p1/proposal.md', mergeAdmissibleProposal());
    put(root, 'logos/changes/p1/tasks.md', mergeAdmissibleTasks(['- [x] 产出 delta 文件到 `deltas/test/core-S01-test-cases.md` — 夹具']) + '\n## [code] 代码实现\n（夹具：plan 段留空。）\n');
    // delta 锚「二、新标题」只在 origin 版本存在（本地 0 命中 → 锚失效）
    put(root, 'logos/changes/p1/deltas/test/core-S01-test-cases.md', '## MODIFIED — 二、新标题\n| UT-S01-02 | y |\n');
    gitInit(root);
    commitAll(root, 'baseline');
    const bare = tempRoot();
    gitOk(bare, ['init', '-q', '--bare', '.']);
    gitOk(root, ['remote', 'add', 'origin', bare]);
    gitOk(root, ['push', '-q', 'origin', 'HEAD:master']);
    const a = tempRoot();
    gitOk(a, ['clone', '-q', bare, '.']);
    gitOk(a, ['config', 'user.name', 'a']);
    gitOk(a, ['config', 'user.email', 'a@example.invalid']);
    put(a, 'logos/resources/test/core-S01-test-cases.md', '## 一、既有节\n| UT-S01-01 | x |\n## 二、新标题\n| UT-S01-02 | y |\n');
    commitAll(a, 'A update');
    gitOk(a, ['push', '-q', 'origin', 'HEAD:master']);
    // 先 fetch 拿到 origin 更新，再断网（remote 指向不存在路径）模拟离线
    gitOk(root, ['fetch', '-q', 'origin']);
    gitOk(root, ['remote', 'set-url', 'origin', join(tempRoot(), 'missing.git')]);

    const r = runCli(root, ['merge', 'p1']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout + r.stderr).toContain('降级'); // preflight 离线降级（warning 走 stdout）
    expect(r.stderr).toContain('delta_section_anchor_unresolvable');
    expect(r.stderr).toContain('协作提示');
    expect(r.stderr).toContain('origin 有新版本');
    expect(r.stderr).toContain('恢复路径');
  }, TIMEOUT);

  it('ST-S45-02: 同文档冲突恢复重放端到端（先 pull → 锚失效（含 origin 上下文）→ 重写 delta → 重放成功）', () => {
    const root = tempRoot();
    scaffoldProject(root, { locale: 'zh' });
    registerCoreModule(root, 'launched');
    const TABLE_HEADER = '| ID | 描述 | 前置条件 | 操作 | 预期结果 |\n|---|---|---|---|---|\n';
    put(root, 'logos/resources/test/core-S01-test-cases.md', `## 一、既有节\n${TABLE_HEADER}| UT-S01-01 | x | - | - | - |\n`);
    put(root, 'logos/changes/p1/proposal.md', mergeAdmissibleProposal());
    put(root, 'logos/changes/p1/tasks.md', mergeAdmissibleTasks(['- [x] 产出 delta 文件到 `deltas/test/core-S01-test-cases.md` — 夹具']) + '\n## [code] 代码实现\n（夹具：plan 段留空。）\n');
    put(root, 'logos/changes/p1/deltas/test/core-S01-test-cases.md',
      `## MODIFIED — 一、既有节\n${TABLE_HEADER}| UT-S01-01 | x | - | - | - |\n| UT-S01-02 | B 新增 | - | - | - |\n`);
    gitInit(root);
    commitAll(root, 'baseline');
    const bare = tempRoot();
    gitOk(bare, ['init', '-q', '--bare', '.']);
    gitOk(root, ['remote', 'add', 'origin', bare]);
    gitOk(root, ['push', '-q', 'origin', 'HEAD:master']);

    // A 先改同一主文档节标题并推送（B 尚未 merge）
    const a = tempRoot();
    gitOk(a, ['clone', '-q', bare, '.']);
    gitOk(a, ['config', 'user.name', 'a']);
    gitOk(a, ['config', 'user.email', 'a@example.invalid']);
    put(a, 'logos/resources/test/core-S01-test-cases.md', `## 一、既有节（A 修订）\n${TABLE_HEADER}| UT-S01-01 | x | - | - | - |\n`);
    commitAll(a, 'A retitle');
    gitOk(a, ['push', '-q', 'origin', 'HEAD:master']);

    // B 先 pull（工作区干净、无冲突）→ merge：delta 旧锚失效且报错含 origin 上下文
    gitOk(root, ['pull', '--rebase', '-q', 'origin', 'master']);
    const m1 = runCli(root, ['merge', 'p1']);
    expect(m1.exitCode).toBe(1);
    expect(m1.stderr).toContain('delta_section_anchor_unresolvable');
    expect(m1.stderr).toContain('恢复路径');

    // B 基于新 view 重写 delta（新锚）→ 重放（首次 merge）成功；全程未手工缝合冲突标记
    put(root, 'logos/changes/p1/deltas/test/core-S01-test-cases.md',
      `## MODIFIED — 一、既有节（A 修订）\n${TABLE_HEADER}| UT-S01-01 | x | - | - | - |\n| UT-S01-02 | B 新增 | - | - | - |\n`);
    const m2 = runCli(root, ['merge', 'p1']);
    expect(m2.exitCode, `重放 merge stderr=${m2.stderr}`).toBe(0);
    const finalDoc = readFileSync(join(root, 'logos/resources/test/core-S01-test-cases.md'), 'utf-8');
    expect(finalDoc).toContain('一、既有节（A 修订）');
    expect(finalDoc).toContain('UT-S01-02');
    // 既有机制边界（EX-9.40）：已 merge 提案的主文档漂移由 MERGE_AMEND_DRIFT 接管（另立新提案），不在本用例路径。
  }, TIMEOUT);
});
