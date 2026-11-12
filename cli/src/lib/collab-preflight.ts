/**
 * multi-user-collaboration（S45 / D17）：merge preflight 协作三查与编号定稿。
 *
 * 三查（挂首次合并准入序列最前，spec/change-management.md §多人协作 3.2）：
 *   1. fetch 检查——delta 触达目标文档在 origin 有更新即阻塞提示先 pull（离线/非 git 降级警告）；
 *   2. 编号落盘定稿——SXX/FXX 拟用号与已落盘集合冲突时按派生公式定稿，
 *      同步改写本提案 deltas 内注册文法引用（文件名、`# SXX` 标题、`UT-*`/`ST-*` 表内 ID、`-SXX-` 文件名引用）；
 *   3. 撞号防御——定稿后仍与已落盘集合冲突（防御路径）fail-closed。
 *
 * 文法边界（与切片3 收敛重排器共享 `renumberTextInContent`）：只改写注册文法内的确定性引用；
 * 散文裸引用不在定稿路径改写（收敛路径的歧义 fail-closed 见 reconcile-renumber）。
 */
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deriveNextIds, readProjectYaml, type ProjectYamlData } from './project-yaml.js';

export interface CollabExecResult { status: number | null; stdout: string; stderr: string; error?: Error }
export type CollabExec = (args: string[], cwd: string) => CollabExecResult;

export const defaultCollabExec: CollabExec = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: 30_000 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
};

export interface IdRename { fromId: string; toId: string }
export interface CollabPreflightResult {
  ok: boolean;
  errorCode?: 'COLLAB_STALE_VIEW' | 'COLLAB_ID_COLLISION';
  message?: string;
  staleTargets?: string[];
  /** 定稿改写清单（fromId → toId）；空数组 = 无改写 */
  renames: IdRename[];
  /** 被改写的 delta 文件（项目根相对路径，含重命名后的新路径） */
  touchedFiles: string[];
  warnings: string[];
}

/* ───────────────────────── 文法改写（与收敛重排共享） ───────────────────────── */

/**
 * 注册文法内的场景编号替换（S37 文法子集，确定性）：
 * - `UT-S44-` / `ST-S44-` / `SMOKE-S44-`（测试 ID 族）
 * - `S44-AC-`（验收条件 ID）
 * - `-S44-` / `-S44.`（文件名引用，含 core-S44-test-cases.md）
 * - 标题 `# S44` / `# S44:` / `# S44：`（Markdown 标题行）
 * 不做散文裸 `S44` 全局替换（歧义面由收敛重排器的 fail-closed 路径覆盖）。
 */
export function renumberScenarioInContent(content: string, fromNum: number, toNum: number): string {
  const from = `S${fromNum}`;
  const to = `S${toNum}`;
  return content
    .replaceAll(new RegExp(`\\b(UT|ST|SMOKE)-${from}(?=-)`, 'g'), `$1-${to}`)
    .replaceAll(new RegExp(`\\b${from}(?=-AC-)`, 'g'), to)
    .replaceAll(new RegExp(`-${from}(?=[-.])`, 'g'), `-${to}`)
    .replaceAll(new RegExp(`^(#{1,6}\\s+)${from}(?=[:：\\s]|$)`, 'gm'), `$1${to}`);
}

/** 已落盘场景号集合：yaml scenarios[]（单一真相）∪ 场景文档目录文件名。 */
export function landedScenarioNumbers(root: string, data: ProjectYamlData | null | undefined): Set<number> {
  const set = new Set<number>();
  for (const s of data?.scenarios ?? []) {
    const m = /^S(\d+)$/i.exec(s.id.trim());
    if (m) set.add(Number(m[1]));
  }
  const dir = join(root, 'logos', 'resources', 'prd', '3-technical-plan', '2-scenario-implementation');
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const m = /-S(\d+)-[^/\\]+\.md$/i.exec(name);
      if (m) set.add(Number(m[1]));
    }
  }
  return set;
}

/** 递归枚举提案 deltas 下的 Markdown 文件（相对 deltas 的路径）。 */
function listDeltaMarkdown(deltasDir: string): string[] {
  if (!existsSync(deltasDir)) return [];
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(deltasDir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(r);
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

/** delta 文件名中的拟用场景号（core-S44-x.md / pay-S44-test-cases.md）。 */
function proposedScenarioNumber(fileName: string): number | null {
  const m = /-S(\d+)(?:-|\.)/i.exec(fileName);
  return m ? Number(m[1]) : null;
}

/* ───────────────────────── fetch 检查 ───────────────────────── */

export interface OriginFreshness {
  status: 'fresh' | 'stale' | 'offline' | 'not-git';
  staleTargets: string[];
  detail?: string;
}

/** 解析可用的 origin 引用：origin/HEAD → origin/master → origin/main（remote add + push 的项目可能没有 origin/HEAD）。 */
export function resolveOriginRef(root: string, exec: CollabExec = defaultCollabExec): string | null {
  for (const ref of ['origin/HEAD', 'origin/master', 'origin/main']) {
    if (exec(['rev-parse', '--verify', '--quiet', ref], root).status === 0) return ref;
  }
  return null;
}

/** 目标文档在 origin 的 blob 是否领先本地（git diff HEAD origin/HEAD -- target）。 */
export function checkOriginFreshness(
  root: string,
  targets: string[],
  exec: CollabExec = defaultCollabExec,
  opts: { skipFetch?: boolean } = {},
): OriginFreshness {
  const inGit = exec(['rev-parse', '--is-inside-work-tree'], root);
  if (inGit.error || inGit.status !== 0) return { status: 'not-git', staleTargets: [] };
  if (!opts.skipFetch) {
    const fetch = exec(['fetch', '--quiet'], root);
    if (fetch.error || fetch.status !== 0) {
      return { status: 'offline', staleTargets: [], detail: (fetch.stderr || fetch.error?.message || `exit ${fetch.status}`).trim().split('\n')[0] };
    }
  }
  // 无上游（裸本地仓库）→ 无法比对，按离线降级
  const originRef = resolveOriginRef(root, exec);
  if (!originRef) return { status: 'offline', staleTargets: [], detail: 'no origin ref' };
  const stale: string[] = [];
  for (const target of targets) {
    // 三点 diff（merge-base...originRef）：只认 origin 侧独有的 target 改动；
    // 本地领先 origin（自己未推送的工作）不构成「origin 有更新」。
    const diff = exec(['diff', '--quiet', `HEAD...${originRef}`, '--', target], root);
    if (diff.status === 1) stale.push(target);
  }
  return stale.length > 0 ? { status: 'stale', staleTargets: stale } : { status: 'fresh', staleTargets: [] };
}

/* ───────────────────────── 定稿（SXX / FXX） ───────────────────────── */

export interface FinalizePlan {
  renames: IdRename[];
  collisions: string[];
}

/** 计算 SXX 定稿映射：拟用号与已落盘集合冲突时分配到空号，保持拟用号升序相对顺序；未冲突拟用号保留。 */
export function planScenarioFinalization(proposed: number[], landed: Set<number>, configuredNext: number): FinalizePlan {
  let next = Math.max(configuredNext, landed.size > 0 ? Math.max(...landed) + 1 : 1);
  const occupied = new Set(landed);
  const renames: IdRename[] = [];
  const sorted = [...new Set(proposed)].sort((a, b) => a - b);
  // 保留号（未与已落盘冲突的拟用号）先行占位，避免分配冲突
  for (const s of sorted) if (!landed.has(s)) occupied.add(s);
  for (const s of sorted) {
    if (!landed.has(s)) continue; // 未被已落盘占用 → 保留（允许空洞，全局唯一即可）
    while (occupied.has(next)) next += 1;
    renames.push({ fromId: `S${s}`, toId: `S${next}` });
    occupied.add(next);
    next += 1;
  }
  // 撞号防御：定稿目标不得与已落盘冲突
  const collisions = renames.filter(r => landed.has(Number(r.toId.slice(1)))).map(r => r.toId);
  return { renames, collisions };
}

/* ───────────────────────── 主入口 ───────────────────────── */

export interface CollabPreflightOptions {
  exec?: CollabExec;
  /** 跳过 fetch（测试离线注入）；默认执行 */
  skipFetch?: boolean;
}

/**
 * 首次合并的协作 preflight。调用方负责：ok=false 时稳定错误退出（零写入）；
 * ok=true 时输出 renames 改写清单后继续既有准入与落盘流程。
 *
 * merge.ts 生产路径拆两步调用（checkCollabFreshness 于准入前、finalizeCollabIds 于准入后），
 * 保证非法 envelope 先被 change-lint 原样拒绝，不被定稿改写掩盖；本函数供单元测试驱动完整流程。
 */
export function runCollabPreflight(
  root: string,
  changePath: string,
  opts: CollabPreflightOptions = {},
): CollabPreflightResult {
  const fresh = checkCollabFreshness(root, changePath, opts);
  if (!fresh.ok) return fresh;
  const finalized = finalizeCollabIds(root, changePath);
  return { ...finalized, warnings: [...fresh.warnings, ...finalized.warnings] };
}

/** 第 1 查：fetch 新鲜度（只读）。delta 为空时跳过。 */
export function checkCollabFreshness(
  root: string,
  changePath: string,
  opts: CollabPreflightOptions = {},
): CollabPreflightResult {
  const warnings: string[] = [];
  const deltasDir = join(changePath, 'deltas');
  const deltaFiles = listDeltaMarkdown(deltasDir);
  const empty: CollabPreflightResult = { ok: true, renames: [], touchedFiles: [], warnings };
  if (opts.skipFetch || deltaFiles.length === 0) return empty;

  const targets = deltaFiles.map(rel => {
    if (rel.startsWith('spec/')) return rel.slice('spec/'.length);
    if (rel.startsWith('decisions/')) return `logos/resources/decisions/${rel.slice('decisions/'.length)}`;
    return `logos/resources/${rel}`;
  });
  const freshness = checkOriginFreshness(root, targets, opts.exec);
  if (freshness.status === 'stale') {
    return {
      ok: false, errorCode: 'COLLAB_STALE_VIEW', renames: [], touchedFiles: [], warnings,
      staleTargets: freshness.staleTargets,
      message: `delta 触达的目标文档在 origin 已有更新：${freshness.staleTargets.join('、')}。请先 git pull --rebase，基于新 view 重写受影响的 delta 后再 merge（spec/change-management.md §多人协作 3.3）。`,
    };
  }
  if (freshness.status === 'offline') {
    warnings.push(`协作 preflight：git fetch 不可用（${freshness.detail ?? '离线'}），已降级为警告继续本地 merge。`);
  } else if (freshness.status === 'not-git') {
    warnings.push('协作 preflight：当前目录不是 git 仓库，跳过 origin 新鲜度检查。');
  }
  return { ok: true, renames: [], touchedFiles: [], warnings };
}

/** 第 2/3 查：SXX/FXX 编号落盘定稿 + 撞号防御（准入之后、合成落盘之前执行）。 */
export function finalizeCollabIds(
  root: string,
  changePath: string,
): CollabPreflightResult {
  const warnings: string[] = [];
  const deltasDir = join(changePath, 'deltas');
  const deltaFiles = listDeltaMarkdown(deltasDir);

  // ── 2. SXX 编号落盘定稿 ──
  const yaml = readProjectYaml(root);
  const derived = deriveNextIds(root, yaml.data);
  const landed = landedScenarioNumbers(root, yaml.data);
  const proposed = deltaFiles
    .filter(rel => {
      const base = rel.split('/').pop() ?? rel;
      if (proposedScenarioNumber(base) === null) return false;
      // 仅「新建场景文档 / 新建场景测试文件」（canonical target 尚不存在）参与定稿；
      // MODIFY 既有场景的 delta（core-S09-change-lifecycle.md 等）不是取号行为，严禁重排。
      const creatable = rel.startsWith('prd/3-technical-plan/2-scenario-implementation/') || rel.startsWith('test/');
      return creatable && !existsSync(join(root, 'logos', 'resources', rel));
    })
    .map(f => proposedScenarioNumber(f.split('/').pop() ?? f))
    .filter((n): n is number => n !== null);
  const plan = planScenarioFinalization(proposed, landed, derived.next_scenario_id);
  if (plan.collisions.length > 0) {
    return {
      ok: false, errorCode: 'COLLAB_ID_COLLISION', renames: [], touchedFiles: [], warnings,
      message: `编号定稿防御检测失败：定稿号 ${plan.collisions.join('、')} 与已落盘集合冲突。请检查已落盘场景集合后重试。`,
    };
  }

  // ── 3. 应用改写（文件名 + 注册文法引用）──
  const touchedFiles: string[] = [];
  for (const rename of plan.renames) {
    const fromNum = Number(rename.fromId.slice(1));
    const toNum = Number(rename.toId.slice(1));
    for (const rel of deltaFiles) {
      const abs = join(deltasDir, rel);
      const original = readFileSync(abs, 'utf-8');
      const nextContent = renumberScenarioInContent(original, fromNum, toNum);
      const base = rel.split('/').pop() ?? rel;
      const nextBase = base.replace(new RegExp(`-S${fromNum}(?=[-.])`, 'i'), `-S${toNum}`);
      const nextRel = rel.slice(0, rel.length - base.length) + nextBase;
      if (nextContent !== original) {
        writeFileSync(abs, nextContent);
        touchedFiles.push(`logos/changes/${changePath.split('/').pop()}/deltas/${rel}`);
      }
      if (nextBase !== base) {
        renameSync(abs, join(deltasDir, nextRel));
        touchedFiles.push(`logos/changes/${changePath.split('/').pop()}/deltas/${nextRel}`);
      }
    }
  }

  // ── 4. FXX 轻量定稿：delta 正文 `- id: FXX` 登记行与已落盘 features[] 冲突时重排 ──
  const landedFeatures = new Set<number>((yaml.data?.features ?? [])
    .map(f => /^F(\d+)$/i.exec(f.id.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => Number(m[1])));
  const featureRenames: IdRename[] = [];
  {
    let nextFeature = derived.next_feature_id;
    const occupied = new Set(landedFeatures);
    const proposedFeatures = new Set<number>();
    // SXX 定稿可能已重命名文件——重新枚举 deltas，避免按旧列表读到不存在的路径
    for (const rel of listDeltaMarkdown(deltasDir)) {
      const content = readFileSync(join(deltasDir, rel), 'utf-8');
      for (const m of content.matchAll(/^\s*-?\s*id:\s*F(\d+)\s*$/gim)) proposedFeatures.add(Number(m[1]));
    }
    for (const f of [...proposedFeatures].sort((a, b) => a - b)) {
      if (!landedFeatures.has(f)) { occupied.add(f); continue; }
      while (occupied.has(nextFeature)) nextFeature += 1;
      featureRenames.push({ fromId: `F${f}`, toId: `F${nextFeature}` });
      occupied.add(nextFeature);
      nextFeature += 1;
    }
  }
  for (const rename of featureRenames) {
    const fromNum = Number(rename.fromId.slice(1));
    const toNum = Number(rename.toId.slice(1));
    for (const rel of listDeltaMarkdown(deltasDir)) {
      const abs = join(deltasDir, rel);
      const original = readFileSync(abs, 'utf-8');
      const nextContent = original
        .replaceAll(new RegExp(`^(\\s*-?\\s*id:\\s*)F${fromNum}\\s*$`, 'gim'), `$1F${toNum}`)
        .replaceAll(new RegExp(`^(\\s*feature:\\s*)F${fromNum}\\s*$`, 'gim'), `$1F${toNum}`);
      if (nextContent !== original) {
        writeFileSync(abs, nextContent);
        touchedFiles.push(`logos/changes/${changePath.split('/').pop()}/deltas/${rel}`);
      }
    }
  }

  return { ok: true, renames: [...plan.renames, ...featureRenames], touchedFiles, warnings };
}
