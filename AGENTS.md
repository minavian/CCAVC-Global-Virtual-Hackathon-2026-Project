# Project Rules

## English only

**Use English exclusively for all project work. This is the highest-priority rule.** Use English in team communication, agent prompts and responses, code identifiers and comments, UI text, documentation, issues, pull requests, commits, and demos.

## GitHub workflow

- Leave new issues unassigned. Claim an issue before starting and coordinate with the assignee before contributing to claimed work.
- Branch from `main` for each issue and sync regularly. Use `<type>/<issue-number>-<short-description>`, such as `fix/15-navigation`. Git worktrees are optional.
- Keep edits within the issue's scope and coordinate before changing files another teammate owns.
- Use the issue labels `feat`, `bug`, `ui`, and `blocker`. Prioritize blockers. Start commits with `feat:`, `fix:`, `ui:`, `ai:`, `docs:`, or `chore:`.

## Website changes

- Follow the repository's conventions and reuse existing components and styles. Coordinate new dependencies with the team before installing them.
- Check affected pages at mobile and desktop widths. Verify keyboard navigation, visible focus, and accessible form labels where applicable.
- Keep API behavior and shared types in sync when a change affects both client and server.

## Explain your work

- **After you write or change code, add or update its entry in [`EXPLAINED.md`](EXPLAINED.md) in the same pull request.** In the interviews, every team member must be able to explain any part of the project, including parts a teammate wrote.
- Do this every time, without being asked. Follow the template in `EXPLAINED.md` and write for a teammate who has not seen the code.

## Verification and review

- Run the available repository checks and test changed pages locally before opening a pull request. Exercise affected links, forms, and interactions. Use sample or mock data where needed.
- Review every change yourself. In the pull request, include `Closes #<issue-number>`, summarize what you verified, and call out any checks you could not run.
- Merge after team review and keep `main` usable. After merging, delete the issue branch and clean up any associated worktree.

## Secrets

- Keep `.env` and credentials out of Git and client-side code. Share team credentials through a secure shared store.
- List required environment variables in `.env.example` with secret values left blank.
