# Installation & Setup

This guide will help you set up Prism AI locally using Docker Compose.

## Prerequisites

*   **Docker Desktop** (or Docker Engine + Docker Compose)
*   **Git**
*   **Node.js** (Optional, for local debugging without Docker)
*   **Python 3.11+** (Optional, for local debugging without Docker)
*   **Go 1.22+** (Optional, for local debugging without Docker)

## Quick Start (Docker)

The easiest way to run Prism AI is with Docker Compose. This will spin up the database, Redis, API, Worker, WebSocket server, and Client.

### 1. Clone the Repository

```bash
git clone https://github.com/precious112/prism_ai.git
cd prism_ai
```

### 2. Configure Environment Variables

The project uses multiple environment files for different services. You need to verify (and potentially modify) the following files:

*   **`core/docker.env`**: Configuration for the Python AI Worker.
    *   `OPENAI_API_KEY`: Required for LLM usage.
    *   `SERPER_API_KEY`: Optional, selects Google Search through Serper when configured.
    *   `SEARCH_PROVIDER`: Optional, defaults to `auto` (see [Search Configuration](#search-configuration)).
    *   `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`: Optional alternatives.
*   **`api/docker.env`**: Configuration for the Express API.
    *   `DATABASE_URL`, `REDIS_URL`: Pre-configured for Docker.
    *   `OFFLINE_MODE`: Set to `true` to disable complex auth for development.
*   **`client/.env`**: Configuration for the Next.js Client.
    *   `NEXT_PUBLIC_API_URL`: Should point to `http://localhost:3001/api`.
    *   `NEXT_PUBLIC_WS_URL`: Should point to `ws://localhost:8080/ws`.

**Important**: Add an LLM API key (OpenAI or a supported alternative) to `core/docker.env` before starting. A search API key is optional.

### Search Configuration

The Python worker supports [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp)
over Streamable HTTP at `https://search.parallel.ai/mcp`. It provides web search in
Fast mode and relevant excerpts from selected pages without an account or API key.

Set `SEARCH_PROVIDER` in `core/docker.env` (or the worker process environment):

| Value | Behavior |
| --- | --- |
| `auto` (default) | Use Serper if a user-supplied or environment `SERPER_API_KEY` is present; otherwise use Parallel. |
| `parallel` | Use Parallel for search and page excerpts, even when a Serper key is configured. |
| `serper` | Use Serper for Google Search and the existing direct webpage crawler. Requires a Serper key. |
| `disabled` | Disable both web search and page fetching. The model can still write from its existing knowledge. |

Keys saved in the client settings continue to reach the worker and take precedence
over the environment Serper key. Provider failures do not switch to another provider.
Parallel requests have a 30-second deadline and respect research cancellation.
Service errors, including free-tier rate limits, stop the research task and are
reported through the worker's existing error updates. Page fetching returns relevant
excerpts, capped at 10,000 characters, rather than the complete webpage.
Serper's image-search tool remains available explicitly; the existing illustration
generation behavior is unchanged.

### 3. Build and Start Services

Run the following command in the root directory:

```bash
docker-compose up --build
```

This may take a few minutes as it builds the Docker images for the client, api, worker, and websocket server.

### 4. Access the Application

Once everything is running, open your browser:

*   **Client**: [http://localhost:3000](http://localhost:3000)
*   **API**: [http://localhost:3001/api](http://localhost:3001/api)
*   **Prisma Studio** (Database GUI): You can run `npx prisma studio` in the `api/` folder if you have Node installed locally.

## Troubleshooting

### "Database connection failed"
If the API fails to connect to Postgres initially, it might be because the database container is still initializing. Docker Compose is configured with health checks, so it should retry automatically. If it persists, try restarting the API container:
```bash
docker-compose restart api
```

### "WebSocket connection failed"
Ensure port `8080` is not blocked by a firewall or another application. The client tries to connect to `ws://localhost:8080/ws`.

### "Search failed" or "LLM Error"
Check the logs of the `worker` container to see the Python error trace. Usually, this means an API key is missing or invalid in `core/docker.env`.
```bash
docker-compose logs -f worker
```
