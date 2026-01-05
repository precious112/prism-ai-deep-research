# Deployment Guide (GKE + GitHub Actions)

This guide explains how to deploy the Prism AI application to Google Kubernetes Engine (GKE) using the configured GitHub Actions pipeline.

## Prerequisites

1.  **Google Cloud Project**: You need a GCP project with billing enabled.
2.  **GKE Cluster**: A Kubernetes cluster running in GCP.
3.  **Artifact Registry (or GCR)**: Enabled API for storing Docker images.
4.  **Domain Name**: A domain pointing to your Ingress IP (after first deployment).

## Setup Steps

### 1. Google Cloud Setup

1.  **Enable APIs**:
    ```bash
    gcloud services enable container.googleapis.com \
        artifactregistry.googleapis.com \
        iamcredentials.googleapis.com
    ```

2.  **Create Service Account**:
    Create a Service Account for GitHub Actions with the following roles:
    *   `Kubernetes Engine Developer`
    *   `Artifact Registry Writer` (or Storage Admin for GCR)
    *   `Service Account User`

3.  **Generate Key**:
    Download the JSON key for this service account (or configure Workload Identity Federation).

### 2. GitHub Secrets

Go to your repository **Settings > Secrets and variables > Actions** and add the following secrets:

#### Infrastructure Secrets
*   `GCP_PROJECT_ID`: Your Google Cloud Project ID.
*   `GCP_CREDENTIALS`: The content of the JSON service account key.
*   `GKE_CLUSTER`: The name of your GKE cluster.
*   `GKE_ZONE`: The zone (e.g., `us-central1-a`) of your cluster.

#### Application Configuration
*   `NEXT_PUBLIC_API_URL`: The public URL of your API (e.g., `https://api.yourdomain.com/api`).
*   `NEXT_PUBLIC_WS_URL`: The public URL of your Websocket (e.g., `wss://api.yourdomain.com/ws` or `wss://yourdomain.com/ws` depending on ingress).
*   `CLIENT_URL`: The public URL of your frontend (e.g., `https://yourdomain.com`).

#### Application Secrets (Database & Keys)
These values will be injected into `k8s/secrets.yaml` during deployment.

*   `DATABASE_URL`: Connection string for Postgres (internal: `postgresql://prism:prism@postgres:5432/prism_db?schema=public`).
*   `POSTGRES_USER`: `prism`
*   `POSTGRES_PASSWORD`: `prism`
*   `POSTGRES_DB`: `prism_db`
*   `ACCESS_TOKEN_SECRET`: Random string.
*   `REFRESH_TOKEN_SECRET`: Random string.
*   `RESEND_API_KEY`: Your Resend API key.
*   `WORKER_SECRET`: Shared secret between API and Worker.
*   `GOOGLE_CLIENT_ID`: OAuth Client ID.
*   `GOOGLE_CLIENT_SECRET`: OAuth Client Secret.
*   `GITHUB_CLIENT_ID`: GitHub OAuth Client ID.
*   `GITHUB_CLIENT_SECRET`: GitHub OAuth Secret.
*   `WORKER_API_KEY`: Same as `WORKER_SECRET`.
*   `OPENAI_API_KEY`: OpenAI API Key.
*   `SERPER_API_KEY`: Serper API Key.
*   `ANTHROPIC_API_KEY`: Anthropic API Key.
*   `GOOGLE_API_KEY`: Gemini API Key.
*   `XAI_API_KEY`: xAI API Key.

### 3. Deployment

Once the secrets are set, simply push to the `main` branch.

1.  **CI**: The `CI` workflow will run tests on the API and Worker.
2.  **CD**: If tests pass, the `Deploy to GKE` workflow will:
    *   Build Docker images.
    *   Push them to GCR.
    *   Substitute secrets into the Kubernetes manifests.
    *   Apply the configuration to your cluster.

### 4. Post-Deployment

1.  **Get Ingress IP**:
    ```bash
    kubectl get ingress prism-ingress
    ```
2.  **Configure DNS**: Point your domain to this IP.

## Local Development vs. Production

*   **Local**: Uses `docker-compose.yml`.
*   **Production**: Uses Kubernetes manifests in `k8s/`.
*   **Secrets**: Local uses `.env`, Production uses GitHub Secrets.
