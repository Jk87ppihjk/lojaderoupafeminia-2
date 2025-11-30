module.exports = (app, db) => {
    // Listar todos (Admin)
    app.get('/api/admin/produtos', (req, res) => {
        db.query("SELECT * FROM products", (err, result) => res.json(result));
    });

    // Criar Produto
    app.post('/api/admin/produtos', (req, res) => {
        const { name, price, sku, stock, category, image_url } = req.body;
        const sql = "INSERT INTO products (name, price, sku, stock, category, image_url) VALUES (?, ?, ?, ?, ?, ?)";
        db.query(sql, [name, price, sku, stock, category, image_url], (err, result) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Produto criado", id: result.insertId });
        });
    });

    // Deletar Produto
    app.delete('/api/admin/produtos/:id', (req, res) => {
        db.query("DELETE FROM products WHERE id = ?", [req.params.id], (err) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Produto deletado" });
        });
    });
};
