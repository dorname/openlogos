/**
 * multi-user-collaboration（S45 / D17）：sync 收敛重排器（读侧撞号消解）。
 *
 * 协议（spec/change-management.md §多人协作 3.1.3）：
 * - pull / merge-back 之后、push 之前，扫描已落盘 S/D 全集检出同号异 slug；
 * - origin 可见（已推送）编号冻结；对本 clone 未推送工件按注册文法确定性重排至空号；
 * - 输出 diff 清单；文法外歧义引用 fail-closed（整体不落盘，无半套重排）；
 * - 重排后由 sync 既有 syncResourceIndex 步骤完成 resource_index 重建；幂等、离线可用。
 */
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultCollabExec, renumberScenarioInContent, resolveOriginRef, type CollabExec } from './collab-preflight.js';

export interface AmbiguousRef { file: string; line: number; text: string }
export interface ReconcileRename {
  kind: 'scenario' | 'decision';
  fromId: string;
  toId: string;
  files: string[];
}
export interface ReconcileResult {
  ok: boolean;
  renames: ReconcileRename[];
  /** 文法外歧义引用（非空时 ok=false、整体不落盘） */
  ambiguous: AmbiguousRef[];
  /** 双方均已推送的同号（防御报告，不自动改写；不阻塞 sync） */
  pushedCollisions: string[];
  /** 附注（如 yaml 同号多条目需人工核对） */
  notes: string[];
  message?: string;
}

interface Artifact { path: string; num: number }

function listArtifacts(root: string): { scenarios: Artifact[]; decisions: Artifact[] } {
  const scenarios: Artifact[] = [];
  const decisions: Artifact[] = [];
  const scenarioDirs = [
    join(root, 'logos', 'resources', 'prd', '3-technical-plan', '2-scenario-implementation'),
    join(root, 'logos', 'resources', 'test'),
  ];
  for (const dir of scenarioDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const m = /-S(\d+)-[^/\\]+\.md$/i.exec(name);
      if (m) scenarios.push({ path: `${dir.slice(root.length + 1)}/${name}`.replaceAll('\\', '/'), num: Number(m[1]) });
    }
  }
  const decisionsDir = join(root, 'logos', 'resources', 'decisions');
  if (existsSync(decisionsDir)) {
    for (const name of readdirSync(decisionsDir)) {
      const m = /-D(\d+)-[^/\\]+\.md$/i.exec(name);
      if (m) decisions.push({ path: `logos/resources/decisions/${name}`, num: Number(m[1]) });
    }
  }
  return { scenarios, decisions };
}

function originVisible(root: string, relPath: string, exec: CollabExec): boolean {
  const originRef = resolveOriginRef(root, exec);
  if (!originRef) return false; // 无远端：全部视为本地未推送
  const r = exec(['cat-file', '-e', `${originRef}:${relPath}`], root);
  return r.status === 0;
}

/** 文法外歧义检测：裸 `S<num>` 出现且不属于注册文法位置（测试 ID / -AC- / 文件名 / 标题行 / yaml id 行）。 */
export function findAmbiguousScenarioRefs(content: string, file: string, num: number): AmbiguousRef[] {
  const out: AmbiguousRef[] = [];
  const token = new RegExp(`\\bS${num}\\b`);
  content.split(/\r?\n/).forEach((text, idx) => {
    if (!token.test(text)) return;
    // 注册文法位置（这些行内的出现均属确定性改写范围）
    const registered = new RegExp(
      `(UT|ST|SMOKE)-S${num}-`           // 测试 ID
      + `|S${num}-AC-`                    // 验收条件 ID
      + `|-S${num}[-.]`                   // 文件名引用
      + `|^#{1,6}\\s+S${num}([:：\\s]|$)` // Markdown 标题
      + `|^\\s*-?\\s*id:\\s*S${num}\\s*$`,// yaml 登记行
    );
    // 去掉注册文法片段后仍有裸 token → 歧义
    const stripped = text.replace(new RegExp(`(UT|ST|SMOKE)-S${num}-`, 'g'), '')
      .replace(new RegExp(`S${num}-AC-`, 'g'), '')
      .replace(new RegExp(`-S${num}[-.]`, 'g'), '')
      .replace(new RegExp(`^#{1,6}\\s+S${num}([:：\\s]|$)`), '')
      .replace(new RegExp(`^\\s*-?\\s*id:\\s*S${num}\\s*$`), '');
    if (!registered.test(text) || token.test(stripped)) {
      out.push({ file, line: idx + 1, text: text.trim() });
    }
  });
  return out;
}

export interface ReconcileOptions { exec?: CollabExec }

/**
 * 扫描并收敛同号异 slug。无冲突 → ok=true、renames=[]（幂等）。
 * 有本地可重排工件 → 执行重排并返回 diff 清单；歧义 → ok=false 整体不落盘。
 */
export function runReconcile(root: string, opts: ReconcileOptions = {}): ReconcileResult {
  const exec = opts.exec ?? defaultCollabExec;
  const { scenarios, decisions } = listArtifacts(root);
  const result: ReconcileResult = { ok: true, renames: [], ambiguous: [], pushedCollisions: [], notes: [] };

  // ── 场景同号分组 ──
  // 冲突判据：同号的**场景文档** ≥2 份不同文件，或同号的**测试文件** ≥2 份不同模块前缀；
  // 同 slug 的场景文档 + 其测试文件（core-S44-a.md 与 core-S44-test-cases.md）是同一工件，不判冲突。
  const isScenarioDoc = (a: Artifact) => a.path.includes('2-scenario-implementation/');
  const modulePrefix = (a: Artifact) => (a.path.split('/').pop() ?? a.path).split('-')[0];
  const byNum = new Map<number, Artifact[]>();
  for (const a of scenarios) {
    const group = byNum.get(a.num) ?? [];
    group.push(a);
    byNum.set(a.num, group);
  }
  const maxLanded = scenarios.length > 0 ? Math.max(...scenarios.map(a => a.num)) : 0;
  let next = maxLanded + 1;

  interface Pending { fromNum: number; toNum: number; files: string[] }
  const pending: Pending[] = [];

  for (const [num, group] of [...byNum.entries()].sort((a, b) => a[0] - b[0])) {
    const scenarioDocs = group.filter(isScenarioDoc);
    const testDocs = group.filter(a => !isScenarioDoc(a));
    const testModules = new Set(testDocs.map(modulePrefix));
    if (scenarioDocs.length < 2 && testDocs.length < 2) continue;
    if (scenarioDocs.length < 2 && testModules.size < 2) continue;

    const withOrigin = group.map(a => ({ ...a, origin: originVisible(root, a.path, exec) }));
    const originOccupied = withOrigin.some(a => a.origin);
    let local = withOrigin.filter(a => !a.origin);
    if (local.length === 0) {
      // 双方均已推送：防御报告，不自动改写（EX-45.2）
      result.pushedCollisions.push(`S${num}：${group.map(a => a.path).join('、')}（均已推送，需开 fix 提案人工重排）`);
      continue;
    }
    if (!originOccupied) {
      // 全部本地未推送：保留字典序最小场景文档所在 slug 组（含其同模块测试文件），其余重排
      const sortedDocs = local.filter(isScenarioDoc).sort((a, b) => a.path.localeCompare(b.path));
      if (sortedDocs.length > 0) {
        const keep = sortedDocs[0];
        const keepModule = modulePrefix(keep);
        local = local.filter(a => a.path !== keep.path && modulePrefix(a) !== keepModule);
      } else {
        local.sort((a, b) => a.path.localeCompare(b.path));
        local.shift();
      }
    }
    if (local.length === 0) continue;
    while ([...byNum.keys()].includes(next)) next += 1;
    pending.push({ fromNum: num, toNum: next, files: local.map(a => a.path) });
    byNum.set(next, []);
    next += 1;
  }

  // ── 文法外歧义预检（任一歧义 → 整体不落盘）──
  for (const p of pending) {
    for (const rel of p.files) {
      const content = readFileSync(join(root, rel), 'utf-8');
      result.ambiguous.push(...findAmbiguousScenarioRefs(content, rel, p.fromNum));
    }
  }
  if (result.ambiguous.length > 0) {
    result.ok = false;
    result.message = '检测到注册文法外的歧义编号引用，无法安全自动重排；请人工处理以下位置后重跑 openlogos sync（整体未落盘）。';
    return result;
  }

  // ── 应用重排（文件名 + 内容引用 + yaml scenarios[] 登记）──
  const yamlPath = join(root, 'logos', 'logos-project.yaml');
  for (const p of pending) {
    const touched: string[] = [];
    for (const rel of p.files) {
      const abs = join(root, rel);
      const original = readFileSync(abs, 'utf-8');
      const nextContent = renumberScenarioInContent(original, p.fromNum, p.toNum);
      if (nextContent !== original) writeFileSync(abs, nextContent);
      const base = rel.split('/').pop() ?? rel;
      const nextBase = base.replace(new RegExp(`-S${p.fromNum}(?=[-.])`, 'i'), `-S${p.toNum}`);
      const nextRel = rel.slice(0, rel.length - base.length) + nextBase;
      if (nextRel !== rel) renameSync(abs, join(root, nextRel));
      touched.push(nextRel);
    }
    // yaml scenarios[]：同号条目按「origin 不可见」语义改号（本提案新增登记随工件重排）；
    // 同号多条目时无法行级区分归属 → 留人工核对（附注，不做全局替换）。
    if (existsSync(yamlPath)) {
      const yamlText = readFileSync(yamlPath, 'utf-8');
      const entryPattern = new RegExp(`^\\s*-?\\s*id:\\s*S${p.fromNum}\\s*$`, 'gim');
      const matches = yamlText.match(entryPattern) ?? [];
      if (matches.length === 1) {
        const nextYaml = yamlText.replace(new RegExp(`^(\\s*-?\\s*id:\\s*)S${p.fromNum}\\s*$`, 'im'), `$1S${p.toNum}`);
        if (nextYaml !== yamlText) {
          writeFileSync(yamlPath, nextYaml);
          touched.push('logos/logos-project.yaml');
        }
      } else if (matches.length > 1) {
        result.notes.push(`logos-project.yaml 中 id: S${p.fromNum} 有 ${matches.length} 条登记，无法行级区分归属，请人工核对后改为 S${p.toNum}（仅本地未推送那条）。`);
      }
    }
    result.renames.push({ kind: 'scenario', fromId: `S${p.fromNum}`, toId: `S${p.toNum}`, files: touched });
  }

  // ── 决策同号分组（基础：文件名 + `# DXX` 标题 + 决策：DXX 引用）──
  const dByNum = new Map<number, Artifact[]>();
  for (const a of decisions) {
    const group = dByNum.get(a.num) ?? [];
    group.push(a);
    dByNum.set(a.num, group);
  }
  let dNext = decisions.length > 0 ? Math.max(...decisions.map(a => a.num)) + 1 : 1;
  for (const [num, group] of [...dByNum.entries()].sort((a, b) => a[0] - b[0])) {
    if (group.length < 2) continue;
    const withOrigin = group.map(a => ({ ...a, origin: originVisible(root, a.path, exec) }));
    const local = withOrigin.filter(a => !a.origin);
    if (local.length === 0) {
      result.pushedCollisions.push(`D${num}：${group.map(a => a.path).join('、')}（均已推送，需人工重排）`);
      continue;
    }
    while ([...dByNum.keys()].includes(dNext)) dNext += 1;
    const touched: string[] = [];
    for (const a of local) {
      const abs = join(root, a.path);
      const original = readFileSync(abs, 'utf-8');
      const nextContent = original
        .replaceAll(new RegExp(`^(#{1,6}\\s+)D${num}(?=[:：\\s]|$)`, 'gm'), `$1D${dNext}`)
        .replaceAll(new RegExp(`决策：D${num}\\b`, 'g'), `决策：D${dNext}`);
      if (nextContent !== original) writeFileSync(abs, nextContent);
      const base = a.path.split('/').pop() ?? a.path;
      const nextBase = base.replace(new RegExp(`-D${num}-`, 'i'), `-D${dNext}-`);
      const nextRel = `logos/resources/decisions/${nextBase}`;
      if (nextBase !== base) renameSync(abs, join(root, nextRel));
      touched.push(nextRel);
    }
    result.renames.push({ kind: 'decision', fromId: `D${num}`, toId: `D${dNext}`, files: touched });
    dByNum.set(dNext, []);
    dNext += 1;
  }

  return result;
}
