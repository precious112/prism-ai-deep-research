# Running Tests

## Backend API

The API uses **Jest** and **Supertest** for integration testing.

1.  Navigate to the API directory:
    ```bash
    cd api
    ```
2.  Run tests:
    ```bash
    npm test
    ```
    *Note: This command automatically sets up a test database, runs migrations, and cleans up afterwards.*

## AI Workers (Core)

The core service uses **pytest** for unit testing agents and tools.

1.  Navigate to the Core directory:
    ```bash
    cd core
    ```
2.  Install dependencies (if running locally without Docker):
    ```bash
    uv sync
    ```
3.  Run tests:
    ```bash
    pytest
    ```

## End-to-End Testing

We do not currently have an automated E2E test suite (e.g., Cypress/Playwright). Testing is done manually by running the full stack via Docker Compose and interacting with the client.
