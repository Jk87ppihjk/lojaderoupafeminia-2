module.exports = (app, db) => {
    // Valida se os produtos no localStorage do front ainda existem e retorna preço atual
    app.post('/api/carrinho/validar', (req, res) => {
        const { ids } = req.body; // Array de IDs
        if (!ids || ids.length === 0) return res.json([]);
        
        // Converte array [1, 2] para string "1, 2" para o SQL IN
        const placeholders = ids.map(() => '?').join(',');
        const query = `SELECT id, name, price, image_url FROM products WHERE id IN (${placeholders})`;
        
        db.query(query, ids, (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });
};
