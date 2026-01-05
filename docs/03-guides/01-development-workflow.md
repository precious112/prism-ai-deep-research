# Development Workflow

This guide covers how to contribute to the project and work with the codebase effectively.

## Prerequisites

Ensure you have the following installed:
*   **Docker Desktop**
*   **Node.js 20+**
*   **Python 3.11+**
*   **Go 1.22+**

## Branching Strategy

We follow a simplified Git flow:

*   **`main`**: The stable, production-ready branch. Do not commit directly to main.
*   **`dev`**: The active development branch. Features are merged here first.
*   **Feature Branches**: Create a new branch for each feature or fix.
    *   Format: `feature/my-new-feature` or `fix/bug-description`.

### Contribution Steps

1.  **Fork** the repository (if you don't have write access) or **Clone** it.
2.  **Checkout** a new branch: `git checkout -b feature/amazing-feature`.
3.  **Code**: Implement your changes.
4.  **Test**: Run tests locally (see [Running Tests](./02-running-tests.md)).
5.  **Commit**: Use descriptive commit messages.
    *   Example: `feat(client): add dark mode toggle`
6.  **Push**: `git push origin feature/amazing-feature`.
7.  **Pull Request**: Open a PR against the `main` branch.

## Local Development (Offline Mode)

To speed up development, we support an **Offline Mode**.

*   **Enabled by**: Setting `OFFLINE_MODE=true` in `api/docker.env` and `NEXT_PUBLIC_OFFLINE_MODE=true` in `client/.env`.
*   **Effect**:
    *   Bypasses complex OAuth/Email authentication.
    *   Allows login with just an email (no password check).
    *   Useful for UI/UX work or backend logic testing where auth isn't the focus.

## Project Structure (Monorepo)

*   **`api/`**: Express.js Backend.
*   **`client/`**: Next.js Frontend.
*   **`core/`**: Python AI Workers.
*   **`websocket/`**: Go WebSocket Server.
*   **`docs/`**: Documentation.

When working on a feature that spans multiple services (e.g., adding a new tool), you will likely need to touch `core` (logic), `api` (data persistence), and `client` (UI).
