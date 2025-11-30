module.exports = (app, db) => {
    app.get('/api/admin/pedidos', (req, res) => {
        const sql = `
            SELECT orders.*, users.name as cliente_nome 
            FROM orders 
            LEFT JOIN users ON orders.user_id = users.id 
            ORDER BY created_at DESC
        `;
        db.query(sql, (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });

    app.put('/api/admin/pedidos/:id/status', (req, res) => {
        const { status } = req.body;
        db.query("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id], (err) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Status atualizado" });
        });
    });
};
