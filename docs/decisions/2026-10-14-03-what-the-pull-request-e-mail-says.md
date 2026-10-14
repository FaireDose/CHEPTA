# 2026-10-14: what the pull-request e-mail says

- **Asked:** the e-mail of every pull request (the engineering report comment) should say what the change is and what
  comes next, not open with the engineering report.
- **Done:** the comment of `engineering-report-comment.yml` now starts with the pull request's title and its "What this
  changes" and "Next steps" sections; the engineering report follows, folded (one click opens it). The pull request
  template has a "Next steps" section. Takes effect for the pull requests after this one is merged (the comment
  workflow runs from the default branch).
