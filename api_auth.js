const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = (app, db) => {
    // Rota de Registro de Novo Cliente
    app.post('/api/register', async (req, res) => {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: "Todos os campos são obrigatórios." });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Note: O papel padrão é 'user'
            const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')";
            db.query(sql, [name, email, hashedPassword], (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ message: "Este e-mail já está em uso." });
                    }
                    return res.status(500).json({ message: "Erro ao registrar usuário." });
                }
                res.json({ message: "Registro concluído com sucesso." });
            });
        } catch (error) {
            res.status(500).json({ message: "Erro interno no servidor." });
        }
    });

    // Rota para Obter Detalhes do Pedido com Itens
    app.get('/api/usuario/pedidos/:orderId', (req, res) => {
        const { orderId } = req.params;
        const userId = req.user?.id; // Assumindo que o middleware JWT verifica o usuário

        // Rota simplificada que busca pedido e seus itens
        const sql = `
            SELECT 
                o.id AS orderId, o.total, o.status, o.created_at,
                i.product_name, i.quantity, i.unit_price, i.product_id
            FROM orders o
            JOIN order_items i ON o.id = i.order_id
            WHERE o.id = ? 
        `; // Em um sistema real, adicione: AND o.user_id = ?

        db.query(sql, [orderId], (err, result) => {
            if (err) return res.status(500).send(err);
            if (result.length === 0) return res.status(404).json({ message: "Pedido não encontrado." });

            const order = {
                id: result[0].orderId,
                total: result[0].total,
                status: result[0].status,
                date: result[0].created_at,
                items: result.map(row => ({
                    name: row.product_name,
                    quantity: row.quantity,
                    price: row.unit_price
                }))
            };
            res.json(order);
        });
    });

    // Rota para Obter Histórico de Pedidos
    app.get('/api/usuario/:id/pedidos', (req, res) => {
        const { id } = req.params;
        // Busca pedidos do usuário
        db.query("SELECT id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC", [id], (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });
};
