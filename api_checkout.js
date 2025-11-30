const { MercadoPagoConfig, Preference } = require('mercadopago');

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

module.exports = (app, db) => {
    app.post('/api/checkout', async (req, res) => {
        const { user_id, total, items, buyer_email } = req.body; 
        
        // --- CORREÇÃO DE SEGURANÇA ---
        // Transforma 'undefined', 'null' ou vazio em NULL real para o banco
        let safeUserId = user_id;
        if (!safeUserId || safeUserId === 'undefined' || safeUserId === 'null') {
            safeUserId = null;
        }

        // 1. Criar o Pedido no Banco de Dados
        // Agora passamos 'safeUserId' que será um número ou null
        const sql = "INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'Pendente')";
        
        db.query(sql, [safeUserId, total], async (err, result) => {
            if (err) {
                console.error("Erro ao salvar pedido no banco:", err);
                return res.status(500).json({ 
                    message: "Erro ao criar pedido no banco de dados.", 
                    error: err.message 
                });
            }

            const orderId = result.insertId;

            try {
                // 2. Preparar itens para Mercado Pago
                const mpItems = items.map(item => ({
                    id: String(item.product_id),
                    title: item.name || "Produto",
                    quantity: Number(item.quantity),
                    unit_price: Number(item.price)
                }));

                // 3. Criar Preferência
                const preference = new Preference(client);
                
                const mpResponse = await preference.create({
                    body: {
                        items: mpItems,
                        payer: {
                            email: buyer_email || 'email_generico@loja.com'
                        },
                        external_reference: String(orderId),
                        back_urls: {
                            success: `${process.env.FRONTEND_URL || 'https://loja-demo.com'}/sucesso.html`,
                            failure: `${process.env.FRONTEND_URL || 'https://loja-demo.com'}/falha.html`,
                            pending: `${process.env.FRONTEND_URL || 'https://loja-demo.com'}/pendente.html`
                        },
                        auto_return: "approved",
                    }
                });

                res.json({ 
                    message: "Pedido criado", 
                    orderId: orderId,
                    init_point: mpResponse.init_point 
                });

            } catch (error) {
                console.error("Erro na integração com Mercado Pago:", error);
                res.status(500).json({ message: "Erro ao gerar link de pagamento." });
            }
        });
    });
};
