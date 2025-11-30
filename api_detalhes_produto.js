module.exports = (app, db) => {
    // ROTA PÚBLICA: Obter Detalhes do Produto (GET /api/produto/:id)
    app.get('/api/produto/:id', (req, res) => {
        const { id } = req.params;
        // Seleciona todos os campos, incluindo a string JSON de image_urls
        db.query("SELECT * FROM products WHERE id = ?", [id], (err, result) => {
            if (err) return res.status(500).send(err);
            if (result.length === 0) return res.status(404).json({ message: "Produto não encontrado" });
            
            const product = result[0];
            
            // CRÍTICO: Converte a string JSON de image_urls em array antes de enviar ao front.
            // Isso garante que o front-end, como o detalhes_do_produto.html, receba as URLs como um array.
            product.image_urls = product.image_urls ? JSON.parse(product.image_urls) : [];
            
            res.json(product);
        });
    });
};
