/**
 * multi-user-collaboration [code] 切片 1：counter 派生化与 guardConflict worktree 指引。
 *
 * 覆盖 UT-S45-01、UT-S45-06、UT-S45-07、UT-S09-467、UT-S44-07
 * （与 logos/resources/test/core-S45-test-cases.md / core-S09-test-cases.md / core-S44-test-cases.md 对齐）。
 * - UT-S45-01 直接调用 deriveNextIds 纯函数（configured 缺失 / 落后 / 领先三分支）；
 * - UT-S45-06 / UT-S45-07 / UT-S09-467 / UT-S44-07 走真实 CLI 入口（cli/dist/index.js），隔离临时项目。
 * 结果由全局 OpenLogos reporter 写入 logos/resources/verify/test-results.jsonl。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempRoot, scaffoldProject } from './helpers.js';
import { REPO_ROOT, cleanEnv } from './s09-guard-vcs-fixtures.js';
import { deriveNextIds } from '../src/lib/project-yaml.js';

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
  const r = spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf-8', timeout: 120_000, env: cleanEnv() });
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('S45 切片1：counter 派生化', () => {
  it('UT-S45-01: 派生取号公式三分支（configured 缺失 / 落后 / 领先）', () => {
    const root = tempRoot();
    put(root, 'logos/resources/decisions/core-D15-proposal-default-environment.md', '# D15\n');

    // configured 缺失：next = max已落盘 + 1
    const missing = deriveNextIds(root, {
      scenarios: [{ id: 'S43' }, { id: 'S44' }],
      features: [{ id: 'F08', name: 'x', module: 'core' }],
    });
    expect(missing).toEqual({ next_scenario_id: 45, next_feature_id: 9, next_decision_id: 16 });

    // configured 落后：仍按已落盘派生
    const behind = deriveNextIds(root, {
      scenario_counter: { next_id: 40 },
      feature_counter: { next_id: 3 },
      decision_counter: { next_id: 2 },
      scenarios: [{ id: 'S43' }, { id: 'S44' }],
      features: [{ id: 'F08', name: 'x', module: 'core' }],
    });
    expect(behind).toEqual({ next_scenario_id: 45, next_feature_id: 9, next_decision_id: 16 });

    // configured 领先：configured 作下限被采纳
    const ahead = deriveNextIds(root, {
      scenario_counter: { next_id: 50 },
      feature_counter: { next_id: 12 },
      decision_counter: { next_id: 20 },
      scenarios: [{ id: 'S43' }],
      features: [{ id: 'F08', name: 'x', module: 'core' }],
    });
    expect(ahead).toEqual({ next_scenario_id: 50, next_feature_id: 12, next_decision_id: 20 });

    // 空集（无 yaml 数据、无 decisions 目录）：从 1 起
    const emptyRoot = tempRoot();
    expect(deriveNextIds(emptyRoot, null)).toEqual({ next_scenario_id: 1, next_feature_id: 1, next_decision_id: 1 });
  });

  it('UT-S45-06: sync 后 yaml counter 行逐字节不变（取号走派生值）', () => {
    const root = tempRoot();
    scaffoldProject(root, { locale: 'zh' });
    const yamlPath = join(root, 'logos', 'logos-project.yaml');
    const original = readFileSync(yamlPath, 'utf-8')
      + '\nscenario_counter:\n  next_id: 41\nfeature_counter:\n  next_id: 9\ndecision_counter:\n  next_id: 13\n';
    writeFileSync(yamlPath, original);

    const counterBlock = (text: string) => text.split('\n').filter(l => /^(scenario_counter|feature_counter|decision_counter):|^\s+next_id:/.test(l));
    const before = counterBlock(readFileSync(yamlPath, 'utf-8'));

    const r = runCli(root, ['sync']);
    expect(r.exitCode, `sync stderr=${r.stderr}`).toBe(0);
    expect(counterBlock(readFileSync(yamlPath, 'utf-8'))).toEqual(before);
  });

  it('UT-S45-07: status --format json 暴露派生 next-id（additive）', () => {
    const root = tempRoot();
    scaffoldProject(root);
    put(root, 'logos/logos-project.yaml',
      'project:\n  name: "test-project"\n  description: ""\n  methodology: "OpenLogos"\n\n'
      + 'scenario_counter:\n  next_id: 40\nfeature_counter:\n  next_id: 3\n\n'
      + 'scenarios:\n  - id: S43\n    name: 场景甲\n  - id: S44\n    name: 场景乙\n\n'
      + 'features:\n  - id: F08\n    name: 分组甲\n    module: core\n\n'
      + 'resource_index: []\n\nconventions:\n  - "x"\n');
    put(root, 'logos/resources/decisions/core-D15-some-decision.md', '# D15\n');

    const r = runCli(root, ['status', '--format', 'json']);
    expect(r.exitCode, `status stderr=${r.stderr}`).toBe(0);
    const parsed = JSON.parse(r.stdout) as { data: Record<string, unknown> };
    expect(parsed.data.next_scenario_id).toBe(45);
    expect(parsed.data.next_feature_id).toBe(9);
    expect(parsed.data.next_decision_id).toBe(16);
  });
});

describe('S09/S44 切片1：guardConflict worktree 指引', () => {
  function guardConflictProject(locale: 'en' | 'zh'): string {
    const root = tempRoot();
    scaffoldProject(root, { locale });
    put(root, 'logos/.openlogos-guard', JSON.stringify({ activeChange: 'a', module: 'core', createdAt: '2026-01-01T00:00:00.000Z' }));
    // guard 冲突判定要求「指向的提案目录存在且未归档」——补齐活跃提案目录
    put(root, 'logos/changes/a/proposal.md', '# 变更提案：a\n');
    return root;
  }

  it('UT-S09-467: guardConflict 文案含 worktree 指引且行为不变（en）', () => {
    const root = guardConflictProject('en');
    const guardBefore = readFileSync(join(root, 'logos', '.openlogos-guard'), 'utf-8');
    const r = runCli(root, ['change', 'b']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("'a'");
    expect(r.stderr).toContain('--worktree');
    expect(r.stderr).toContain('openlogos change <slug> --worktree');
    // 行为不变：guard 不改写、不创建新提案目录
    expect(readFileSync(join(root, 'logos', '.openlogos-guard'), 'utf-8')).toBe(guardBefore);
    expect(existsSync(join(root, 'logos', 'changes', 'b'))).toBe(false);
  });

  it('UT-S44-07: 同目录双会话 guardConflict 指引（zh，同判据双锚定）', () => {
    const root = guardConflictProject('zh');
    const guardBefore = readFileSync(join(root, 'logos', '.openlogos-guard'), 'utf-8');
    const r = runCli(root, ['change', 'b']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('并行');
    expect(r.stderr).toContain('--worktree');
    expect(r.stderr).toContain('S44');
    expect(readFileSync(join(root, 'logos', '.openlogos-guard'), 'utf-8')).toBe(guardBefore);
    expect(existsSync(join(root, 'logos', 'changes', 'b'))).toBe(false);
  });
});
