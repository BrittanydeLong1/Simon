# Simon

Simon is a personal conversational AI web app with:

- Offline mode (local model, Ollama-compatible)
- Online mode (OpenAI-compatible API)
- Local conversation history
- Personality controls
- Editable memory/preferences

## Run

```bash
cd /home/runner/work/Simon/Simon/simon-app
npm install
npm run dev
```

Open `http://localhost:3000`.

## MVP notes

- Offline chats stay local unless you switch to online mode manually.
- Online mode only sends the current active conversation and only when you send a message.
- API keys can be session-only (default) or persisted locally if you opt in.
