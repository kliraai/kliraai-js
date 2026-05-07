# Contributing to the Klira AI JavaScript SDK

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it easier for maintainers and smooth out the experience for everyone involved. The community looks forward to your contributions. 🎉

> If you like the project but don't have time to contribute, that's fine. There are other easy ways to support the project:
> - Star the project on GitHub
> - Tweet about it
> - Reference this project in your project's README
> - Mention the project at local meetups and tell your friends/colleagues

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [I Have a Question](#i-have-a-question)
- [I Want to Contribute](#i-want-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Improving the Documentation](#improving-the-documentation)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Styleguides](#styleguides)
  - [TypeScript Code Style](#typescript-code-style)
  - [Commit Messages](#commit-messages)
- [Attribution](#attribution)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to **hello@getklira.com**.

## I Have a Question

> If you want to ask a question, we assume that you have read the available [Documentation](https://docs.getklira.com).

Before you ask a question, search existing [Issues](https://github.com/kliraai/kliraai-js/issues) that might help you. If you find a suitable issue and still need clarification, comment on it. Searching the web (Stack Overflow, the OpenTelemetry community) is also a good first step.

If you still need to ask:

- Open an [Issue](https://github.com/kliraai/kliraai-js/issues/new).
- Provide as much context as you can.
- Include your Node.js version, OS, and any relevant package versions (`npm ls klira`, `npm ls @opentelemetry/api`, etc.).

## I Want to Contribute

> ### Legal Notice
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content, and that the content you contribute may be provided under the project license (Apache 2.0).

### Reporting Bugs

#### Before Submitting a Bug Report

A good bug report shouldn't leave others needing to chase you up for more information. Please:

- Make sure that you are using the latest version (`npm view klira version`).
- Determine if your bug is really a bug and not a configuration error (read the [documentation](https://docs.getklira.com)).
- Search [existing issues](https://github.com/kliraai/kliraai-js/issues?q=label%3Abug) to see if it has already been reported.
- Search the web (including Stack Overflow) to see if users outside GitHub have discussed the issue.
- Collect:
  - Stack trace
  - OS, platform, version (Windows, Linux, macOS, x86, ARM)
  - Node.js version (`node -v`)
  - SDK version (`npm ls klira`)
  - Versions of any LLM provider SDKs (`@anthropic-ai/sdk`, `openai`, etc.)
  - Your input and the actual output
  - Whether you can reliably reproduce the issue (and if it reproduces against older versions)

#### How to Submit a Good Bug Report

> Never report security-related issues, vulnerabilities, or bugs containing sensitive information through the public issue tracker. Instead, email **hello@getklira.com**.

We use GitHub Issues to track bugs and errors. To file a bug:

- Open an [Issue](https://github.com/kliraai/kliraai-js/issues/new).
- Explain the expected behavior and the actual behavior.
- Provide reproduction steps — ideally a minimal reduced test case.
- Include the information from the previous section.

Once it's filed:

- The project team will label the issue.
- A team member will try to reproduce the issue.
- If the team can reproduce it, the issue will be marked `needs-fix` and triaged for implementation.

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion — completely new features and minor improvements to existing functionality.

#### Before Submitting an Enhancement

- Make sure you are using the latest version.
- Read the [documentation](https://docs.getklira.com) carefully — the functionality might already exist.
- Search existing issues to see if it's already been suggested.
- Consider whether the idea fits the project's scope. We aim for features useful to the majority of users; minority-user features might be better as add-on libraries.

#### How to Submit a Good Enhancement Suggestion

Enhancement suggestions are tracked as GitHub issues:

- Use a **clear, descriptive title**.
- Provide a **step-by-step description** of the suggested enhancement.
- Describe the **current behavior** and **expected behavior**, and why the new behavior would be better.
- Include screenshots or animated GIFs if helpful.
- Explain why the enhancement would be useful to most users.

### Your First Code Contribution

1. **Fork and clone**
   ```bash
   git clone https://github.com/<your-fork>/kliraai-js.git
   cd kliraai-js
   ```

2. **Install dependencies** — see [Development Setup](#development-setup).

3. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-fix-name
   ```

4. **Make your changes** — follow the [TypeScript Code Style](#typescript-code-style) guidelines, add tests, update docs as needed.

5. **Run the full check**
   ```bash
   npm run type-check
   npm run lint
   npm test
   ```

6. **Commit** — follow the [Commit Messages](#commit-messages) convention.

7. **Push and open a PR** against `main`.

### Improving the Documentation

The user-facing docs live in the separate [`kliraai/docs`](https://github.com/kliraai/docs) repo (Astro / Starlight). Inline JSDoc / TypeScript types live in the SDK source.

For SDK-source doc improvements:
- Edit JSDoc comments alongside the code.
- Run `npm run type-check` to verify TypeScript still compiles.
- Run `npm run build` to verify type declarations regenerate cleanly.

For the docs site, open a PR against the docs repo.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/kliraai/kliraai-js.git
   cd kliraai-js
   ```

2. **Install Node.js 18 or higher**
   ```bash
   node -v   # should be >=18
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Build**
   ```bash
   npm run build       # full build (type-check + tsup + copy YAMLs)
   npm run build:fast  # tsup + copy YAMLs only (no type-check, faster iteration)
   ```

5. **Run the example agents**
   ```bash
   npm run example:openai
   npm run example:langchain
   npm run example:custom
   ```

## Running Tests

```bash
npm test                # vitest, watch mode by default
npm test -- --run       # one-shot
npm run test:coverage   # with coverage report
npm run test:ui         # vitest UI
```

Type-check + lint:

```bash
npm run type-check
npm run lint
npm run lint:fix
```

Bundle-size budgets:

```bash
npm run size           # check against size-limit budgets
npm run size:why       # see what's pulling weight
```

## Styleguides

### TypeScript Code Style

1. **Type safety**
   - Use explicit types on public APIs.
   - Avoid `any` — prefer `unknown` and narrow at boundaries.
   - Prefer `interface` for public option bags, `type` for unions/aliases.

2. **Imports**
   - Order: built-in modules, then external packages, then internal `..` / `./` paths.
   - Use ESM (`import`) — the package is `"type": "module"`.
   - When importing types, use `import type { ... }`.

3. **Async**
   - Every wrapper returns `Promise`. Prefer `async` / `await`.
   - Avoid floating promises — use `void` when intentionally not awaiting.

4. **Comments**
   - Prefer JSDoc on exported symbols.
   - Inline comments should explain *why*, not *what*. Don't restate the code.

5. **Testing**
   - Write Vitest tests for every new behavior.
   - Wire in `InMemorySpanExporter` when asserting on spans (see existing `__tests__/`).
   - Aim for high test coverage. The CI run uses `npm run test:coverage`.

6. **Lint / format**
   - ESLint config is in `eslint.config.js`.
   - Run `npm run lint:fix` before committing.

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

**Format:**
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation only
- `style` — formatting / whitespace (no logic change)
- `refactor` — code change that doesn't fix a bug or add a feature
- `perf` — performance improvement
- `test` — tests only
- `build` — build system / external deps
- `ci` — CI configuration
- `chore` — other (e.g. version bumps)
- `revert` — revert a prior commit

**Examples:**
```
feat: add OpenAI Responses adapter
fix: resolve memory leak in guardrails engine singleton
docs: update Anthropic adapter examples
test: add cross-SDK parity diff for healthcare agent
```

**Guidelines:**
- Imperative mood ("Add feature", not "Added feature").
- First line ≤72 characters.
- Reference issues / PRs in the body or footer (`Refs PROD-764`).
- Use a `BREAKING CHANGE:` footer for breaking changes.
- **Do not use emojis** — they interfere with automated tooling.

## Attribution

This guide is based on **contributing.md**. [Make your own](https://contributing.md/).
