---
paths:
  - '.github/workflows/**'
  - '.github/zizmor.yml'
  - '.github/dependabot.yml'
---

# GitHub workflows

CI is what stands between a pull request and a release. A workflow is code that runs with the
repository's credentials. The *Workflow security* job (actionlint and zizmor) checks most of what
follows; the rest is the convention every existing workflow keeps.

- **Pin every action to a commit** *(strict)*, with its version in a comment. A tag can be moved;
  a commit cannot. Dependabot bumps both together.
- **Least privilege** *(strict)*. A workflow's top-level `permissions` is `contents: read` or
  `{}`, and a job that needs more widens it for that job alone.
- **Never interpolate an expression into a script** *(strict)*. Pass `${{ … }}` through `env:`,
  and quote it in the shell.
- **`persist-credentials: false` on every checkout** *(strict)*, unless a step in the job pushes,
  and then say so in a comment.
- **Every job has `timeout-minutes`.**
- **A comment says why a step is there**, as the existing workflows do. Whoever reads a failure
  should know what the step protects.
- **A check that gates `develop` or `main` stays required.** A flaky one is fixed. It is never
  skipped on one platform, marked `continue-on-error`, or given a looser budget to make it pass.
