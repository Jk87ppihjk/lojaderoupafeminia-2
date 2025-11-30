module.exports = (app, db) => {
    // Rota que valida os produtos no carrinho (POST /api/carrinho/validar)
    app.post('/api/carrinho/validar', (req, res) => {
        const { ids } = req.body; // Array de IDs
        
        // Verifica se há IDs para buscar
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.json([]);
        }
        
        // Converte array [1, 2] para string "1, 2" para o SQL IN
        const placeholders = ids.map(() => '?').join(',');
        
        // CORREÇÃO: Usar image_urls (plural)
        const query = `SELECT id, name, price, image_urls FROM products WHERE id IN (${placeholders})`;
        
        db.query(query, ids, (err, result) => {
            if (err) {
                console.error('Erro no SQL do carrinho:', err);
                return res.status(500).json({ message: "Erro ao consultar produtos no banco de dados." });
            }
            
            // Converte a string JSON de image_urls em array antes de enviar ao front
            const products = result.map(p => ({
                ...p,
                image_urls: p.image_urls ? JSON.parse(p.image_urls) : []
            }));

            res.json(products);
        });
    });
};
