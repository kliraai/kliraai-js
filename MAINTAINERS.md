# Maintainers Guide

This document provides guidelines and responsibilities for maintainers of the Klira AI JavaScript SDK project.

## Becoming a Maintainer

Maintainers are contributors who have shown consistent dedication to the project and have demonstrated good judgment in code reviews and community interactions. To become a maintainer:

1. Make significant contributions to the project
2. Participate actively in code reviews
3. Help with documentation and community support
4. Show good judgment in technical decisions
5. Demonstrate commitment to the project's values and goals

## Maintainer Responsibilities

### Code Review
- Review pull requests promptly (within 48 hours)
- Ensure code quality and maintainability
- Verify test coverage and documentation
- Check for security implications
- Provide constructive feedback

### Issue Management
- Triage new issues
- Label issues appropriately
- Close invalid or duplicate issues
- Guide contributors to relevant documentation

### Documentation
- Keep documentation up to date
- Review and merge documentation PRs
- Ensure examples are current and working
- Update API documentation when needed

### Release Management
- Follow the release process
- Update version numbers
- Create release notes
- Tag releases in GitHub

### Community
- Welcome new contributors
- Answer questions in issues and discussions
- Help resolve conflicts
- Uphold the Code of Conduct

## Development Workflow

### Branch Management
- `main`: Production-ready code
- `develop`: Development branch (when applicable)
- `feature/*`: New features
- `fix/*`: Bug fixes
- `release/*`: Release preparation

### Pull Request Process
1. Review PR description and changes
2. Run tests locally (`npm test`)
3. Verify type-check (`npm run type-check`) and lint (`npm run lint`)
4. Verify documentation updates
5. Merge if approved

### Release Process
1. Create a release branch from `main`
2. Bump `package.json` version
3. Update `CHANGELOG.md`
4. Create release notes
5. Tag the release (`v0.X.Y`)
6. Publish to npm (`npm publish`)
7. Merge to `main`

## Communication Guidelines

### Response Times
- Pull requests: Within 48 hours
- Issues: Within 24 hours
- Security issues: Within 12 hours

### Communication Channels
- GitHub Issues and PRs
- GitHub Discussions
- Email (hello@getklira.com)

## Security Guidelines

- Never commit sensitive information
- Follow security best practices (see [SECURITY.md](SECURITY.md))
- Report security issues privately
- Review security-related PRs carefully

## Tools and Resources

### Development Tools
- npm for dependency management
- TypeScript (`tsc`) for type-checking
- ESLint for code style
- Vitest for testing
- tsup for building (ESM + CJS dual-format)
- size-limit for bundle-size budgets

### Important Links
- [Project Documentation](https://docs.getklira.com)
- [Issue Tracker](https://github.com/kliraai/kliraai-js/issues)
- [Pull Requests](https://github.com/kliraai/kliraai-js/pulls)
- [Security Policy](SECURITY.md)

## Getting Help

If you need help or have questions:
1. Check the documentation
2. Ask in GitHub Discussions
3. Contact other maintainers
4. Reach out to the core team

## Maintaining Your Status

To maintain your status as a maintainer:
1. Stay active in the project
2. Respond to issues and PRs promptly
3. Participate in discussions
4. Help mentor new contributors
5. Follow the Code of Conduct

Being a maintainer is a privilege, not a right. It requires dedication, good judgment, and a commitment to the project's success.
