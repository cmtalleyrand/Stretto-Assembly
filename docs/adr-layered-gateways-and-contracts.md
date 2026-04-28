# ADR: Layered Architecture with Stable Gateway Contracts

- **Date:** 2026-04-20
- **Status:** Accepted

## Context

The codebase currently mixes UI orchestration, use-case coordination, domain search logic, IO adapters (HTTP, workers, localStorage), and playback drivers inside tightly-coupled modules. This coupling increases the probability of cyclic imports and reduces substitution capability for tests or alternate infrastructure.

## Decision

Adopt a three-layer architecture with explicit dependency inversion via TypeScript contracts.

### Layer 1: Presentation

- Scope: `components/**/*.tsx` and UI-facing hooks.
- Responsibility: render state, collect user intent, dispatch use-case actions.
- Constraint: presentation modules depend on **contracts only** (interfaces + DTO-like types), not concrete infrastructure implementations.

### Layer 2: Application Orchestration

- Scope: `hooks/` and use-case services.
- Responsibility: coordinate workflows (e.g., assembly retries, progress handling, validation passes), invoke gateways, map responses to UI state.
- Characteristic: deterministic control-flow and policy logic; no direct persistence/network/worker primitives without gateway indirection.

### Layer 3: Domain + Infrastructure

- Scope: `components/services/**/*.ts`, workers, HTTP clients, storage adapters.
- Responsibility: search algorithms, canon/chain engines, worker runtime execution, transport adapters (`/api/assembly`), playback runtime, persistence backends.

## Contracts

Contracts are placed in a neutral module to prevent import cycles:

- `components/services/contracts/gateways.ts`
  - `SearchGateway`: chain and canon execution.
  - `AssemblyGateway`: `/api/assembly` interaction.
  - `SubjectRepository`: subject-library persistence.
  - `PlaybackGateway`: playback transport (`playSequence`/`stop`).

Implementations are currently provided in:

- `components/services/gateways/defaultGateways.ts`

## Dependency Rule

1. Presentation imports only contracts and view-level types.
2. Concrete implementations are injected from composition roots (e.g., `App.tsx`).
3. Domain/infrastructure never imports presentation modules.

This yields an acyclic dependency graph where higher layers depend on abstractions and lower layers satisfy those abstractions.

## Consequences

### Positive

- Reduced cyclic-import risk via neutral contracts module.
- Compile-time substitutability for tests and alternate runtime implementations.
- Improved boundary clarity between policy/orchestration and infrastructure.

### Trade-offs

- Additional interface and adapter maintenance cost.
- Slightly larger constructor/prop surfaces due to dependency injection.

## Verification Strategy

A type-only contract test is added to ensure `StrettoView` and orchestration hooks reference interfaces rather than concrete modules. The verification is compile-time only and has O(1) runtime cost because it emits no runtime code.
