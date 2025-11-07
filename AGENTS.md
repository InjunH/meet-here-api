# Repository Guidelines

## Project Structure & Module Organization
- `src/app.ts`: Express entrypoint. Core code lives under `src/`.
- Key modules: `routes/`, `socket/`, `services/`, `repositories/`, `middleware/`, `utils/`, `config/`, `db/`, `errors/`, `data/`, `schemas/`, `types/`.
- Tests: `tests/unit/`, `tests/integration/`, shared helpers in `tests/helpers/`.
- Docs: `docs/*` for API and operations guides. Env sample: `.env.example`.

## Build, Test, and Development Commands
- `npm run dev`: Start development server (TSX watch) from `src/app.ts`.
- `npm run build`: TypeScript compile to `dist/` via `tsc`.
- `npm start`: Run compiled server (`dist/app.js`).
- `npm run lint` | `lint:fix`: ESLint check/fix for `src/`.
- `npm test` | `test:watch` | `test:coverage`: Jest tests and coverage.
- DB (Drizzle): `db:generate`, `db:migrate`, `db:push`, `db:studio`.

## Coding Style & Naming Conventions
- Language: TypeScript (ESM). Node >= 20.
- Formatting enforced by ESLint: 2-space indent, semicolons, single quotes, `prefer-const`, no `var`, 1TBS braces, Unix linebreaks.
- Naming: camelCase for functions/vars, PascalCase for types/classes, kebab-case for filenames (e.g., `meeting-point.service.ts`).
- Keep modules small and focused; export via `index.ts` where present.

## Testing Guidelines
- Framework: Jest + ts-jest (ESM) + Supertest.
- Structure: unit tests in `tests/unit/`, integration in `tests/integration/`.
- Naming: `*.test.ts` or `*.spec.ts`. Use `tests/setup.ts` for hooks.
- Coverage: global threshold 70% (branches, funcs, lines, statements).
- Run locally: `npm test` or `npm run test:coverage` before PRs.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc. Keep subjects concise; add context in body.
- PRs must include: clear description, linked issues, test results, and API examples when relevant (cURL or updates to `MeetHere-API.postman_collection.json`).
- CI hygiene: run `npm run lint` and `npm test`; update docs in `docs/` and `.env.example` when contracts/config change.

## Security & Configuration Tips
- Never commit secrets. Copy `.env.example` to `.env` and set `KAKAO_API_KEY`, `DATABASE_URL`, `REDIS_URL`, etc.
- Review security middleware (`src/middleware/security.ts`, `rateLimiter.ts`) and CORS before changing defaults.
- Use `src/utils/logger.ts` for structured logs; avoid `console.log` in app code.

## Agent-Specific Notes
- Place new code under the appropriate `src/` module; avoid gratuitous renames.
- Update or add tests alongside code changes, and keep changes minimal and focused.
- If you change API behavior, update routes, schemas, and docs together.
