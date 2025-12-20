# AI Worker & Multi-Agent Implementation Master Plan

This document serves as the **Source of Truth** for implementing the AI Worker system in Prism AI. It is designed to be fed into AI coding assistants (like Cline) to provide context, architecture constraints, and a specific task list.

## 1. System Overview

Prism AI uses an asynchronous, event-driven architecture to handle complex research tasks. The "AI Worker" is a standalone Python service that consumes tasks from Redis, executes a multi-agent workflow, and streams real-time updates to the client via WebSockets.

### High-Level Data Flow

1.  **Input**: User sends a message via **Client** -> **API**.
2.  **Persistence**: **API** saves the message and creates a `ResearchRequest` (Status: `PENDING`) in Postgres.
3.  **Dispatch**: **API** publishes the task (with Configuration) to Redis channel `research_tasks`.
4.  **Processing**: **Worker** (Python) picks up the task.
5.  **Feedback**: **Worker** publishes structured events (e.g., "Planning...", "Searching...") to Redis channel `updates`.
    *   **WebSocket Server** forwards these events to the **Client** for real-time UI.
6.  **Output**: **Worker** saves the final report by calling the **API** (`POST /chats/:id/messages/worker`).

## 2. Core Architecture (`core/`)

The Worker is built using **Python** and **LangGraph** (by LangChain). It implements a "Plan-and-Execute" pattern with recursive refinement.

### The Agent Graph

The workflow consists of a **Supervisor (Orchestrator)** and parallel **Researcher Sub-Graphs**.

1.  **Planning Agent**: Receives the user query and generates a **Table of Contents (ToC)**.
2.  **Researcher Manager**: Spins up a parallel execution branch for each section of the ToC.
3.  **Researcher Graph** (Runs for *each* section):
    *   **Nodes**: `Thinking` -> `Gap Detection` -> `Tool Execution` -> `Thinking`.
    *   **Logic**:
        *   **Thinking**: Reflects on current draft.
        *   **Gap Detection**: Decides if the section is complete (`is_complete`). If not, identifies *what* is missing.
        *   **Tool Selector**: Chooses between `WebSearch` (Tavily/Serper) or `Crawler`.
        *   **Loop**: Continues until `is_complete` is true or max steps reached.
    *   **Output**: A completed section draft (saved to `ResearchResult` table via API).
4.  **Conclusion Agent**: Aggregates all completed sections, deduplicates info, and writes the **Final Report**.

### Communication Protocol

*   **Input Channel**: `research_tasks` (Redis List/Channel)
    *   Payload: `{ "requestId": "...", "query": "...", "config": { "model": "...", "apiKey": "..." } }`
*   **Output Channel**: `updates` (Redis Channel)
    *   Payload: See "Event Schema" below.

## 3. Real-Time Event Schema

To enable a "Perplexity-style" UI, the Worker must emit structured events.

**Envelope:**
```json
{
  "target_user_id": "uuid",
  "type": "agent_update",
  "payload": {
    "agent": "Planner",
    "status": "action", // thinking, action, output
    "message": "Human readable text",
    "data": { ... } // Machine readable
  }
}
```

**Key Event Types:**

1.  `plan_created`: `{ "toc": ["1. Intro", "2. ..."] }`
2.  `research_started`: `{ "section_index": 1, "topic": "..." }`
3.  `tool_start`: `{ "tool": "google_search", "query": "..." }` (Shows "Searching..." pill)
4.  `source_found`: `{ "title": "...", "url": "..." }` (Adds source card)
5.  `gap_detected`: `{ "reason": "Missing data on X" }` (Shows "Refining..." state)

## 4. Implementation Task List

This list is sequential. **AI Instructions: Do ONE task at a time.**

> **CRITICAL INSTRUCTION**: After completing ANY task (or set of tasks), you MUST update `docs/PROGRESS_LOG.md` with the details of what was changed and verified. This is essential for the next AI session to pick up where you left off.

### Phase 1: Infrastructure & API Prep

- [ ] **Task 1: API Redis Integration**
    *   Install `ioredis` in `api/`.
    *   Create `api/src/utils/redis.ts` (RedisService).
    *   Ensure connection sharing/pooling.

- [ ] **Task 2: API Dispatch Logic**
    *   Modify `api/src/modules/chat/chat.service.ts` (`addMessage`).
    *   Logic: After creating `ResearchRequest`, publish payload to `research_tasks`.
    *   Include `model` and `apiKey` from request in the payload.

- [ ] **Task 3: Worker Scaffold**
    *   Initialize `core/` with `pyproject.toml` (Poetry) or `requirements.txt`.
    *   Deps: `langgraph`, `langchain-openai`, `redis`, `requests`, `python-dotenv`, `pydantic`.
    *   Create `core/src/config.py` (Env vars).

- [ ] **Task 4: Worker Redis Consumer (The Skeleton)**
    *   Create `core/src/worker.py`.
    *   Implement infinite loop to pop from `research_tasks`.
    *   Implement `RedisPublisher` class for sending events.
    *   **Goal**: Verify that sending a message in Client logs a "Task Received" in Python console.

### Phase 2: The Core Agents (Mocked Research)

- [ ] **Task 5: Planning Agent**
    *   Implement `PlanningAgent` using LangGraph/OpenAI.
    *   Input: Query. Output: ToC List.
    *   Emit `plan_created` event.

- [ ] **Task 6: Conclusion Agent & API Save**
    *   Implement `ConclusionAgent` (aggregates drafts).
    *   Implement `APIService` in Python to call `POST /worker/result` and `POST /messages/worker`.
    *   **Goal**: The full loop works with *Mock* drafts (no real research yet).

### Phase 3: The Researcher Graph (Real Intelligence)

- [ ] **Task 7: Serper Tool Implementation**
    *   Implement `SerperTool` (Google Search).
    *   Return structured results (Snippet, URL, Title).

- [ ] **Task 8: Thinking & Gap Agents**
    *   Implement the `Thinking` -> `Gap` -> `Tool` loop.
    *   Verify it self-corrects when information is missing.

- [ ] **Task 9: Parallel Orchestrator**
    *   Use `asyncio.gather` to run the Researcher Graph for all ToC sections simultaneously.

## 5. Development Guidelines

*   **API First**: Always rely on the API for state. Do not connect to Postgres directly from Python.
*   **Mock First**: When building agents, mock the LLM calls initially to verify the graph flow, then enable the LLM.
*   **Log Everything**: Use the `updates` channel for logs so the frontend developer can see what's happening.
