#!/usr/bin/env node
/**
 * SMOKE-core-280～SMOKE-core-283 — 多人协作（multi-user-collaboration，S44/S45）安装态冒烟。
 * 本 runner 认领的 ID 集合 = CASES 的键，覆盖预检据此发现缺口：
 *   - SMOKE-core-280：sync 渲染协作固定条目（logos/.openlogos-runtime/、logos/.openlogos-guard、.worktrees/），幂等；
 *   - SMOKE-core-281：status --format json 暴露派生 next-id（已落盘最大号 + 1）；
 *   - SMOKE-core-282：openlogos change <slug> --worktree 创建与清理（S44）；
 *   - SMOKE-core-283：sync 收敛幂等与 counter 不写回（S45）。
 *
 * 执行边界：全部读写只在 `mktemp -d` 的一次性项目内，结束即删除；不触碰本仓活跃提案、本仓 logos/resources/、
 * 本仓运行态目录与用户其他仓库。runner 以子进程直接调用 CLI（不经 AI 宿主），不访问远程服务。
 * 环境不具备时写显式 skip（缺 openlogos 入口）；自测模式：OPENLOGOS_COLLAB_SMOKE_SELF_TEST=1 +
 * OPENLOGOS_COLLAB_SMOKE_ENTRY 注入入口 + OPENLOGOS_SMOKE_RESULT_PATH 指向独立账本。
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repoRoot = process.cwd();
const resultPath = resolve(repoRoot, process.env.OPENLOGOS_SMOKE_RESULT_PATH || 'logos/resources/verify/smoke-results.jsonl');
const SELF_TEST = process.env.OPENLOGOS_COLLAB_SMOKE_SELF_TEST === '1';
const INJECTED_ENTRY = process.env.OPENLOGOS_COLLAB_SMOKE_ENTRY;
const ENVIRONMENT = SELF_TEST ? 'self-test-injected-entry' : 'local-global-temp-project';
const results = new Map();
const scopes = [];

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024, env: process.env });
const cliRaw = (entry, dir, args) => run(process.execPath, [entry, ...args], dir);
const cliJson = (entry, dir, args) => {
  const r = cliRaw(entry, dir, [...args, '--format', 'json']);
  let data = null;
  try { data = JSON.parse(r.stdout).data ?? null; } catch { /* 非 JSON 输出 */ }
  return { status: r.status, data, stdout: r.stdout || '', stderr: r.stderr || '' };
};
function newTempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `openlogos-collab-smoke-${label}-`));
  scopes.push(dir);
  return dir;
}
function put(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}
function git(dir, args) {
  const r = run('git', args, dir);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败：${(r.stderr || '').slice(0, 300)}`);
  return r.stdout.trim();
}

/** 一次性 git 项目：init（locale zh）+ git init + 基线提交（config 不入库，覆盖 dogfood 复制路径）。 */
function initGitProject(entry) {
  const dir = newTempDir('project');
  const init = cliRaw(entry, dir, ['init', '--locale', 'zh', '--ai-tool', 'claude-code']);
  if (init.status !== 0) throw new Error(`openlogos init 失败：exit ${init.status} ${(init.stderr || '').slice(0, 300)}`);
  put(dir, '.gitignore', 'logos/logos.config.json\n');
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'smoke']);
  git(dir, ['config', 'user.email', 'smoke@example.invalid']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'baseline']);
  return dir;
}

const CASES = {
  'SMOKE-core-280': async (entry) => {
    const dir = initGitProject(entry);
    const r1 = cliRaw(entry, dir, ['sync']);
    if (r1.status !== 0) throw new Error(`首次 sync 失败：${(r1.stderr || '').slice(0, 300)}`);
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8');
    for (const e of ['logos/.openlogos-runtime/', 'logos/.openlogos-guard', '.worktrees/']) {
      if (!gitignore.includes(e)) throw new Error(`托管区块缺固定条目 ${e}`);
    }
    const before = readFileSync(join(dir, '.gitignore'));
    const r2 = cliRaw(entry, dir, ['sync']);
    if (r2.status !== 0) throw new Error('再次 sync 失败');
    if (!readFileSync(join(dir, '.gitignore')).equals(before)) throw new Error('再次 sync 后 .gitignore 字节变化（非幂等）');
    return { detail: 'sync 固定条目三条在场且幂等', evidence: [`project=${dir}`] };
  },

  'SMOKE-core-281': async (entry) => {
    const dir = initGitProject(entry);
    const status = cliJson(entry, dir, ['status']);
    if (status.status !== 0 || !status.data) throw new Error(`status 失败：${status.stderr.slice(0, 300)}`);
    for (const key of ['next_scenario_id', 'next_feature_id', 'next_decision_id']) {
      if (typeof status.data[key] !== 'number' || status.data[key] < 1) {
        throw new Error(`status 缺派生字段 ${key}（实际 ${JSON.stringify(status.data[key])}）`);
      }
    }
    return {
      detail: 'status 暴露派生 next-id（空项目从 1 起）',
      evidence: [`next_scenario_id=${status.data.next_scenario_id}`, `next_feature_id=${status.data.next_feature_id}`, `next_decision_id=${status.data.next_decision_id}`],
    };
  },

  'SMOKE-core-282': async (entry) => {
    const dir = initGitProject(entry);
    const r = cliRaw(entry, dir, ['change', 'smoke-wt', '--worktree']);
    if (r.status !== 0) throw new Error(`change --worktree 失败：${(r.stderr || '').slice(0, 300)}`);
    if (!r.stdout.includes('启动新会话')) throw new Error('输出缺会话启动指引');
    const wt = join(dir, '.worktrees', 'smoke-wt');
    if (!existsSync(wt)) throw new Error('worktree 目录未创建');
    const status = cliJson(entry, wt, ['status']);
    if (status.status !== 0 || status.data?.active_change !== 'smoke-wt') {
      throw new Error(`worktree 内 status 异常：active_change=${status.data?.active_change}`);
    }
    git(dir, ['worktree', 'remove', '--force', '.worktrees/smoke-wt']);
    git(dir, ['branch', '-D', 'openlogos/smoke-wt']);
    if (git(dir, ['worktree', 'list']).includes('smoke-wt')) throw new Error('worktree 清理有残留');
    return { detail: 'change --worktree 创建、worktree 内 status、清理全通过', evidence: [`project=${dir}`] };
  },

  'SMOKE-core-283': async (entry) => {
    const dir = initGitProject(entry);
    const yamlPath = join(dir, 'logos/logos-project.yaml');
    writeFileSync(yamlPath, `${readFileSync(yamlPath, 'utf8')}\nscenario_counter:\n  next_id: 41\n`);
    const counterOf = () => /scenario_counter:\n\s+next_id: (\d+)/.exec(readFileSync(yamlPath, 'utf8'))?.[1];
    const before = counterOf();
    const r1 = cliRaw(entry, dir, ['sync']);
    if (r1.status !== 0) throw new Error(`sync 失败：${(r1.stderr || '').slice(0, 300)}`);
    const r2 = cliRaw(entry, dir, ['sync']);
    if (r2.status !== 0) throw new Error('再次 sync 失败');
    if (counterOf() !== before) throw new Error(`counter 被写回：${before} → ${counterOf()}（应不写回）`);
    if (r1.stdout.includes('汇合重排') || r2.stdout.includes('汇合重排')) throw new Error('无可重排项时不应输出重排报告');
    return { detail: 'sync 收敛幂等且 counter 不写回', evidence: [`counter=${before}`] };
  },
};

export const COLLAB_SMOKE_IDS = Object.keys(CASES);

function commandLookup() {
  if (SELF_TEST) return INJECTED_ENTRY && existsSync(INJECTED_ENTRY) ? realpathSync(INJECTED_ENTRY) : null;
  const r = run('/bin/sh', ['-c', 'command -v openlogos'], repoRoot);
  if (r.status !== 0) return null;
  const first = r.stdout.split(/\r?\n/).find(line => line.trim());
  return first ? realpathSync(first.trim()) : null;
}

function flush() {
  mkdirSync(dirname(resultPath), { recursive: true });
  const timestamp = new Date().toISOString();
  for (const id of COLLAB_SMOKE_IDS) {
    const row = results.get(id) ?? { status: 'fail', detail: '用例未执行到', evidence: [], duration_ms: 0 };
    appendFileSync(resultPath, `${JSON.stringify({
      id, status: row.status, timestamp, duration_ms: row.duration_ms, environment: ENVIRONMENT,
      detail: row.detail, evidence: row.evidence,
    })}\n`);
  }
}

let exitCode = 0;
try {
  const entry = commandLookup();
  if (!entry) {
    for (const id of COLLAB_SMOKE_IDS) results.set(id, { status: 'skip', detail: '找不到 openlogos 入口（环境缺口，非失败）', evidence: [], duration_ms: 0 });
  } else {
    for (const id of COLLAB_SMOKE_IDS) {
      const started = Date.now();
      try {
        const { detail, evidence } = await CASES[id](entry);
        results.set(id, { status: 'pass', detail, evidence: [`entry=${entry}`, ...evidence], duration_ms: Date.now() - started });
      } catch (error) {
        results.set(id, {
          status: 'fail', detail: error instanceof Error ? error.message : String(error),
          evidence: [`entry=${entry}`], duration_ms: Date.now() - started,
        });
      }
    }
  }
} finally {
  flush();
  for (const s of scopes) rmSync(s, { recursive: true, force: true });
}

const failed = COLLAB_SMOKE_IDS.filter(id => results.get(id)?.status === 'fail');
if (failed.length > 0) {
  exitCode = 1;
  console.error(`smoke 失败：${failed.join(', ')}`);
  for (const id of failed) console.error(`  ${id}: ${results.get(id)?.detail ?? '未执行'}`);
} else {
  console.log(`smoke 完成：${COLLAB_SMOKE_IDS.map(id => `${id}=${results.get(id)?.status}`).join(' ')}`);
}
process.exit(exitCode);
