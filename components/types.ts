/**
 * @deprecated Compatibility shim.
 *
 * Single source of truth for shared TypeScript models is the repository-root
 * `types.ts`. Import from `../types` (or equivalent path to root) instead of
 * `components/types`.
 *
 * This file is intentionally a short-lived re-export layer to avoid transient
 * breakage while downstream imports are migrated.
 */
export * from '../types';
