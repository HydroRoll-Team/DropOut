---
applyTo: "**"
---

# Commit Helper Instructions

When user requests commit help → Follow [commit.agent.md](.github/agents/commit.agent.md)

**Full Workflow**: Commit → Push → Pull Request generation (optional at each step)

## Critical Rules

1. **Language**: Commit message ALWAYS in **English** (unless user specifies otherwise)
2. **Explanation**: Use **user's request language** ONLY when commit language differs
   - Chinese user + English commit → Explain in Chinese
   - English user + Chinese commit → Explain in English
   - Same language → No extra explanation needed
3. **Confirmation**: ALWAYS ask before committing (unless "commit directly" requested)

## Quick Reference

**Format**: `<type>[scope]: <description>`

**Common types**: `feat` `fix` `docs` `refactor` `perf` `test` `chore`

**AI commits MUST include**: `Reviewed-by: [MODEL_NAME]`

**Spec**: [conventional-commit.md](.github/references/git/conventional-commit.md)

## Common Mistakes

| Wrong | Right |
|-------|-------|
| `feat: Added feature` | `feat: add feature` (imperative) |
| `Fix bug.` | `fix: resolve auth issue` (lowercase, no period) |
| `feat: add A, refactor B, update C` | Split into 3 commits |

## User Triggers

"create commit", "commit message", "conventional commit"

## Post-Commit Features

- **Push Options**: After commit, offers git push with multiple strategies
- **PR Generation**: After push, can auto-generate Pull Request from commit
- **PR Templates**: English (default) or Chinese, with auto-explanation if language differs
- **PR Location**: `.github/PULL_REQUEST_TEMPLATE/en-pull_request_template.md` or `cn-pull_request_template.md`
