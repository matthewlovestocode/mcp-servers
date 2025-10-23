# Changelog

All notable changes to `@servers/slack-mcp` will be documented in this file.

## [Unreleased]
### Added
- Rich Block Kit layout support for `post-message`, including headlines, highlights, fields, CTA buttons, and optional footer context.
- Optional per-message `username` and `iconEmoji` overrides for Slack posts.
### Changed
- `post-pr` now threads the Slack sender overrides so pull request announcements align with other messages.
- Slack webhook client trims override values before sending payloads.
### Removed
- Unused `toolError` helper that was superseded by richer success handling.

## [0.1.0] - 2025-10-23
### Added
- Initial release of the Slack MCP server with webhook messaging tooling.
