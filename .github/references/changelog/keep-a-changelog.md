# Keep a Changelog Specification

Based on Keep a Changelog v1.1.0

## Purpose

A changelog is a file which contains a curated, chronologically ordered list of notable changes for each version of a project.

**Key Principle**: Changelogs are for humans, not machines. Commit messages are detailed implementation records; changelogs are high-level summaries for users and stakeholders.

## File Format

Filename: `CHANGELOG.md` (at repository root)

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Now removed features

### Fixed
- Bug fixes

### Security
- Vulnerability fixes

## [1.0.0] - 2024-01-15

### Added
- Initial release features

[unreleased]: https://github.com/user/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/user/repo/releases/tag/v1.0.0
```

## Change Types

| Type | Description | Example |
|------|-------------|---------|
| **Added** | New features | "Add dark mode support" |
| **Changed** | Changes in existing functionality | "Improve performance of search algorithm" |
| **Deprecated** | Features that will be removed | "Deprecate legacy API v1" |
| **Removed** | Removed features | "Remove support for Python 2.7" |
| **Fixed** | Bug fixes | "Fix crash when opening large files" |
| **Security** | Vulnerability fixes | "Fix XSS vulnerability in user input" |

## Guiding Principles

### 1. For Humans, Not Machines

- Write clear, concise descriptions
- Focus on WHAT changed and WHY it matters to users
- Avoid technical implementation details

### 2. Entry Per Version

- Every version should have its own section
- Versions listed in reverse chronological order (newest first)
- Each version has a release date in `YYYY-MM-DD` format

### 3. Group Changes

- Same types of changes grouped together
- Empty sections should be omitted

### 4. Linkable

- Version headers should link to version comparison or release page
- Use reference-style links at the bottom of the file

### 5. Unreleased Section

- Always maintain an `[Unreleased]` section at the top
- Changes accumulate here until the next release

## Writing Guidelines

### Good Entries

```markdown
### Added
- User authentication via OAuth 2.0
- Export functionality for CSV and JSON formats
- Dark mode theme option

### Fixed
- Memory leak when processing large datasets
- Incorrect date formatting in non-English locales
```

### Bad Entries (Too Technical)

```markdown
### Changed
- Refactored UserService.authenticate() to use async/await
- Updated webpack config to use splitChunks
```

### Comparison: Commit vs Changelog

| Aspect | Commit Message | Changelog Entry |
|--------|----------------|-----------------|
| Audience | Developers | Users & Stakeholders |
| Detail | Implementation-level | Feature-level |
| Scope | Single change | Notable changes only |
| Format | Technical, imperative | Human-readable, descriptive |

**Commit**: `fix(auth): resolve race condition in token refresh by implementing mutex lock`

**Changelog**: `Fixed intermittent login failures during session refresh`

## Version Linking

### GitHub/GitLab Style

```markdown
## [1.2.0] - 2024-03-15

### Added
- New feature description

[unreleased]: https://github.com/user/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/user/repo/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/user/repo/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/user/repo/releases/tag/v1.0.0
```

## Semantic Versioning Integration

When following SemVer:

- **MAJOR** (X.0.0): Breaking changes → Highlight in `Changed` or `Removed`
- **MINOR** (0.X.0): New features → Document in `Added`
- **PATCH** (0.0.X): Bug fixes → Document in `Fixed`

### Breaking Changes

Mark breaking changes prominently:

```markdown
## [2.0.0] - 2024-06-01

### Changed
- **BREAKING**: Configuration file format changed from YAML to TOML
- **BREAKING**: Minimum supported Python version is now 3.10

### Removed
- **BREAKING**: Removed deprecated `legacyMode` option
```

## Anti-Patterns

### Don't Do

1. **Commit log dumps**: Changelog ≠ `git log --oneline`
2. **Ignoring deprecations**: Always warn users before removing features
3. **Inconsistent dates**: Use ISO 8601 format (`YYYY-MM-DD`)
4. **Missing links**: Make versions clickable
5. **Technical jargon**: Write for users, not implementers

## Quick Reference

```markdown
# Changelog

## [Unreleased]

## [版本号] - YYYY-MM-DD

### Added
- 新增的功能描述

### Changed
- 功能变更描述

### Deprecated
- 即将废弃的功能

### Removed
- 已移除的功能

### Fixed
- 修复的 bug 描述 (#issue)

### Security
- 安全相关的修复

[unreleased]: https://github.com/user/repo/compare/vX.Y.Z...HEAD
[X.Y.Z]: https://github.com/user/repo/releases/tag/vX.Y.Z
```

## References

- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
