const { MercadoPagoConfig, Payment } = require('mercadopago');
const brevo = require('@sendinblue/client'); // Importa o módulo completo
const ApiClient = brevo.ApiClient; // Acessa a classe ApiClient do módulo
const TransactionalEmailsApi = brevo.TransactionalEmailsApi; // Acessa a classe de e-mail

// Configuração de Clientes
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const brevoClient = new ApiClient(); // Agora ApiClient está definido corretamente
brevoClient.authentications.apiKey.apiKey = process.env.BREVO_API_KEY;
const transactionalEmailsApi = new TransactionalEmailsApi(); // Usa a classe TransactionalEmailsApi

// Função para atualizar o estoque de forma segura
const updateStock = async (db, orderId, increase = false) => {
    const promiseDb = db.promise();
    const [items] = await promiseDb.query("SELECT product_id, quantity FROM order_items WHERE order_id = ?", [orderId]);

    const stockPromises = items.map(item => {
        const adjustment = increase ? item.quantity : -item.quantity;
        return promiseDb.query("UPDATE products SET stock = stock + ? WHERE id = ?", [adjustment, item.product_id]);
    });
    await Promise.all(stockPromises);
};

// Função para enviar e-mail de confirmação
const sendOrderConfirmationEmail = async (orderId, email) => {
    const sendSmtpEmail = {
        sender: { email: process.env.BREVO_SENDER_EMAIL || "contato@loja.com" },
        to: [{ email: email }],
        subject: `[Pedido #${orderId}] Recebemos seu pagamento!`,
        htmlContent: `<html><body>
            <h1>Obrigado por sua compra!</h1>
            <p>Seu pedido #${orderId} foi confirmado e está sendo processado. Você receberá um novo e-mail quando for enviado.</p>
            <p>Total Pago: (Consulte o BD)</p>
        </body></html>`
    };

    try {
        await transactionalEmailsApi.sendTransacEmail(sendSmtpEmail);
        console.log(`E-mail de confirmação enviado para ${email}`);
    } catch (error) {
        console.error("Erro ao enviar e-mail (Brevo):", error);
    }
};


module.exports = (app, db) => {
    // Rota de Webhook do Mercado Pago (Deve ser configurada no painel do MP)
    app.post('/api/pagamento/webhook', async (req, res) => {
        const { type, data } = req.body;
        
        if (type !== 'payment') {
            return res.status(200).send('Ignorando notificação não relacionada a pagamento.');
        }

        const paymentId = data.id;

        try {
            const payment = new Payment(mpClient);
            const paymentDetails = await payment.get({ id: paymentId });
            
            const externalReference = paymentDetails.external_reference; // É o order_id do nosso banco
            const status = paymentDetails.status;
            const buyerEmail = paymentDetails.payer.email;
            
            let newStatus = 'Pendente'; 
            
            if (status === 'approved') {
                newStatus = 'Processando';
            } else if (status === 'in_process') {
                newStatus = 'Pendente';
            } else if (status === 'cancelled' || status === 'rejected' || status === 'refunded') {
                newStatus = 'Cancelado'; // Ou Reembolsado
            }
            
            // 1. Atualizar o status do pedido no banco de dados
            const promiseDb = db.promise();
            await promiseDb.query("UPDATE orders SET status = ?, external_reference = ? WHERE id = ?", 
                [newStatus, paymentId, externalReference]);

            // 2. Lógica de estoque e comunicação
            if (status === 'approved') {
                // Diminuir o estoque (somente na primeira aprovação)
                await updateStock(db, externalReference, false);
                // Enviar e-mail
                await sendOrderConfirmationEmail(externalReference, buyerEmail);
            }
            // Lógica para aumentar estoque em caso de reembolso ou cancelamento (Implementação futura)

            res.status(200).send('Webhook processado com sucesso.');

        } catch (error) {
            console.error('Erro ao processar Webhook MP:', error);
            res.status(500).send('Erro interno do servidor.');
        }
    });
};
