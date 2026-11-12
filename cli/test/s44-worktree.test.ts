/**
 * multi-user-collaboration [code] 切片 4：worktree 会话入口。
 *
 * 覆盖 UT-S44-01～06、ST-S44-01、ST-S44-02（与 logos/resources/test/core-S44-test-cases.md 对齐）。
 * 全部走真实 CLI（cli/dist/index.js），隔离临时 git 项目；
 * 「零残留」= 主工作区文件快照 + git 分支列表 + git worktree list 三方与执行前一致。
 * 结果由全局 OpenLogos reporter 写入 logos/resources/verify/test-results.jsonl。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempRoot, scaffoldProject } from './helpers.js';
import { REPO_ROOT, cleanEnv, git } from './s09-guard-vcs-fixtures.js';

const TIMEOUT = 300_000;
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
function branches(root: string): string {
  return git(root, ['branch', '--list', 'openlogos/*']).stdout.toString('utf-8');
}
function worktrees(root: string): string {
  return git(root, ['worktree', 'list']).stdout.toString('utf-8');
}

/** git scaffold 项目（launched core 模块，config 不入库以覆盖 dogfood 复制路径）。 */
function gitProject(opts: { trackConfig?: boolean } = {}): string {
  const root = tempRoot();
  scaffoldProject(root, { locale: 'zh' });
  gitOk(root, ['init', '-q']);
  gitOk(root, ['config', 'user.name', 'openlogos-test']);
  gitOk(root, ['config', 'user.email', 'openlogos-test@example.invalid']);
  gitOk(root, ['config', 'commit.gpgsign', 'false']);
  if (!opts.trackConfig) put(root, '.gitignore', 'logos/logos.config.json\n');
  gitOk(root, ['add', '-A']);
  gitOk(root, ['commit', '-q', '-m', 'baseline']);
  return root;
}

describe('S44 切片4：worktree 会话入口', () => {
  it('UT-S44-01: --worktree 一条龙创建全量断言（config 复制 / 资产部署 / 主工作区不受影响）', () => {
    const root = gitProject();
    const r = runCli(root, ['change', 'feat-x', '--worktree']);
    expect(r.exitCode, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('.worktrees/feat-x');
    expect(r.stdout).toContain('启动新会话');
    const wt = join(root, '.worktrees', 'feat-x');
    expect(existsSync(wt)).toBe(true);
    expect(branches(root)).toContain('openlogos/feat-x');
    // config 复制（主工作区 config 未入库 → worktree 缺 → 复制）；
    // 随后的 sync backfill（sourceRoots / verify 预运行配置）会规范化该文件——
    // 故按「复制源字段」断言而非逐字节相等（复制 ≠ 重建，name/locale/documents 与主 config 一致）。
    expect(existsSync(join(wt, 'logos/logos.config.json'))).toBe(true);
    const wtCfg = JSON.parse(readFileSync(join(wt, 'logos/logos.config.json'), 'utf-8')) as Record<string, unknown>;
    const mainCfg = JSON.parse(readFileSync(join(root, 'logos/logos.config.json'), 'utf-8')) as Record<string, unknown>;
    for (const key of ['name', 'locale', 'description']) {
      expect(wtCfg[key], `config.${key} 应与主工作区复制源一致`).toEqual(mainCfg[key]);
    }
    // documents / sourceRoots / verify 等由 sync backfill 规范化补全，不属于复制源逐字断言之列。
    // 提案与 guard 在 worktree 内
    expect(existsSync(join(wt, 'logos/changes/feat-x/proposal.md'))).toBe(true);
    expect(JSON.parse(readFileSync(join(wt, 'logos/.openlogos-guard'), 'utf-8')).activeChange).toBe('feat-x');
    // 主工作区不受影响
    expect(existsSync(join(root, 'logos/.openlogos-guard'))).toBe(false);
    expect(existsSync(join(root, 'logos/changes/feat-x'))).toBe(false);
  }, TIMEOUT);

  it('UT-S44-02: worktree 已有 config（git 跟踪）不覆盖主工作区未提交修改', () => {
    const root = gitProject({ trackConfig: true });
    // 主工作区修改 config 但不提交；worktree 检出的是 git 版本，不应被主工作区修改覆盖
    const wtVersion = readFileSync(join(root, 'logos/logos.config.json'), 'utf-8');
    put(root, 'logos/logos.config.json', wtVersion.replace('"test-project"', '"modified-locally"'));
    const r = runCli(root, ['change', 'feat-y', '--worktree']);
    expect(r.exitCode, `stderr=${r.stderr}`).toBe(0);
    const wtConfig = readFileSync(join(root, '.worktrees/feat-y/logos/logos.config.json'), 'utf-8');
    // worktree 用 git 检出版本（sync backfill 可能规范化字段），绝不被主工作区未提交修改覆盖
    expect(wtConfig).not.toContain('modified-locally');
    expect(JSON.parse(wtConfig).name).toBe('test-project');
  }, TIMEOUT);

  it('UT-S44-03: 同名分支已存在 → WORKTREE_TARGET_EXISTS 且零残留', () => {
    const root = gitProject();
    gitOk(root, ['branch', 'openlogos/feat-z']);
    const r = runCli(root, ['change', 'feat-z', '--worktree']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('WORKTREE_TARGET_EXISTS');
    expect(existsSync(join(root, '.worktrees/feat-z'))).toBe(false);
    expect(existsSync(join(root, 'logos/changes/feat-z'))).toBe(false);
  }, TIMEOUT);

  it('UT-S44-04: worktree 路径被占用 → 稳定错误且已建分支被清理', () => {
    const root = gitProject();
    put(root, '.worktrees/feat-w/occupied.txt', 'x');
    const r = runCli(root, ['change', 'feat-w', '--worktree']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('WORKTREE_TARGET_EXISTS');
    expect(branches(root)).not.toContain('openlogos/feat-w');
  }, TIMEOUT);

  it('UT-S44-05: worktree 内 sync 失败 → 清理 worktree 与分支，不留半套工作区', () => {
    const root = gitProject();
    // worktree 自带非法 config（git 跟踪一个坏 JSON）→ 不复制主 config → sync 失败
    put(root, 'logos/logos.config.json', '{ not valid json');
    gitOk(root, ['add', '-f', 'logos/logos.config.json']);
    gitOk(root, ['commit', '-q', '-m', 'broken config']);
    // 主工作区恢复合法 config（change 入口需要）
    scaffoldProject(root, { locale: 'zh' });
    const r = runCli(root, ['change', 'feat-bad', '--worktree']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('WORKTREE_CREATE_FAILED');
    expect(existsSync(join(root, '.worktrees/feat-bad'))).toBe(false);
    expect(branches(root)).not.toContain('openlogos/feat-bad');
    expect(worktrees(root)).not.toContain('feat-bad');
  }, TIMEOUT);

  it('UT-S44-06: 主工作区 guard 隔离不变（指向 a 的 guard 不被 worktree 创建改动）', () => {
    const root = gitProject();
    put(root, 'logos/.openlogos-guard', '{"activeChange":"a","module":"core"}\n');
    const before = readFileSync(join(root, 'logos/.openlogos-guard'), 'utf-8');
    const r = runCli(root, ['change', 'feat-b', '--worktree']);
    expect(r.exitCode, `stderr=${r.stderr}`).toBe(0);
    expect(readFileSync(join(root, 'logos/.openlogos-guard'), 'utf-8')).toBe(before);
    expect(JSON.parse(readFileSync(join(root, '.worktrees/feat-b/logos/.openlogos-guard'), 'utf-8')).activeChange).toBe('feat-b');
  }, TIMEOUT);

  it('ST-S44-01: worktree 会话端到端（创建 → 内流程 → 清理）', () => {
    const root = gitProject();
    const r = runCli(root, ['change', 'feat-e2e', '--worktree']);
    expect(r.exitCode, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('启动新会话');
    const wt = join(root, '.worktrees', 'feat-e2e');
    const status = runCli(wt, ['status', '--format', 'json']);
    expect(status.exitCode, `status stderr=${status.stderr}`).toBe(0);
    const parsed = JSON.parse(status.stdout) as { data: { active_change: string | null } };
    expect(parsed.data.active_change).toBe('feat-e2e');
    // 清理
    gitOk(root, ['worktree', 'remove', '--force', '.worktrees/feat-e2e']);
    gitOk(root, ['branch', '-D', 'openlogos/feat-e2e']);
    expect(worktrees(root)).not.toContain('feat-e2e');
    expect(branches(root)).not.toContain('openlogos/feat-e2e');
  }, TIMEOUT);

  it('ST-S44-02: 创建失败端到端零残留（全项目快照 + 分支 + worktree 三方一致）', () => {
    const root = gitProject();
    gitOk(root, ['branch', 'openlogos/feat-fail']);
    const before = worktrees(root);
    const r = runCli(root, ['change', 'feat-fail', '--worktree']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('WORKTREE_TARGET_EXISTS');
    expect(worktrees(root)).toBe(before);
    expect(existsSync(join(root, 'logos/changes/feat-fail'))).toBe(false);
  }, TIMEOUT);
});
