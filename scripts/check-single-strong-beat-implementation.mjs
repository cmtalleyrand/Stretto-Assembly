import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', '.git']);
const APPROVED_MODULE = normalize(resolve(REPO_ROOT, 'components/services/metric/beatStrength.ts'));

function collectFiles(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        if (EXCLUDED_DIRECTORIES.has(entry)) continue;
        const fullPath = join(dir, entry);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
            collectFiles(fullPath, files);
            continue;
        }
        if (SOURCE_EXTENSIONS.has(extname(fullPath))) files.push(fullPath);
    }
    return files;
}

function isProductionSource(filePath) {
    const rel = relative(REPO_ROOT, filePath).replaceAll('\\', '/');
    if (rel.startsWith('scripts/')) return false;
    if (/(\.|-)(test|spec)\./.test(rel)) return false;
    if (rel.includes('/test/') || rel.includes('/tests/')) return false;
    return true;
}

const definitionPattern = /\bfunction\s+isStrongBeat\s*\(|\b(?:const|let|var)\s+isStrongBeat\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>/g;
const files = collectFiles(REPO_ROOT).filter(isProductionSource);
const violations = [];
let approvedImplementationCount = 0;

for (const file of files) {
    const content = readFileSync(file, 'utf8');
    let matches = 0;
    for (const _ of content.matchAll(definitionPattern)) matches += 1;
    if (matches === 0) continue;

    const normalizedFile = normalize(file);
    if (normalizedFile === APPROVED_MODULE) {
        approvedImplementationCount += matches;
        continue;
    }

    violations.push({ file: relative(REPO_ROOT, file), matches });
}

if (approvedImplementationCount !== 1) {
    console.error(`Expected exactly one approved isStrongBeat implementation in ${relative(REPO_ROOT, APPROVED_MODULE)}; found ${approvedImplementationCount}.`);
    process.exit(1);
}

if (violations.length > 0) {
    console.error('Duplicate production isStrongBeat implementations detected outside the approved module:');
    for (const violation of violations) {
        console.error(` - ${violation.file}: ${violation.matches}`);
    }
    process.exit(1);
}

console.log('Strong-beat implementation uniqueness check passed.');
