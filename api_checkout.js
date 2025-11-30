module.exports = (app, db) => {
    app.post('/api/checkout', (req, res) => {
        const { user_id, total, items } = req.body; 
        
        // 1. Criar Pedido
        db.query("INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'Pendente')", 
        [user_id || null, total], (err, result) => {
            if (err) return res.status(500).send(err);
            const orderId = result.insertId;
            
            // Aqui você salvaria os itens do pedido em uma tabela order_items (opcional)
            res.json({ message: "Pedido realizado com sucesso", orderId });
        });
    });
};
