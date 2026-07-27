import os
import json
from flask import Flask, request, jsonify, render_template
from openai import OpenAI

app = Flask(__name__)
app.secret_key = os.urandom(32)

CEREBRAS_API_KEY = os.environ.get("CEREBRAS_API_KEY", "csk-v8rnfxfyyx9jky56crrfm26dmn4kfnj545f4y9d99j3ccyj3")
CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1"
MODEL = os.environ.get("MODEL", "zai-glm-4.7")

client = OpenAI(api_key=CEREBRAS_API_KEY, base_url=CEREBRAS_BASE_URL)

SYSTEM_PROMPT = """You are MTM — Modular Tool for Minecraft, built by revalize.

You are a helpful AI assistant for a Minecraft server. The server runs on Minehut with Paper/Spigot, using the Origins plugin and PowerTrims.

PERSONALITY:
- Friendly, respectful, and concise
- Address the player by their name: "{player_name}"
- Be concise. Don't over-explain unless asked
- You know Minecraft inside out (mechanics, Origins, PowerTrims, redstone, building, farms, servers)
- If you don't know something, say so honestly
- Only talk about Minecraft if the player asks about it first

RULES:
- Keep responses short unless asked for detail
- Never give harmful advice about hacking, exploits, or griefing
- Be positive and encouraging"""

@app.route("/")
def index():
    return render_template("chat.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    player_name = data.get("player_name", "Player")
    messages = data.get("messages", [])

    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    system = SYSTEM_PROMPT.format(player_name=player_name)

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": system}] + messages,
            max_tokens=2048,
            temperature=0.7,
        )
        reply = response.choices[0].message.content
        return jsonify({"response": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/models", methods=["GET"])
def list_models():
    try:
        models = client.models.list()
        return jsonify({"models": [m.id for m in models]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
