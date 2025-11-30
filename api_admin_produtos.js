const cloudinary = require('cloudinary').v2; // Linha corrigida para importar a instância v2
const multer = require('multer');
const fs = require('fs'); 

// Configuração do Cloudinary (usando as variáveis de ambiente do Render - SEGURO!)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// Configuração do Multer para armazenar arquivos temporariamente
const upload = multer({ dest: 'uploads/' });

module.exports = (app, db) => {
    // ROTA NOVA e SEGURA: Recebe até 10 arquivos e envia para o Cloudinary
    app.post('/api/admin/produtos/upload', upload.array('images', 10), async (req, res) => {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: "Nenhum arquivo enviado." });
        }

        try {
            const uploadPromises = req.files.map(file => {
                return cloudinary.uploader.upload(file.path, {
                    folder: "loja_produtos",
                    resource_type: "auto"
                })
                .then(result => {
                    // Deleta o arquivo temporário no servidor após o upload
                    fs.unlinkSync(file.path); 
                    return result.secure_url;
                });
            });

            const imageUrls = await Promise.all(uploadPromises);
            
            res.json({ 
                message: "Uploads concluídos com sucesso", 
                imageUrls: imageUrls 
            });

        } catch (error) {
            console.error('Erro no upload para Cloudinary:', error);
            req.files.forEach(file => {
                try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
            });
            res.status(500).json({ message: "Falha no upload da imagem.", error: error.message });
        }
    });

    // ROTA EXISTENTE: CRUD de produtos (ATUALIZADA para usar image_urls)

    // Listar todos (Admin)
    app.get('/api/admin/produtos', (req, res) => {
        db.query("SELECT id, name, price, sku, stock, category, image_urls FROM products", (err, result) => {
            if (err) return res.status(500).send(err);
            // Converte a string JSON de image_urls em array antes de enviar ao front
            const products = result.map(p => ({
                ...p,
                image_urls: p.image_urls ? JSON.parse(p.image_urls) : []
            }));
            res.json(products);
        });
    });

    // Criar Produto (ATUALIZADA)
    app.post('/api/admin/produtos', (req, res) => {
        const { name, price, sku, stock, category, image_urls, description } = req.body;
        
        // Converte o array de URLs em string JSON para salvar no banco
        const imageUrlsJson = JSON.stringify(image_urls || []);

        const sql = "INSERT INTO products (name, price, sku, stock, category, image_urls, description) VALUES (?, ?, ?, ?, ?, ?, ?)";
        db.query(sql, [name, price, sku, stock, category, imageUrlsJson, description], (err, result) => {
            if (err) return res.status(500).json({ message: "Erro ao criar produto", error: err.message });
            res.json({ message: "Produto criado", id: result.insertId });
        });
    });

    // Obter Detalhes do Produto (ATUALIZADA)
    app.get('/api/produto/:id', (req, res) => {
        const { id } = req.params;
        db.query("SELECT id, name, description, price, sku, stock, category, image_urls FROM products WHERE id = ?", [id], (err, result) => {
            if (err) return res.status(500).send(err);
            if (result.length === 0) return res.status(404).json({ message: "Produto não encontrado" });
            
            const product = result[0];
            // Converte a string JSON de image_urls em array antes de enviar ao front
            product.image_urls = product.image_urls ? JSON.parse(product.image_urls) : [];
            
            res.json(product);
        });
    });

    // Deletar Produto (MANTIDA)
    app.delete('/api/admin/produtos/:id', (req, res) => {
        db.query("DELETE FROM products WHERE id = ?", [req.params.id], (err) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Produto deletado" });
        });
    });
};
