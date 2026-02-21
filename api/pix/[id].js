// api/pix/[id].js — CommonJS (Vercel default runtime)
// Proxy GET: consulta status de transação PIX na BRPix Digital

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: { message: 'Método não permitido.' } });
    }

    const { id } = req.query;
    const apiKey = process.env.BRPIX_API_KEY;

    if (!apiKey) {
        console.error('[api/pix/[id]] Variável BRPIX_API_KEY não configurada.');
        return res.status(500).json({ error: { message: 'Configuração de API ausente no servidor.' } });
    }

    if (!id) {
        return res.status(400).json({ error: { message: 'ID da transação ausente.' } });
    }

    try {
        const upstream = await fetch(`https://api.brpixdigital.com/functions/v1/transactions/${id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await upstream.json();

        console.log(`[api/pix/${id}] Status BRPix: ${data.status}`);

        return res.status(upstream.status).json(data);

    } catch (err) {
        console.error(`[api/pix/${id}] Erro ao verificar status:`, err.message);
        return res.status(502).json({
            error: {
                code: 'PROXY_ERROR',
                message: 'Erro ao verificar status do pagamento.',
            },
        });
    }
};
