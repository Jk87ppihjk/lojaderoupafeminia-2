const { MercadoPagoConfig, Payment } = require('mercadopago');
const SibApiV3Sdk = require('@sendinblue/client');

// Configuração do Mercado Pago
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Configuração do Brevo (Sendinblue)
// Instancia diretamente a API de e-mails transacionais
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Configura a API Key usando o método setApiKey
// 'apiKey' é o identificador padrão para a chave de API nesta biblioteca
apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

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
    // Cria o objeto de e-mail
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = `[Pedido #${orderId}] Recebemos seu pagamento!`;
    sendSmtpEmail.htmlContent = `<html><body>
            <h1>Obrigado por sua compra!</h1>
            <p>Seu pedido #${orderId} foi confirmado e está sendo processado.</p>
            <p>Em breve você receberá mais informações sobre o envio.</p>
        </body></html>`;
    sendSmtpEmail.sender = { "name": "Moda Bella", "email": process.env.BREVO_SENDER_EMAIL || "no-reply@loja.com" };
    sendSmtpEmail.to = [{ "email": email }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`E-mail de confirmação enviado para ${email}`);
    } catch (error) {
        console.error("Erro ao enviar e-mail (Brevo):", error);
    }
};

module.exports = (app, db) => {
    // Rota de Webhook do Mercado Pago
    app.post('/api/pagamento/webhook', async (req, res) => {
        const { type, data } = req.body;
        
        // O MP envia vários tipos de notificação, focamos apenas em 'payment'
        if (type !== 'payment') {
            return res.status(200).send('OK');
        }

        try {
            const paymentId = data.id;
            const payment = new Payment(mpClient);
            const paymentDetails = await payment.get({ id: paymentId });
            
            const externalReference = paymentDetails.external_reference; // ID do pedido no nosso banco
            const status = paymentDetails.status;
            const buyerEmail = paymentDetails.payer.email;
            
            let newStatus = 'Pendente'; 
            
            if (status === 'approved') {
                newStatus = 'Processando';
            } else if (status === 'in_process') {
                newStatus = 'Pendente';
            } else if (status === 'cancelled' || status === 'rejected' || status === 'refunded') {
                newStatus = 'Cancelado'; 
            }
            
            // 1. Atualizar o status do pedido no banco de dados
            const promiseDb = db.promise();
            // Verifica se o pedido existe antes de tentar atualizar
            const [orderCheck] = await promiseDb.query("SELECT id, status FROM orders WHERE id = ?", [externalReference]);
            
            if (orderCheck.length > 0) {
                const currentStatus = orderCheck[0].status;
                
                // Evita processar novamente se já estiver pago
                if (currentStatus !== 'Processando' && currentStatus !== 'Enviado' && currentStatus !== 'Entregue') {
                    await promiseDb.query("UPDATE orders SET status = ?, external_reference = ? WHERE id = ?", 
                        [newStatus, paymentId, externalReference]);

                    // 2. Lógica de estoque e comunicação (Apenas se aprovado agora)
                    if (status === 'approved') {
                        await updateStock(db, externalReference, false); // Baixa no estoque
                        await sendOrderConfirmationEmail(externalReference, buyerEmail); // Envia e-mail
                    }
                }
            }

            res.status(200).send('Webhook processado.');

        } catch (error) {
            console.error('Erro no Webhook:', error);
            // Retornar 200 mesmo com erro interno evita que o MP fique reenviando a notificação infinitamente
            res.status(200).send('Erro processado.'); 
        }
    });
};
