# Linting Configuration for DangerPrep

This document describes the linting tools and configurations used in the DangerPrep project. All configurations are based on the enabled Codacy patterns and industry best practices.

## Overview

The project uses multiple linting tools to ensure code quality, security, and consistency:

- **Hadolint** - Docker file linting
- **markdownlint** - Markdown file linting  
- **PMD** - Multi-language static analysis
- **Semgrep** - Security-focused static analysis

## Tool Configurations

### 1. Hadolint (Docker Linting)

**Configuration File:** `.hadolint.yaml`

Hadolint analyzes Dockerfiles for best practices and common issues.

**Key Features:**
- Enforces Docker best practices (non-root users, version pinning, etc.)
- Validates shell commands within RUN instructions
- Checks for security vulnerabilities
- Ensures proper image layering and optimization

**Severity Levels:**
- **Error:** Critical security issues (root user, invalid ports, shell errors)
- **Warning:** Best practice violations (version pinning, package management)
- **Info:** Style and optimization suggestions

**Usage:**
```bash
# Install hadolint
brew install hadolint  # macOS
# or download from https://github.com/hadolint/hadolint/releases

# Run hadolint
hadolint docker/*/Dockerfile
hadolint docker/infrastructure/*/Dockerfile
```

### 2. markdownlint (Markdown Linting)

**Configuration File:** `.markdownlint.json`

Ensures consistent Markdown formatting across documentation.

**Key Rules:**
- Consistent heading styles (ATX format)
- Proper list formatting (dash style for unordered lists)
- Line length limits (120 characters)
- No trailing punctuation in headings
- Consistent emphasis styles (asterisk for bold/italic)

**Usage:**
```bash
# Install markdownlint-cli
npm install -g markdownlint-cli

# Run markdownlint
markdownlint "**/*.md"
markdownlint README.md docs/
```

### 3. PMD (Static Analysis)

**Configuration File:** `pmd-ruleset.xml`

Multi-language static analysis focusing on code quality and maintainability.

**Supported Languages:**
- Java
- JavaScript/ECMAScript
- Apex

**Rule Categories:**
- **Best Practices:** Unused variables, proper declarations
- **Code Style:** Naming conventions, formatting
- **Design/Complexity:** Cyclomatic complexity, method length
- **Error Prone:** Empty blocks, potential bugs
- **Security:** Hardcoded keys, crypto issues
- **Performance:** Object instantiation, string operations

**Usage:**
```bash
# Install PMD
# Download from https://pmd.github.io/

# Run PMD
pmd check -d src/ -R pmd-ruleset.xml -f text
pmd check -d packages/ -R pmd-ruleset.xml -f json
```

### 4. Semgrep (Security Analysis)

**Configuration Files:** `semgrep.yml`, `.semgrepignore`

Security-focused static analysis with custom rules for the project.

**Security Categories:**
- **XSS Prevention:** React/Angular unsafe HTML usage
- **AWS CDK Security:** Unencrypted resources, public access
- **Terraform Security:** S3 misconfigurations, hardcoded credentials
- **Apex Security:** SOQL injection, credential exposure
- **General Security:** Weak crypto, hardcoded secrets

**Usage:**
```bash
# Install semgrep
pip install semgrep

# Run semgrep with custom config
semgrep --config=semgrep.yml .

# Run with specific rulesets
semgrep --config=p/security-audit .
semgrep --config=p/typescript .
```

## Integration with Development Workflow

### Pre-commit Hooks

Add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/hadolint/hadolint
    rev: v2.12.0
    hooks:
      - id: hadolint-docker
        args: [--config, .hadolint.yaml]

  - repo: https://github.com/igorshubovych/markdownlint-cli
    rev: v0.37.0
    hooks:
      - id: markdownlint
        args: [--config, .markdownlint.json]

  - repo: https://github.com/semgrep/semgrep
    rev: v1.45.0
    hooks:
      - id: semgrep
        args: [--config=semgrep.yml]
```

### CI/CD Integration

Add to GitHub Actions workflow:

```yaml
- name: Run Hadolint
  run: hadolint docker/*/Dockerfile

- name: Run markdownlint
  run: markdownlint "**/*.md"

- name: Run PMD
  run: pmd check -d src/ -R pmd-ruleset.xml -f sarif

- name: Run Semgrep
  run: semgrep --config=semgrep.yml --sarif -o semgrep.sarif .
```

### IDE Integration

Most IDEs support these linters through extensions:

- **VS Code:** Hadolint, markdownlint, PMD, Semgrep extensions
- **IntelliJ:** PMD plugin, Markdown support
- **Vim/Neovim:** ALE or nvim-lint with tool configurations

## Customization

### Adding New Rules

1. **Hadolint:** Modify `.hadolint.yaml` to add/remove rules or change severity
2. **markdownlint:** Update `.markdownlint.json` with new rule configurations
3. **PMD:** Add rules to `pmd-ruleset.xml` or create custom rules
4. **Semgrep:** Add custom patterns to `semgrep.yml`

### Ignoring False Positives

1. **Hadolint:** Use `# hadolint ignore=DL3008` comments
2. **markdownlint:** Use `<!-- markdownlint-disable MD001 -->` comments
3. **PMD:** Use `@SuppressWarnings("PMD.RuleName")` annotations
4. **Semgrep:** Add patterns to `.semgrepignore` or use `# nosemgrep` comments

## Maintenance

- Review and update configurations quarterly
- Monitor for new security patterns and best practices
- Adjust severity levels based on project needs
- Keep tool versions updated for latest features and fixes

## Resources

- [Hadolint Documentation](https://github.com/hadolint/hadolint)
- [markdownlint Rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)
- [PMD Rules Reference](https://pmd.github.io/pmd/pmd_rules_java.html)
- [Semgrep Rule Writing](https://semgrep.dev/docs/writing-rules/overview/)
