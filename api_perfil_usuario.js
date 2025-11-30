module.exports = (app, db) => {
    app.get('/api/usuario/:id', (req, res) => {
        db.query("SELECT id, name, email, role FROM users WHERE id = ?", [req.params.id], (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result[0]);
        });
    });

    app.get('/api/usuario/:id/pedidos', (req, res) => {
        db.query("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", [req.params.id], (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });
};
