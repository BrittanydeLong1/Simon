# Simon

Simon is a personal conversational AI web app with:

- Offline mode (local model, Ollama-compatible)
- Online mode (OpenAI-compatible API)
- Local conversation history
- Personality controls
- Editable memory/preferences

## Run

```bash
cd simon-app
npm install
npm run dev
```

Open `http://localhost:3000`.

## MVP notes

- Conversations keep the mode they were created in. Switching modes does not upload or relabel existing chats; start a new chat in the selected mode, or switch back to continue the original chat.
- Online mode sends the active online conversation, all saved memory/preferences, and personality settings to the selected provider only when you send a message. Offline conversation history is not included.
- Saved memory is shared between modes. A detail you manually save while offline will also be included in future online requests. View, edit, or delete it in Memory before sending online.
- Offline mode sends the same context to Ollama at `127.0.0.1:11434` on the computer running Simon's server. Run Simon locally on your Windows computer for local-only operation.
- API keys are kept in-memory for the active tab and are not persisted to storage.

## Verify

```bash
npm ci
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests run against the production build and use mocked replies; unit and DOM interface tests mock provider requests. No API key, paid request, or running local model is needed for these checks. Use Node.js 20.19 or newer.

This MVP runs in a browser with a local Next.js server; it is not yet a packaged Windows desktop application. Offline chat requires Ollama running locally and the selected model downloaded (default: `llama3.1`). Online chat requires a key and model supported by the selected provider. Memory is manually maintained and browser-local, with no automatic extraction or backup. Responses are displayed with simulated streaming after the provider finishes.
