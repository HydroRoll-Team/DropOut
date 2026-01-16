# What is Conventional Commits?

> A standard for writing commit messages.

## Specification

The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for creating an explicit commit history; which makes it easier to write automated tools on top of. This convention dovetails with [SemVer](https://semver.org/), by describing the features, fixes, and breaking changes made in commit messages.

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Examples

> Commit message with scope

```text
feat(SHOPPER-000): introduce OrderMonitor v2
```

> Commit message with breaking change

```text
refactor!: drop support for Node 6
```

> Commit message with footer and breaking change

```text
feat: enhance error handling

BREAKING CHANGE: Modified every error message and added the error key
```

> Commit message with multi-paragraph body and multiple footers

```text
fix(SHOPPER-000): correct minor typos in code

see the issue for details

on typos fixed.

Reviewed-by: Z
Refs #133
```

> Here reviewer should be replaced with the actual name of the reviewer or the **model name card** like "GPT-4o mini" by default.

## Rules

The key words **“MUST”, “MUST NOT”, “REQUIRED”, “SHALL”, “SHALL NOT”, “SHOULD”, “SHOULD NOT”, “RECOMMENDED”, “MAY”, and “OPTIONAL”** in this document are to be interpreted as described in RFC 2119.

- Commits MUST be prefixed with a type, which consists of a noun, feat, fix, etc., followed by the OPTIONAL scope, OPTIONAL !, and REQUIRED terminal colon and space.
- The type feat MUST be used when a commit adds a new feature to your application or library.
- The type fix MUST be used when a commit represents a bug fix for your application.
- A scope MAY be provided after a type. A scope MUST consist of a noun describing a section of the codebase surrounded by parenthesis, e.g., fix(parser):
- A description MUST immediately follow the colon and space after the type/scope prefix. The description is a short summary of the code changes, e.g., fix: array parsing issue when multiple spaces were contained in string.
- A longer commit body MAY be provided after the short description, providing additional contextual information about the code changes. The body MUST begin one blank line after the description.
- A commit body is free-form and MAY consist of any number of newline separated paragraphs.
- One or more footers MAY be provided one blank line after the body. Each footer MUST consist of a word token, followed by either a :<space> or <space># separator, followed by a string value (this is inspired by the git trailer convention).
- A footer’s token MUST use - in place of whitespace characters, e.g., Acked-by (this helps differentiate the footer section from a multi-paragraph body). An exception is made for BREAKING CHANGE, which MAY also be used as a token.
- A footer’s value MAY contain spaces and newlines, and parsing MUST terminate when the next valid footer token/separator pair is observed.
- Breaking changes MUST be indicated in the type/scope prefix of a commit, or as an entry in the footer.
- If included as a footer, a breaking change MUST consist of the uppercase text BREAKING CHANGE, followed by a colon, space, and description, e.g., BREAKING CHANGE: environment variables now take precedence over config files.
If included in the type/scope prefix, breaking changes MUST be indicated by a ! immediately before the :. If ! is used, BREAKING CHANGE: MAY be omitted from the footer section, and the commit description SHALL be used to describe the breaking change.
- Types other than feat and fix MAY be used in your commit messages, e.g., docs: updated ref docs.
- The units of information that make up Conventional Commits MUST NOT be treated as case sensitive by implementors, with the exception of BREAKING CHANGE which MUST be uppercase.
- BREAKING-CHANGE MUST be synonymous with BREAKING CHANGE, when used as a token in a footer.

## Why Should We Use It?

- Automatic changelog generation
- The context information that refers to business initiative when it's needed
- Noticeable breaking changes
- Forces us to write better commit messages (no more vague 'fix', 'refactor' commits)
- Bumping version precisely
- Making it easier to contribute to the projects by allowing contributors to explore a more structured commit history

## Changelog Generation

### Why Changelog?

A changelog is a file that contains a curated, chronologically ordered list of notable changes for each version of a project to make it easier for users and contributors.

For more information, see the [Keep a Changelog](https://keepachangelog.com/) standard.

### Why Generate Changelogs via Conventional Commits?

It's hard to maintain changelogs by hand and most of the time it fails. Manual changelog updates lead to:

- Discrepancy between docs and actual versions
- Missing breaking changes
- Outdated changelogs

You can automate the process of generating changelogs via GitHub Actions or locally via git hooks, which speeds up the process significantly.

## Bump the Version Precisely

### Benefits of Bumping Version Through Conventional Commits

- We shouldn't depend on one owner who knows every change between releases
- Every contributor should decide the impact of their changes during the development process
- You can auto-bump the version once it's merged to a specific branch (no more forgotten version updates)
- See [Conventional Commits Version Bump](https://github.com/marketplace/actions/conventional-commits-version-bump) GitHub Action
- Speeds up the process
- Prevents human mistakes

**Major Version Bump**

```text
refactor!: drop support for Node 6
```

**Minor Version Bump**

```text
feat(SHOPPER-000): introduce OrderMonitor v2
```

**Patch Version Bump**

```text
fix(SHOPPER-000): correct minor typos in code
```
