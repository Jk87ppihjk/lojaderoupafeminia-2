const safeJSONParse = (jsonString) => {
    if (!jsonString) return [];
    try {
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Erro ao parsear JSON:", e);
        return [];
    }
}

module.exports = (app, db) => {
    // ROTA PÚBLICA: Obter Detalhes do Produto (GET /api/produto/:id)
    app.get('/api/produto/:id', (req, res) => {
        const { id } = req.params;
        
        // CORREÇÃO: Certifica-se de que colors e tags estão incluídos na seleção
        db.query("SELECT id, name, description, price, sku, stock, category, image_urls, colors, tags FROM products WHERE id = ?", [id], (err, result) => {
            if (err) {
                // Se houver erro SQL, significa que a coluna colors ou tags não existe
                console.error('SQL Error on GET /api/produto/:id:', err);
                return res.status(500).json({ message: "Erro ao buscar detalhes do produto no DB. Verifique se as colunas 'colors' e 'tags' existem.", error: err.message });
            }
            if (result.length === 0) return res.status(404).json({ message: "Produto não encontrado" });
            
            const product = result[0];
            
            // DESERIALIZAÇÃO CORRIGIDA usando safeJSONParse para todos os campos JSON
            product.image_urls = safeJSONParse(product.image_urls);
            product.colors = safeJSONParse(product.colors);
            product.tags = safeJSONParse(product.tags);
            
            res.json(product);
        });
    });
};
