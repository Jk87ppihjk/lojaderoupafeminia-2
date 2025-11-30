const { MercadoPagoConfig, Preference } = require('mercadopago');

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

module.exports = (app, db) => {
    app.post('/api/checkout', async (req, res) => {
        const { user_id, total, items, buyer_email } = req.body; 
        
        let safeUserId = user_id;
        if (!safeUserId || safeUserId === 'undefined' || safeUserId === 'null') {
            safeUserId = null;
        }

        // 1. Criar o Pedido Principal (MySQL)
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

            // 2. Salvar os itens do pedido na tabela order_items
            const itemsSql = "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES ?";
            const itemsValues = items.map(item => [
                orderId, 
                item.product_id, 
                item.name, 
                item.price, 
                item.quantity
            ]);
            
            db.query(itemsSql, [itemsValues], (itemErr) => {
                 if (itemErr) {
                    console.error("Erro ao salvar itens do pedido:", itemErr);
                    // Continua mesmo com erro, mas idealmente reverte o pedido principal
                 }
            });


            try {
                // 3. Preparar e Criar Preferência (Mercado Pago)
                const mpItems = items.map(item => ({
                    id: String(item.product_id),
                    title: item.name || "Produto",
                    quantity: Number(item.quantity) || 1,
                    unit_price: Number(item.price) || 0.01
                }));

                const preference = new Preference(client);
                
                const mpResponse = await preference.create({
                    body: {
                        items: mpItems,
                        payer: {
                            email: buyer_email || 'email_generico@loja.com'
                        },
                        external_reference: String(orderId), // USA ID DO SEU BANCO!
                        notification_url: `${process.env.BACKEND_URL || 'https://lojaderopasfeminina.onrender.com'}/api/pagamento/webhook`,
                        back_urls: {
                            success: `${process.env.FRONTEND_URL || 'https://aldeify.com.br'}/sucesso.html`,
                            failure: `${process.env.FRONTEND_URL || 'https://aldeify.com.br'}/falha.html`,
                            pending: `${process.env.FRONTEND_URL || 'https://aldeify.com.br'}/pendente.html`
                        },
                        auto_return: "approved",
                    }
                });

                res.json({ 
                    message: "Pedido criado", 
                    orderId: orderId,
                    preferenceId: mpResponse.id
                });

            } catch (error) {
                console.error("Erro na integração com Mercado Pago:", error);
                res.status(500).json({ message: "Erro ao gerar link de pagamento." });
            }
        });
    });
};
