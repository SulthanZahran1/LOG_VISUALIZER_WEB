---
description: How to test changes before using browser agent
---

# Testing Workflow

**Always run these tests BEFORE using the browser agent.** This catches most issues with much less token usage.

## Test Hierarchy (Run in order)

```
1. TypeCheck   → Catches type errors
2. Lint        → Catches code quality issues  
3. Unit Tests  → Catches logic errors (fast)
4. E2E Tests   → Catches integration errors (automated browser)
5. Browser Agent → Edge cases only (expensive, use sparingly)
```

## Commands

### Step 1: Type Check
// turbo
```bash
cd frontend && npm run typecheck
```
Fix any TypeScript errors before proceeding.

### Step 2: Lint
// turbo
```bash
cd frontend && npm run lint
```
Fix any lint errors. Use `npm run lint:fix` for auto-fixable issues.

### Step 3: Unit Tests
// turbo
```bash
cd frontend && npm run test
```
All unit tests should pass. If tests fail, fix the code or update the tests.

### Step 4: E2E Tests (requires backend running)
```bash
cd frontend && npm run test:e2e
```
E2E tests run against the actual app. Make sure backend is running on port 8080.

### Step 5: Browser Agent (only if needed)
Only use the browser agent for:
- Visual verification that can't be automated
- Complex user interactions
- Edge cases not covered by E2E tests

## Quick Commands

Run all tests at once:
// turbo
```bash
cd frontend && npm run test:all
```

Run tests in watch mode during development:
```bash
cd frontend && npm run test:watch
```

## Adding New Tests

### Unit Tests
- Create `*.test.ts` or `*.test.tsx` files next to the source file
- Use Vitest + Testing Library
- Test pure functions, component rendering, signal stores

### E2E Tests
- Add tests to `frontend/e2e/` directory
- Use Playwright API
- Test user flows, page navigation, form submissions

## Coverage Report

Generate coverage report:
```bash
cd frontend && npm run test:coverage
```

Coverage report is saved to `frontend/coverage/` directory.
