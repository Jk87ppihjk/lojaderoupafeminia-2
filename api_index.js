module.exports = (app, db) => {
    // Buscar produtos recentes para a home
    app.get('/api/home/novidades', (req, res) => {
        db.query("SELECT * FROM products ORDER BY id DESC LIMIT 4", (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });

    // Categorias (fixas ou do banco)
    app.get('/api/home/categorias', (req, res) => {
        // Exemplo estático, mas poderia vir do banco
        res.json(['Vestidos', 'Blusas', 'Calças', 'Acessórios']);
    });
};
