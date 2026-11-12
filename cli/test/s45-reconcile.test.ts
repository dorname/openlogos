/**
 * multi-user-collaboration [code] 切片 3：sync 收敛重排器。
 *
 * 覆盖 UT-S45-03～05、UT-S45-08、UT-S45-11、ST-S45-01、ST-S45-03
 * （与 logos/resources/test/core-S45-test-cases.md 对齐）。
 * - UT 直接调用 runReconcile（本地 bare 仓库模拟 origin，origin 可见 = 冻结）；
 * - ST 走真实 CLI sync（含 index 重建、counter 不写回、离线收敛）。
 * 结果由全局 OpenLogos reporter 写入 logos/resources/verify/test-results.jsonl。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempRoot, scaffoldProject } from './helpers.js';
import { REPO_ROOT, cleanEnv, git } from './s09-guard-vcs-fixtures.js';
import { runReconcile } from '../src/lib/reconcile-renumber.js';

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
  const r = spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8', timeout: TIMEOUT, env: cleanEnv() });
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function gitOk(root: string, args: string[]): void {
  expect(git(root, args).status, `git ${args.join(' ')}`).toBe(0);
}
function gitInit(root: string): void {
  for (const args of [['init', '-q'], ['config', 'user.name', 'openlogos-test'], ['config', 'user.email', 'openlogos-test@example.invalid'], ['config', 'commit.gpgsign', 'false']]) gitOk(root, args);
}
function commitAll(root: string, message = 'fixture'): void {
  gitOk(root, ['add', '-A']);
  gitOk(root, ['commit', '-q', '-m', message]);
}
function cloneRepo(bare: string): string {
  const dir = tempRoot();
  gitOk(dir, ['clone', '-q', bare, '.']);
  gitOk(dir, ['config', 'user.name', 'clone']);
  gitOk(dir, ['config', 'user.email', 'clone@example.invalid']);
  return dir;
}

const SCENARIO_DIR = 'logos/resources/prd/3-technical-plan/2-scenario-implementation';

/**
 * 双 clone 撞号夹具：origin（bare）含 core-S44-a.md（他人已推送）；
 * 本地 clone 新增 pay-S44-b.md（含 UT-S44-01 引用，未推送）。
 */
function collisionFixture(): { root: string; originDoc: string } {
  const seed = tempRoot();
  gitInit(seed);
  put(seed, `${SCENARIO_DIR}/core-S44-a.md`, '# S44: 他人场景\n');
  commitAll(seed, 'A scenario');
  const bare = tempRoot();
  gitOk(bare, ['init', '-q', '--bare', '.']);
  gitOk(seed, ['remote', 'add', 'origin', bare]);
  gitOk(seed, ['push', '-q', 'origin', 'HEAD:master']);

  const root = cloneRepo(bare);
  put(root, `${SCENARIO_DIR}/pay-S44-b.md`, '# S44: 本地场景\n测试：UT-S44-01\n引用 pay-S44-test-cases.md\n');
  put(root, 'logos/resources/test/pay-S44-test-cases.md', '## 一、单元\n| UT-S44-01 | 本地用例 |\n');
  commitAll(root, 'B scenario (unpushed)');
  return { root, originDoc: readFileSync(join(root, `${SCENARIO_DIR}/core-S44-a.md`), 'utf-8') };
}

describe('S45 切片3：收敛重排器', () => {
  it('UT-S45-03: 同号异 slug 检出与改写（origin 冻结、本地重排）', () => {
    const { root, originDoc } = collisionFixture();
    const r = runReconcile(root);
    expect(r.ok).toBe(true);
    expect(r.renames.map(x => `${x.fromId}→${x.toId}`)).toEqual(['S44→S45']);
    // 本地工件重排：文件名与内容引用
    const nextScenario = join(root, `${SCENARIO_DIR}/pay-S45-b.md`);
    expect(existsSync(nextScenario)).toBe(true);
    const content = readFileSync(nextScenario, 'utf-8');
    expect(content).toContain('# S45: 本地场景');
    expect(content).toContain('UT-S45-01');
    expect(content).toContain('pay-S45-test-cases.md');
    // 测试文件随场景一并重排
    expect(readFileSync(join(root, 'logos/resources/test/pay-S45-test-cases.md'), 'utf-8')).toContain('UT-S45-01');
    // origin 可见工件逐字节不变（冻结）
    expect(readFileSync(join(root, `${SCENARIO_DIR}/core-S44-a.md`), 'utf-8')).toBe(originDoc);
    expect(existsSync(join(root, `${SCENARIO_DIR}/pay-S44-b.md`))).toBe(false);
  });

  it('UT-S45-04: 重排 diff 清单输出（逐文件旧值→新值）', () => {
    const { root } = collisionFixture();
    const r = runReconcile(root);
    expect(r.renames).toHaveLength(1);
    expect(r.renames[0].fromId).toBe('S44');
    expect(r.renames[0].toId).toBe('S45');
    expect(r.renames[0].files.some(f => f.includes('pay-S45-b.md'))).toBe(true);
    expect(r.renames[0].files.some(f => f.includes('pay-S45-test-cases.md'))).toBe(true);
  });

  it('UT-S45-05: 文法外歧义引用 fail-closed（整体不落盘）', () => {
    const { root } = collisionFixture();
    // 注入散文歧义引用（注册文法外的裸 S44）
    put(root, `${SCENARIO_DIR}/pay-S44-b.md`, '# S44: 本地场景\n测试：UT-S44-01\n散文引用：详见 S44 的论述。\n');
    const r = runReconcile(root);
    expect(r.ok).toBe(false);
    expect(r.ambiguous.length).toBeGreaterThan(0);
    expect(r.ambiguous[0].text).toContain('详见 S44');
    expect(r.message).toContain('整体未落盘');
    // 无半套重排：原文件与内容保持不变
    expect(existsSync(join(root, `${SCENARIO_DIR}/pay-S44-b.md`))).toBe(true);
    expect(existsSync(join(root, `${SCENARIO_DIR}/pay-S45-b.md`))).toBe(false);
    expect(readFileSync(join(root, `${SCENARIO_DIR}/pay-S44-b.md`), 'utf-8')).toContain('UT-S44-01');
  });

  it('UT-S45-11: 重排幂等（再次收敛无可重排项）', () => {
    const { root } = collisionFixture();
    expect(runReconcile(root).renames.length).toBeGreaterThan(0);
    const again = runReconcile(root);
    expect(again.ok).toBe(true);
    expect(again.renames).toEqual([]);
    expect(again.ambiguous).toEqual([]);
  });

  it('ST-S45-01: 双 clone 撞号端到端（sync 重排 + index 重建 + counter 不写回）', () => {
    const { root, originDoc } = collisionFixture();
    // 完整项目结构 + 旧 counter（验证不写回）
    scaffoldProject(root, { locale: 'zh' });
    const yamlPath = join(root, 'logos/logos-project.yaml');
    writeFileSync(yamlPath, readFileSync(yamlPath, 'utf-8') + '\nscenario_counter:\n  next_id: 45\n');
    put(root, 'logos/resources/prd/3-technical-plan/2-scenario-implementation/pay-S44-b.md', '# S44: 本地场景\n测试：UT-S44-01\n');

    const r = runCli(root, ['sync']);
    expect(r.exitCode, `sync stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('汇合重排');
    expect(r.stdout).toContain('S44 → S45');
    expect(existsSync(join(root, `${SCENARIO_DIR}/pay-S45-b.md`))).toBe(true);
    expect(readFileSync(join(root, `${SCENARIO_DIR}/core-S44-a.md`), 'utf-8')).toBe(originDoc);
    // resource_index 自动重建：含新路径条目
    const yaml = readFileSync(yamlPath, 'utf-8');
    expect(yaml).toContain('pay-S45-b.md');
    // counter 行不写回（保持旧值 45，不由 sync 改写）
    expect(yaml).toMatch(/scenario_counter:\n\s+next_id: 45/);
  }, TIMEOUT);

  it('ST-S45-03: 离线收敛端到端（无 origin，纯本地重排照常）', () => {
    const root = tempRoot();
    scaffoldProject(root, { locale: 'zh' });
    put(root, `${SCENARIO_DIR}/core-S44-a.md`, '# S44: 甲\n');
    put(root, `${SCENARIO_DIR}/pay-S44-b.md`, '# S44: 乙\n');
    // 无 git / 无 origin：本地工件全部可重排（保留字典序最小者）
    const r = runCli(root, ['sync']);
    expect(r.exitCode, `sync stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('汇合重排');
    expect(existsSync(join(root, `${SCENARIO_DIR}/core-S44-a.md`))).toBe(true);
    expect(existsSync(join(root, `${SCENARIO_DIR}/pay-S45-b.md`))).toBe(true);
  }, TIMEOUT);

  it('UT-S45-08: index 重建由 sync 既有步骤收口（重排后 resource_index 含新路径）', () => {
    const { root } = collisionFixture();
    scaffoldProject(root, { locale: 'zh' });
    const r = runCli(root, ['sync']);
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(root, 'logos/logos-project.yaml'), 'utf-8')).toContain('pay-S45-b.md');
  }, TIMEOUT);
});
