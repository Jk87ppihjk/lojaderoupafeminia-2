module.exports = (app, db) => {
    app.get('/api/produto/:id', (req, res) => {
        const { id } = req.params;
        db.query("SELECT * FROM products WHERE id = ?", [id], (err, result) => {
            if (err) return res.status(500).send(err);
            if (result.length === 0) return res.status(404).json({ message: "Produto não encontrado" });
            res.json(result[0]);
        });
    });
};
