# PartyServer Agent Guidelines

This document provides essential information for AI coding agents working in the PartyServer monorepo.

## Repository Structure

PartyServer is a **monorepo** using npm workspaces with multiple packages:

- `packages/partyserver` - Core library for Durable Objects with WebSocket support
- `packages/partysocket` - Reconnecting WebSocket client library
- `packages/y-partyserver` - Yjs CRDT support for PartyServer
- `packages/partysub` - Pub/sub at scale
- `packages/partysync` - State synchronization (experimental)
- `packages/partywhen` - Task scheduling at scale
- `packages/hono-party` - Hono middleware
- `fixtures/*` - Self-contained examples

## Build & Development Commands

### Root-level commands (from `/Users/sunilpai/code/partyserver`)

```bash
npm run build              # Build all packages
npm run check              # Run all checks (format, lint, type, test)
npm run format             # Format code with Prettier
npm run check:format       # Check code formatting
npm run check:lint         # Run Biome linter
npm run check:type         # Type-check all packages
npm run check:test         # Run all tests
npm run check:repo         # Run sherif (monorepo consistency)
```

### Package-level commands (from `packages/[package-name]/`)

```bash
npm run build              # Build the package (uses tsdown)
npm run check:test         # Run tests with vitest
```

### Running tests

```bash
# Run all tests in a package
cd packages/partysocket && npm run check:test

# Run a single test file
npx vitest src/tests/reconnecting.test.ts

# Run tests in watch mode
npx vitest --watch

# Run tests with specific pattern
npx vitest reconnecting
```

## Code Style Guidelines

### Formatting

- **Formatter**: Prettier (NOT Biome formatter - it's disabled)
- **Quote style**: Double quotes (`"`)
- **Trailing commas**: None
- **Line length**: Default Prettier settings
- Run `npm run format` before committing

### Linting

- **Linter**: Biome (configured in `biome.json`)
- Recommended rules enabled with specific overrides:
  - `noNonNullAssertion`: off (non-null assertions allowed)
  - `noParameterAssign`: off (parameter reassignment allowed)
  - `noForEach`: off (forEach allowed)
  - `noRedeclare`: off
- Run `npm run check:lint` to verify

### TypeScript

- **Target**: ESNext
- **Module**: ESNext with Bundler resolution
- **Strict mode**: Enabled
- **JSX**: react-jsx
- Use `noEmit: true` (compilation handled by tsdown)
- Use `verbatimModuleSyntax: true`
- Use `isolatedModules: true`
- `skipLibCheck: true` for performance

### Import Conventions

```typescript
// 1. Import from relative modules first
import ReconnectingWebSocket from "./ws";

// 2. Then type imports (prefer `import type`)
import type * as RWS from "./ws";
import type { Connection } from "./types";

// 3. Use type-only imports when importing only types
// This helps with tree-shaking and clarity
```

### Naming Conventions

- **Classes**: PascalCase (e.g., `PartySocket`, `ReconnectingWebSocket`)
- **Functions/methods**: camelCase (e.g., `getPartyInfo`, `_handleOpen`)
- **Private methods**: Prefix with underscore (e.g., `_connect`, `_debugLogger`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `PORT`, `DEFAULT`)
- **Types/Interfaces**: PascalCase (e.g., `PartySocketOptions`, `EventHandlerOptions`)
- **Type aliases**: PascalCase for complex types, camelCase for simple utilities

### Error Handling

```typescript
// Use console.error for critical errors with helpful context
console.error(`‼️ No WebSocket implementation available...`);

// Use console.warn for warnings
console.warn(`PartySocket: party name "${name}" contains forward slash...`);

// For debug logging, use the debug flag pattern
private _debug(...args: unknown[]) {
  if (this._options.debug) {
    this._debugLogger("RWS>", ...args);
  }
}

// Throw errors with descriptive messages
throw new Error("path must not start with a slash");

// Use assert for internal invariants
function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}
```

### Comments

- Use `// TODO:` for action items
- Use JSDoc for public API documentation
- Prefer descriptive names over comments
- Use `biome-ignore` or `@ts-expect-error` with explanations when necessary:
  ```typescript
  // biome-ignore lint/suspicious/noExplicitAny: legacy code
  // @ts-expect-error ws types are weird
  ```

### Code Organization

- Group related functionality together
- Public methods before private methods
- Use `readonly` for constructor parameters when appropriate
- Prefer composition over inheritance
- Keep files focused (single responsibility)

## Testing Guidelines

- Use Vitest for all tests
- Place tests in `src/tests/` directory
- Use `@vitest-environment jsdom` directive when needed
- Mock external dependencies appropriately
- Write descriptive test names
- Use `beforeAll`, `afterAll`, `beforeEach`, `afterEach` for setup/teardown

## Git & Versioning

- Use Changesets for version management (`.changeset/`)
- Write clear, descriptive commit messages
- Keep commits focused on a single change
- Test before committing

## Package Publishing

- Dual format: ESM and CommonJS
- Generate both `.d.ts` and `.d.cts` declaration files
- Run prettier on generated output files (handled by build scripts)
- Use `tsdown` for building packages
- Verify exports with `scripts/check-exports.ts`

## Performance Notes

- Avoid `forEach` where performance matters (but allowed by linter)
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Prefer `const` over `let` when possible
- Be mindful of bundle size (tree-shaking friendly exports)

## Common Patterns

- Use EventTarget for event handling in browser/Node compatibility
- Clone events when re-dispatching them
- Use exponential backoff for reconnection logic
- Provide both callback and event listener APIs
- Support both string and function-based configuration
