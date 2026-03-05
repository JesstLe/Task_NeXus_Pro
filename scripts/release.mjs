import fs from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
if (!mode || !['installer', 'portable'].includes(mode)) {
  console.error('Usage: node scripts/release.mjs <installer|portable>');
  process.exit(1);
}

const rootDir = path.resolve(process.cwd());
const tauriTargetDir = path.join(rootDir, 'src-tauri', 'target');
const outDir = path.join(rootDir, 'release', mode);
const packageJsonPath = path.join(rootDir, 'package.json');

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...(await walk(full)));
    } else if (e.isFile()) {
      results.push(full);
    }
  }
  return results;
}

async function copyFile(src, destDir) {
  const base = path.basename(src);
  const dest = path.join(destDir, base);
  await fs.copyFile(src, dest);
  return dest;
}

async function copyFileAs(src, destDir, baseName) {
  const dest = path.join(destDir, baseName);
  await fs.copyFile(src, dest);
  return dest;
}

async function readPackageVersion() {
  const text = await fs.readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(text);
  const v = String(pkg?.version || '').trim();
  return v || null;
}

async function findPortableExe() {
  const expected = path.join(tauriTargetDir, 'release', 'task-nexus.exe');
  if (await fileExists(expected)) return expected;

  const releaseDir = path.join(tauriTargetDir, 'release');
  const entries = await fs.readdir(releaseDir, { withFileTypes: true });
  const candidates = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = path.join(releaseDir, e.name);
    if (e.name.toLowerCase().endsWith('.exe')) {
      const stat = await fs.stat(full);
      candidates.push({ full, mtimeMs: stat.mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.full ?? null;
}

async function main() {
  await ensureDir(outDir);
  const targetExists = await fileExists(tauriTargetDir);
  if (!targetExists) {
    throw new Error(`target directory not found: ${tauriTargetDir}`);
  }

  if (mode === 'portable') {
    const exe = await findPortableExe();
    if (!exe) throw new Error(`portable exe not found under: ${path.join(tauriTargetDir, 'release')}`);
    const copied = await copyFile(exe, outDir);
    console.log(`portable: ${copied}`);

    const version = await readPackageVersion();
    if (version) {
      const versioned = await copyFileAs(exe, outDir, `TN${version}.exe`);
      console.log(`portable: ${versioned}`);
    }
    return;
  }

  const bundleDir = path.join(tauriTargetDir, 'release', 'bundle');
  if (!(await fileExists(bundleDir))) {
    throw new Error(`bundle directory not found: ${bundleDir}`);
  }
  const files = await walk(bundleDir);
  const installers = files.filter((p) => {
    const lower = p.toLowerCase();
    return lower.endsWith('.msi') || (lower.endsWith('.exe') && lower.includes('setup'));
  });
  if (installers.length === 0) {
    throw new Error(`no installer found under: ${bundleDir}`);
  }
  const copied = [];
  for (const f of installers) {
    copied.push(await copyFile(f, outDir));
  }
  for (const p of copied) console.log(`installer: ${p}`);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
