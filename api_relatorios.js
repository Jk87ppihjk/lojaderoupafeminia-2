module.exports = (app, db) => {
    app.get('/api/admin/relatorios/vendas', (req, res) => {
        // Exemplo: Vendas por mês
        const sql = `
            SELECT DATE_FORMAT(created_at, '%Y-%m') as mes, SUM(total) as total 
            FROM orders 
            WHERE status != 'Cancelado' 
            GROUP BY mes
        `;
        db.query(sql, (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });
};
