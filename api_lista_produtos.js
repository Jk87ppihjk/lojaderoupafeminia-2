module.exports = (app, db) => {
    app.get('/api/produtos', (req, res) => {
        const category = req.query.categoria;
        // Seleciona o base_price e a primeira imagem disponível na tabela de variações
        let query = "SELECT p.id, p.name, p.base_price, p.category, p.description, p.tags, " +
                    " (SELECT image_url FROM product_variations WHERE product_id = p.id AND image_url IS NOT NULL ORDER BY id LIMIT 1) as main_image_url " +
                    "FROM products p";
        let params = [];

        if (category && category !== 'Todos') {
            query += " WHERE p.category = ?";
            params.push(category);
        }

        db.query(query, params, (err, result) => {
            if (err) {
                 console.error('SQL Error on GET /api/produtos:', err);
                 return res.status(500).json({ message: "Erro ao listar produtos. Verifique as colunas 'base_price' e a tabela 'product_variations'." });
            }
            
            const products = result.map(p => ({
                ...p,
                tags: p.tags ? JSON.parse(p.tags) : [],
                // Mapeia a imagem principal para o campo esperado pelo front
                image_urls: p.main_image_url ? [p.main_image_url] : []
            }));

            res.json(products);
        });
    });
};
