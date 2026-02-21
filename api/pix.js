// api/pix.js — CommonJS (Vercel default runtime)
// Proxy POST: cria transação PIX na BRPix Digital
// A API_KEY fica no servidor (env var), nunca exposta ao browser — resolve CORS

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Método não permitido.' } });
    }

    const apiKey = process.env.BRPIX_API_KEY;

    if (!apiKey) {
        console.error('[api/pix] Variável BRPIX_API_KEY não configurada.');
        return res.status(500).json({ error: { message: 'Configuração de API ausente no servidor.' } });
    }

    try {
        const upstream = await fetch('https://api.brpixdigital.com/functions/v1/transactions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body),
        });

        const data = await upstream.json();

        console.log(`[api/pix] BRPix status: ${upstream.status}`);

        return res.status(upstream.status).json(data);

    } catch (err) {
        console.error('[api/pix] Erro ao chamar BRPix Digital:', err.message);
        return res.status(502).json({
            error: {
                code: 'PROXY_ERROR',
                message: 'Erro ao conectar com o gateway de pagamento. Tente novamente.',
            },
        });
    }
};
