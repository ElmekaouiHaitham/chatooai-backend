# ChatooAI Backend

ChatooAI Backend is the Node.js service behind the ChatooAI multi WhatsApp chatbot platform. It exposes an Express API, verifies Firebase Auth tokens, stores bot/user/plan state in Firestore, manages WhatsApp Web sessions through Baileys, broadcasts QR codes over WebSockets, and calls OpenRouter for AI-generated replies.

The product vision is a scalable SaaS-style system for agencies, resellers, and businesses that want to run multiple AI WhatsApp bots from one dashboard. This backend is a functional foundation for that vision, but it is not yet a complete production SaaS backend.

## Repository Links

- Backend repository: [https://github.com/ElmekaouiHaitham/chatooai-backend](https://github.com/ElmekaouiHaitham/chatooai-backend)
- Frontend repository: [https://github.com/ElmekaouiHaitham/chatooai-frontend](https://github.com/ElmekaouiHaitham/chatooai-frontend)
- Local API demo: [http://localhost:5000](http://localhost:5000)
- Live website: add the deployed frontend URL here when available.

## Tech Stack

- Node.js
- Express.js
- Firebase Admin SDK
- Firestore
- Firebase Authentication token verification
- Baileys for WhatsApp Web sessions
- WebSocket (`ws`) for QR broadcasts
- OpenRouter chat completions
- `qrcode` for QR image generation

## What Is Implemented

- Express server with bot, user, and plan routes.
- Firebase Admin initialization through environment variables.
- Protected API routes using Firebase ID token verification.
- Bot creation:
  - validates required bot data,
  - checks plan/rate limits,
  - creates bot documents in Firestore,
  - starts a Baileys WhatsApp session for the bot.
- Firestore-backed bot state:
  - bot metadata,
  - WhatsApp status,
  - generated QR code data,
  - message count and last active timestamp.
- Startup reconnection flow that loads all bot documents from Firestore and initializes WhatsApp sessions.
- QR generation through Baileys and broadcast to connected frontend clients over WebSocket.
- Bot update endpoint for settings changes.
- Bot disconnect endpoint that logs out the WhatsApp session and clears local auth files for that bot.
- Plan creation, update, and deletion endpoints with admin checks.
- User status and current-plan update endpoints.
- Basic rate-limit checks for bot creation and message replies based on plan usage.
- AI reply generation through OpenRouter.

## Partially Implemented Or Needs Hardening

- Baileys auth credentials are still stored locally under `auth/`. Bot metadata and runtime status are in Firestore, but WhatsApp session credential storage is not cloud/distributed yet.
- Reconnecting every Firestore bot on startup is simple, but may need job queues, sharding, or worker separation for larger deployments.
- Plan and usage enforcement exists, but billing/subscription state is not connected to a payment provider.
- Admin checks depend on Firestore user data and request body/user token patterns that should be reviewed and made consistent.
- Error handling is functional but not standardized across all controllers.
- Logs are console-based. There is no structured logging, tracing, metrics, or alerting.
- WhatsApp connection lifecycle handling should be hardened for production disconnect/retry scenarios.
- AI prompt behavior is basic: bot name, personality, and description are used, but there is no conversation memory, retrieval, tooling, moderation, or guardrail layer.

## Not Implemented Yet

- Real payment provider integration.
- Cloud storage for Baileys auth sessions.
- Horizontal scaling for WhatsApp workers.
- Tenant/team/workspace model.
- Conversation storage and transcript APIs.
- Human handoff workflow.
- WhatsApp Business Cloud API support.
- Message template management.
- Queue-based message processing.
- Webhook/event architecture.
- Production monitoring and audit logs.
- Automated tests.
- Docker/deployment files.

## Relationship To The Product Description

The CodeCanyon-style description presents an ideal "multi WhatsApp chatbot" product with easy QR login, smart AI replies, multi-client management, and flexible deployment. This backend supports the core technical direction, but the current implementation differs from that description in important ways:

- It does use Node.js and Express.
- It does use QR-based WhatsApp connection through Baileys.
- It does support multiple bot documents and sessions.
- It does use OpenRouter for AI replies.
- It is not database-free anymore; Firestore is the application database.
- It does not yet provide full production scaling, payment automation, deployment packaging, or a complete support/customization workflow.

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- Firebase project with Firestore enabled
- Firebase service account credentials
- OpenRouter API key
- One WhatsApp account/device per connected bot session

### Installation

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Fill in `.env`, then start the backend:

```bash
npm start
```

The API defaults to [http://localhost:5000](http://localhost:5000). The WebSocket upgrade is handled on the same server.

## Environment Variables

All supported variables are listed in [.env.example](./.env.example).

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `5000`. |
| `NODE_ENV` | No | Runtime environment. |
| `CORS_ORIGINS` | Yes | Comma-separated allowed frontend origins. |
| `OPENROUTER_API_KEY` | Yes | API key used for AI replies. |
| `OPENROUTER_MODEL` | No | OpenRouter model ID. |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID. |
| `FIREBASE_PRIVATE_KEY_ID` | Yes | Firebase service account private key ID. |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase service account private key with escaped `\n` line breaks. |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase service account client email. |
| `FIREBASE_CLIENT_ID` | Yes | Firebase service account client ID. |
| `FIREBASE_AUTH_URI` | Yes | OAuth auth URI from the service account. |
| `FIREBASE_TOKEN_URI` | Yes | OAuth token URI from the service account. |
| `FIREBASE_AUTH_PROVIDER_X509_CERT_URL` | Yes | Google auth provider certificate URL. |
| `FIREBASE_CLIENT_X509_CERT_URL` | Yes | Service account certificate URL. |
| `FIREBASE_DATABASE_URL` | No | Firebase Realtime Database URL, if your project uses one. |

## Project Structure

```text
config/       Firebase Admin SDK initialization
controllers/  Express request handlers
middlewares/  Firebase Auth middleware
routes/       API route definitions
services/     Firestore, WhatsApp, rate-limit, and AI reply logic
utils/        Shared helpers
server.js     Express and WebSocket entry point
```

## Data Model Overview

- `bots`: bot configuration, owner UID, WhatsApp status, QR code data, stats, timestamps.
- `users`: frontend-created user profiles, plan references, status, monthly usage, admin flags.
- `plans`: plan names, limits, pricing metadata, status, user counts, revenue counters.

## Contributing

Contributions are welcome. High-impact backend work includes:

- Moving Baileys auth credentials to durable cloud storage.
- Adding tests for controllers, services, and rate-limit behavior.
- Standardizing admin authorization.
- Adding payment-provider webhooks and subscription state.
- Improving WhatsApp reconnect and failure handling.
- Adding queue-based workers for message processing.
- Adding structured logs, metrics, and deployment docs.

Please open an issue or pull request with a focused scope, clear reproduction/setup notes, and a short explanation of how the change was tested.
