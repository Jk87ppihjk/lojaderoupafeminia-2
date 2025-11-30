const { MercadoPagoConfig, Preference } = require('mercadopago');

// Configuração do Mercado Pago com a credencial do .env
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

module.exports = (app, db) => {
    app.post('/api/checkout', async (req, res) => {
        const { user_id, total, items, buyer_email } = req.body; 
        
        // 1. Criar o Pedido no Banco de Dados (MySQL) como 'Pendente'
        // Salvamos primeiro para ter o ID do pedido
        const sql = "INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'Pendente')";
        
        db.query(sql, [user_id || null, total], async (err, result) => {
            if (err) {
                console.error("Erro ao salvar pedido:", err);
                return res.status(500).json({ message: "Erro ao criar pedido no banco." });
            }

            const orderId = result.insertId;

            try {
                // 2. Preparar os itens para o formato do Mercado Pago
                // O front deve enviar items com: title, quantity, unit_price
                const mpItems = items.map(item => ({
                    id: String(item.product_id),
                    title: item.name || "Produto Loja",
                    quantity: Number(item.quantity),
                    unit_price: Number(item.price)
                }));

                // 3. Criar a Preferência no Mercado Pago
                const preference = new Preference(client);
                
                const mpResponse = await preference.create({
                    body: {
                        items: mpItems,
                        payer: {
                            email: buyer_email || 'cliente@email.com'
                        },
                        external_reference: String(orderId), // Vincula o pagamento ao ID do pedido no seu banco
                        back_urls: {
                            success: `${process.env.FRONTEND_URL || 'https://aldeify.com.br'}/sucesso.html`,
                            failure: `${process.env.FRONTEND_URL || 'https://aldeify.com.br'}/falha.html`,
                            pending: `${process.env.FRONTEND_URL || 'https://aldeify.com.br'}/pendente.html`
                        },
                        auto_return: "approved",
                    }
                });

                // 4. Retorna o Link de Pagamento (init_point) para o Front-end
                res.json({ 
                    message: "Pedido criado e preferência gerada", 
                    orderId: orderId,
                    init_point: mpResponse.init_point // URL para redirecionar o cliente
                });

            } catch (error) {
                console.error("Erro no Mercado Pago:", error);
                res.status(500).json({ message: "Erro ao gerar pagamento no Mercado Pago." });
            }
        });
    });
};
