import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', '.git']);
const DEPRECATED_ROOT_FILES = new Set([
  normalize(resolve(REPO_ROOT, 'midiAnalysis.ts')),
  normalize(resolve(REPO_ROOT, 'midiAnalysis'))
]);

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRECTORIES.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath, files);
      continue;
    }

    if (SOURCE_EXTENSIONS.has(extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveImportSpecifier(specifier, importerFile) {
  if (specifier.startsWith('@/')) {
    return normalize(resolve(REPO_ROOT, specifier.slice(2)));
  }

  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return normalize(resolve(dirname(importerFile), specifier));
  }

  if (specifier === 'midiAnalysis' || specifier === 'midiAnalysis.ts') {
    return normalize(resolve(REPO_ROOT, 'midiAnalysis.ts'));
  }

  return null;
}

function isDeprecatedImport(specifier, importerFile) {
  const resolved = resolveImportSpecifier(specifier, importerFile);
  return resolved ? DEPRECATED_ROOT_FILES.has(resolved) : false;
}

const importPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
const files = collectFiles(REPO_ROOT);
const violations = [];

for (const file of files) {
  const relativePath = relative(REPO_ROOT, file);
  if (relativePath === 'midiAnalysis.ts') continue;

  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (isDeprecatedImport(specifier, file)) {
      violations.push({ file: relativePath, specifier });
    }
  }
}

if (violations.length > 0) {
  console.error('Deprecated analysis import paths detected. Use @analysis/midi instead.');
  for (const violation of violations) {
    console.error(` - ${violation.file}: ${violation.specifier}`);
  }
  process.exit(1);
}

console.log('Deprecated analysis import check passed.');
