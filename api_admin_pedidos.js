module.exports = (app, db) => {
    // Listar todos os pedidos
    app.get('/api/admin/pedidos', (req, res) => {
        const sql = `
            SELECT o.*, u.name as cliente_nome, u.email as cliente_email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id 
            ORDER BY o.created_at DESC
        `;
        db.query(sql, (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });

    // Rota para obter detalhes de um único pedido (Admin)
    app.get('/api/admin/pedidos/:orderId/detalhes', (req, res) => {
        const { orderId } = req.params;
        const sql = `
            SELECT 
                o.id AS orderId, o.total, o.status, o.created_at, o.user_id, o.external_reference,
                i.product_name, i.quantity, i.unit_price
            FROM orders o
            JOIN order_items i ON o.id = i.order_id
            WHERE o.id = ?
        `;
        
        db.query(sql, [orderId], (err, result) => {
            if (err) return res.status(500).send(err);
            if (result.length === 0) return res.status(404).json({ message: "Pedido não encontrado." });
            
            const orderDetails = {
                id: result[0].orderId,
                total: result[0].total,
                status: result[0].status,
                items: result.map(row => ({
                    name: row.product_name,
                    quantity: row.quantity,
                    price: row.unit_price
                }))
            };
            res.json(orderDetails);
        });
    });

    // Atualizar status
    app.put('/api/admin/pedidos/:id/status', (req, res) => {
        const { status } = req.body;
        db.query("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id], (err) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Status atualizado" });
        });
    });
};
