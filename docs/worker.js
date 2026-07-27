// Cloudflare Worker — deploy at https://dash.cloudflare.com > Workers & Pages > Create Worker
// Paste this entire file, click Deploy. Copy the worker URL, put it below in index.html.

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method === 'POST') {
      const body = await request.json();

      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer csk-v8rnfxfyyx9jky56crrfm26dmn4kfnj545f4y9d99j3ccyj3',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response('MTM Worker — send POST with { model, messages }', { status: 200 });
  },
};
