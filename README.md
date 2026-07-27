# MTM Web — Modular Tool for Minecraft

A web-based AI assistant for your Minecraft server. Players enter their IGN and chat with MTM.

## Deploy to Railway (free, 5 min)

1. Push this folder to a **GitHub repo**
2. Go to [railway.app](https://railway.app) and click **New Project → Deploy from GitHub repo**
3. Add environment variables (optional):
   - `CEREBRAS_API_KEY` — your Cerebras API key (already baked in by default)
   - `MODEL` — model name (default: `zai-glm-4.7`)
4. Railway auto-detects Python and runs `gunicorn app:app`
5. Click the generated URL and share it with your server

## Run locally

```bash
cd mtm-web
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000

## What it does

- Players enter their IGN → chat with MTM
- AI knows about Minecraft, Origins, PowerTrims, and Minehut Paper servers
- Each player gets their own chat session
- Dark purple theme (The End inspired)

## Files

```
mtm-web/
├── app.py              # Flask server + Cerebras API
├── requirements.txt    # flask, openai, gunicorn
├── templates/
│   └── chat.html       # Chat UI with IGN entry
└── README.md
```
