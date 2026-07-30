const { getStore } = require('@netlify/blobs');

const CEREBRAS_KEY = 'csk-v8rnfxfyyx9jky56crrfm26dmn4kfnj545f4y9d99j3ccyj3';
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const ADMIN_PW = 'mtm2024';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    const pw = event.queryStringParameters?.pw;
    if (pw !== ADMIN_PW) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) };
    }
    try {
      const store = getStore('mtm-logs');
      const raw = await store.get('logs');
      const logs = raw ? JSON.parse(raw) : [];
      return { statusCode: 200, headers, body: JSON.stringify(logs) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  try {
    const body = JSON.parse(event.body);
    console.log(`[MTM] Chat from ${body.playerName || '?'}: "${(body.messages?.filter(m => m.role === 'user').pop()?.content || '').slice(0, 80)}"`);

    const res = await fetch(CEREBRAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CEREBRAS_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || '';

    console.log(`[MTM] Reply to ${body.playerName || '?'}: "${reply.slice(0, 80)}"`);

    try {
      const store = getStore('mtm-logs');
      const raw = await store.get('logs');
      const logs = raw ? JSON.parse(raw) : [];
      const userMsgs = body.messages?.filter(m => m.role === 'user');
      logs.push({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        player: body.playerName || 'unknown',
        message: userMsgs?.[userMsgs.length - 1]?.content || '',
        response: reply,
        tokens: data.usage?.total_tokens || 0,
      });
      await store.set('logs', JSON.stringify(logs.slice(-1000)));
    } catch (logErr) {
      console.error('[MTM] Log store error:', logErr);
    }

    return { statusCode: res.status, headers, body: JSON.stringify(data) };
  } catch (e) {
    console.error('[MTM] Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
