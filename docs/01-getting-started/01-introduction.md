# Introduction

Welcome to Prism AI, an open-source AI research agent built for deep, automated web research.

## What is Prism AI?

Prism AI attempts to solve the problem of information overload. Instead of just giving you a list of links (like a traditional search engine) or a simple text summary (like a basic chatbot), Prism AI acts as a **Research Assistant**.

It plans a research strategy, executes multiple searches in parallel, reads the content of webpages, and synthesizes a comprehensive report.

## Key Features

*   **Deep Research**: Breaks down complex queries into a structured plan (Table of Contents) and researches each section individually.
*   **Real-Time Updates**: You don't have to wait for the final answer. Watch the agent think, search, and write in real-time via WebSocket streaming.
*   **Source Transparency**: Every claim in the final report is cited with a direct link to the source.
*   **Local & Private**: Can be run entirely on your local machine using Docker.

## The Competitive Edge: Visual Explanations

What sets Prism AI apart from tools like Perplexity or Open Research is its ability to **visually explain concepts**.

While other tools rely solely on text, Prism AI's agents are equipped with a custom **Illustration Tool**. If the agent determines that a concept (like a sorting algorithm, a system architecture, or a data trend) is better explained visually, it will:

1.  **Decide** the best visualization format (Mermaid diagram, D3 chart, P5 animation, etc.).
2.  **Generate** the code to render that visualization.
3.  **Embed** it directly into the report.

This turns a static text report into an interactive, multimedia learning experience.
