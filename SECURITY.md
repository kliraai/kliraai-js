# Security Policy

## Supported Versions

We release patches for security vulnerabilities. The versions currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :x:                |

## Reporting a Vulnerability

We take the security of the Klira AI JavaScript SDK seriously. If you believe you have found a security vulnerability, please report it to us as described below.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **hello@getklira.com**. You should receive a response within 12 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

* Type of issue (e.g. prototype pollution, command injection, ReDoS, supply-chain compromise, etc.)
* Full paths of source file(s) related to the manifestation of the issue
* The location of the affected source code (tag / branch / commit or direct URL)
* Any special configuration required to reproduce the issue
* Step-by-step instructions to reproduce the issue
* Proof-of-concept or exploit code (if possible)
* Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

## Preferred Languages

We prefer all communications to be in English.

## Security Best Practices

### For Users

1. **Keep Dependencies Updated**
   ```bash
   npm update
   npm audit
   ```

2. **Never Commit Sensitive Data**
   - Use environment variables (`KLIRA_API_KEY`, provider keys).
   - Use a secure secret manager in production.
   - Never commit API keys or credentials.

3. **Follow Security Guidelines**
   - Use HTTPS for all API calls (the OTLP exporter enforces this by default).
   - Implement proper authentication on your own endpoints.
   - Follow the principle of least privilege.

4. **Enable PHI Anonymization in Healthcare Contexts**
   - Pass `anonymization: 'mask'` (or `'redact'` / `'hash'` / `'remove'`) to `Klira.init` for any application handling PHI.
   - Set `phiExportEntityDetails: false` to keep entity-type metadata off the wire when stricter requirements apply.

### For Developers

1. **Code Security**
   - Prefer typed APIs (`KliraInitOptions`, `ToolOptions`, etc.) over untyped option bags.
   - Validate all inputs at API boundaries.
   - Avoid `any` in security-sensitive paths.
   - Use secure defaults.

2. **Dependency Security**
   - Run `npm audit` regularly.
   - Keep dependencies updated.
   - Pin runtime deps in `package.json`; review additions in PR.

3. **Testing**
   - Include security tests for new attack surfaces.
   - Use static-analysis tools (`eslint`, `tsc --noEmit`).
   - Regular penetration testing on staging environments.

## Security Measures

### Authentication
- All Klira API endpoints require authentication.
- API keys must start with `klira_` and are validated at `Klira.init`.
- Rate limiting is implemented server-side.

### Data Protection
- All telemetry is encrypted in transit (TLS to `https://api.getklira.com`).
- PHI scrubbing happens **before** export when `anonymization` is configured.
- Logger redacts secrets (`apiKey` / `authorization` field names) before printing.

### Monitoring
- Security event logging.
- Intrusion detection on the platform side.
- Regular security assessments.

## Security Updates

1. **Assessment** — evaluate the vulnerability, determine impact and severity, plan the fix.
2. **Development** — create a security fix, test thoroughly, document changes.
3. **Release** — create a security advisory, release the fix, notify users.
4. **Post-Release** — monitor for issues, update documentation, review security measures.

## Security Contact

For security-related questions or concerns:
- Email: **hello@getklira.com**
- PGP Key: available upon request

## Acknowledgments

We would like to thank all security researchers who have responsibly disclosed vulnerabilities to us. Your contributions help keep the Klira AI SDK secure for everyone.
