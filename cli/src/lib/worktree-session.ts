/**
 * multi-user-collaboration（S44 / D16）：worktree 会话入口。
 *
 * `openlogos change <slug> --worktree` 一条龙（先全量准备、任一步失败清理零残留）：
 *   1. 前置校验：同名分支 openlogos/<slug> 与 .worktrees/<slug> 不得已存在（WORKTREE_TARGET_EXISTS）；
 *   2. git worktree add（短暂分支，verify 后 merge-back 即删——工具托管细节，非团队长期分支）；
 *   3. worktree 缺 logos/logos.config.json 且主工作区存在时复制（dogfood 仓 config 不入库的冷启动）；
 *   4. worktree 内自调用 `openlogos sync` 部署 AI 资产（等效主工作区 sync 产物）；
 *   5. worktree 内自调用 `openlogos change <slug>` 创建提案（guard 写入 worktree，主工作区不受影响）。
 * 自调用经 process.execPath + process.argv[1]（真实 CLI 入口），保持与手工逐步执行完全同语义。
 */
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { removeTree } from './fs-remove.js';

export interface WorktreeSessionResult {
  ok: boolean;
  worktreePath?: string;
  branch?: string;
  errorCode?: 'WORKTREE_TARGET_EXISTS' | 'WORKTREE_CREATE_FAILED';
  message?: string;
  steps: string[];
}

export function createWorktreeSession(root: string, slug: string): WorktreeSessionResult {
  const branch = `openlogos/${slug}`;
  const worktreePath = join(root, '.worktrees', slug);
  const relWorktree = `.worktrees/${slug}`;
  const steps: string[] = [];

  const git = (args: string[], cwd = root) =>
    spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: 60_000 });
  const cli = (args: string[], cwd: string) =>
    spawnSync(process.execPath, [process.argv[1], ...args], { cwd, encoding: 'utf-8', timeout: 300_000 });

  const cleanup = () => {
    git(['worktree', 'remove', '--force', relWorktree]);
    if (existsSync(worktreePath)) removeTree(worktreePath);
    git(['branch', '-D', branch]);
  };
  const fail = (message: string): WorktreeSessionResult => {
    cleanup();
    return { ok: false, errorCode: 'WORKTREE_CREATE_FAILED', message, steps };
  };

  // ── 1. 前置校验（零副作用）──
  if (git(['rev-parse', '--verify', '--quiet', branch]).status === 0) {
    return {
      ok: false, errorCode: 'WORKTREE_TARGET_EXISTS', steps,
      message: `分支 ${branch} 已存在。请更换 slug，或先清理既有 worktree 会话（git worktree remove ${relWorktree} && git branch -D ${branch}）。`,
    };
  }
  if (existsSync(worktreePath)) {
    return {
      ok: false, errorCode: 'WORKTREE_TARGET_EXISTS', steps,
      message: `目录 ${relWorktree} 已存在。请更换 slug，或清理该目录后重试。`,
    };
  }
  const inGit = git(['rev-parse', '--is-inside-work-tree']);
  if (inGit.status !== 0) {
    return { ok: false, errorCode: 'WORKTREE_CREATE_FAILED', message: '当前目录不是 git 仓库，无法创建 worktree 会话。', steps };
  }

  // ── 2. 创建分支与 worktree ──
  const add = git(['worktree', 'add', relWorktree, '-b', branch]);
  if (add.status !== 0) {
    return fail(`git worktree add 失败：${(add.stderr || '').trim().split('\n')[0]}`);
  }
  steps.push(`git worktree add ${relWorktree} -b ${branch}`);

  // ── 3. 复制本地 config（worktree 缺且主工作区有）──
  const mainConfig = join(root, 'logos', 'logos.config.json');
  const wtConfig = join(worktreePath, 'logos', 'logos.config.json');
  if (!existsSync(wtConfig) && existsSync(mainConfig)) {
    mkdirSync(join(worktreePath, 'logos'), { recursive: true });
    copyFileSync(mainConfig, wtConfig);
    steps.push('复制 logos/logos.config.json（主工作区 → worktree）');
  }
  if (!existsSync(wtConfig)) {
    return fail('worktree 与主工作区均无 logos/logos.config.json，请先手工创建后再试。');
  }

  // ── 4. 部署 AI 资产（等效 sync）──
  const sync = cli(['sync'], worktreePath);
  if (sync.status !== 0) {
    return fail(`worktree 内 openlogos sync 失败：${(sync.stderr || sync.stdout || '').trim().split('\n').slice(-3).join(' / ')}`);
  }
  steps.push('worktree 内 openlogos sync（AI 资产部署）');

  // ── 5. 创建提案 ──
  const change = cli(['change', slug], worktreePath);
  if (change.status !== 0) {
    return fail(`worktree 内 openlogos change ${slug} 失败：${(change.stderr || '').trim().split('\n')[0]}`);
  }
  steps.push(`worktree 内 openlogos change ${slug}（guard 写入 worktree）`);

  return { ok: true, worktreePath: relWorktree, branch, steps };
}
