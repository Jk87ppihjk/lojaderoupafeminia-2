module.exports = (app, db) => {
    app.get('/api/admin/clientes', (req, res) => {
        db.query("SELECT id, name, email, created_at FROM users WHERE role = 'user'", (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });
};
