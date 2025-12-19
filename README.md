# KITT LINE Bot

Personal AI assistant via LINE Messaging API, powered by local LLM (Ollama).

## Architecture

```
LINE App → kitt.irisgo.xyz → Cloudflare Tunnel → localhost:3001 → Ollama (qwen3-vl:4b)
                                                       ↓
                                              PKM Knowledge Base
```

## Features

- **Multi-language Support**: Auto-detects zh-TW, zh-CN, en, ja, ko
- **IrisGo Knowledge Base**: Real-time PKM-Vault integration with file watching
- **Hybrid Intent Detection**: Rule-based + LLM confirmation for knowledge updates
- **Platform-agnostic Core**: Shared logic with KITT Slack Bot via `core.js`

## Setup

### Prerequisites

- Node.js 18+
- Ollama with `qwen3-vl:4b` model
- LINE Developer account with Messaging API channel
- Cloudflare Tunnel (or ngrok for testing)

### Installation

```bash
cd /Users/lman/Dropbox/Dev/kitt-line
npm install
```

### Configuration

Create `.env` file:

```env
LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_access_token
OLLAMA_API=http://localhost:11434/api/generate
OLLAMA_MODEL=qwen3-vl:4b
PORT=3001
```

### Running

**Development:**
```bash
npm start
```

**Production (PM2):**
```bash
pm2 start bot.js --name kitt-line --cwd /Users/lman/Dropbox/Dev/kitt-line
pm2 save
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | LINE webhook (signature validated) |
| `/health` | GET | Health check |

## PM2 Management

```bash
pm2 status          # Check status
pm2 logs kitt-line  # View logs
pm2 restart kitt-line  # Restart
```

## Cloudflare Tunnel

Configured in `~/.cloudflared/config.yml`:

```yaml
ingress:
  - hostname: kitt.irisgo.xyz
    service: http://localhost:3001
```

## Project Structure

```
kitt-line/
├── bot.js          # LINE Bot adapter (webhook, message handling)
├── core.js         # Shared AI logic (LLM, intent detection, knowledge base)
├── package.json
└── .env            # Credentials (not in repo)
```

## Related Projects

- [kitt-slackbot](https://github.com/anthropic/kitt-slackbot) - KITT Slack Bot (same core.js)
