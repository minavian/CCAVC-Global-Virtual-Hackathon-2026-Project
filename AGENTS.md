# CCAVC Project Rules

## English only

**Use English exclusively for all project work. This is the highest-priority rule.** It applies to team communication, agent prompts and responses, code identifiers and comments, UI text, documentation, issues, pull requests, commits, and demos.

## Hackathon schedule

- **Before Day 1.** Assign three MVP tracks. Name two UI/UX and bug-fix leads and one feature lead. The feature lead also owns the repository and maintains the team's reference `.env`.
- **First 24–36 hours.** Agree on the idea, architecture, and technology stack. Record the stack here and build a working end-to-end demo flow.
- **Day 2 through the afternoon of Day 6.** The feature lead builds features while the other two leads test, fix bugs, and polish the UI and UX.
- **Final 12 hours.** Freeze features. Stabilize and test the product, deploy it, record a backup demo video, and rehearse the demo.

## GitHub workflow

1. Test the product regularly and file bugs or feature ideas as unassigned GitHub issues. Assign an issue to yourself before starting and coordinate with its assignee before contributing to claimed work.
2. Create a separate Orca worktree and branch from `main` for each issue. Sync with `main` frequently. Keep the main demo flow working on `main` and make changes through issue branches.
3. Stay within the issue's scope and notify the team before editing files another teammate owns.
4. Test locally before committing, pushing, and opening a pull request. Add `Closes #<issue-number>` to the description. Teammates can test the branch and commit small fixes to it.
5. Use the nightly call to demo and test the latest build, file new issues, review pull requests, and set the next day's priorities and owners.
6. Merge only pull requests that pass team review. An urgent merge before the nightly call requires agreement from the whole team in group chat. After merging, delete the branch and clean up the worktree. Update or file an issue for work that still needs changes.

## Coding agents

- Read this guide before editing and follow the agreed architecture and coding conventions.
- Work within the files and scope assigned to the issue. Raise new dependency needs in group chat before installing packages.
- Pull request authors own their changes and must review AI-generated code and run the relevant tests.

## Environment and test data

- Keep `.env` and API keys out of Git. Keep shared keys in the pinned message in the private team chat. List required variables in `.env.example` with secret values left blank.
- Prepare seed or mock data early so teammates can test without entering data by hand.
- Keep API endpoints and JSON field names in sync through `docs/API_SPEC.md` or shared types in `types.ts`.

## Naming

- Use `<type>/<issue-number>-<short-description>` for branches and worktrees, such as `fix/15-login-bug`.
- Use `feat`, `bug`, `ui`, or `blocker` as GitHub issue labels. Prioritize blockers immediately.
- Prefix commits with `feat:`, `fix:`, `ui:`, `ai:`, `docs:`, or `chore:`.
