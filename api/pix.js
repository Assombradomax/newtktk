// api/pix.js
// Proxy serverless — criação de transação PIX via BRPix Digital
// Evita exposição da API_KEY no browser e resolve CORS

export default async function handler(req, res) {
    // Apenas POST é aceito neste endpoint
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Método não permitido.' } });
    }

    const apiKey = process.env.BRPIX_API_KEY;

    if (!apiKey) {
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

        // Repassa o status code original da BRPix Digital
        return res.status(upstream.status).json(data);

    } catch (err) {
        console.error('[api/pix] Erro ao chamar BRPix Digital:', err);
        return res.status(502).json({
            error: {
                code: 'PROXY_ERROR',
                message: 'Erro ao conectar com o gateway de pagamento. Tente novamente.',
            },
        });
    }
}
