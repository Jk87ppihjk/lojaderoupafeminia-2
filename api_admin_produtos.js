const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Configuração do Cloudinary (usando as variáveis de ambiente do Render - SEGURO!)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// Configuração do Multer para armazenar arquivos temporariamente
const upload = multer({ dest: 'uploads/' });

// Middleware simples para verificar se o usuário é Admin
const checkAdmin = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: "Acesso negado. Requer privilégios de administrador." });
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Não autorizado: Token inválido ou ausente." });
    }
};

module.exports = (app, db) => {
    
    // ROTA 1: Upload de Imagens (POST /api/admin/produtos/upload)
    // Recebe até 10 arquivos e envia para o Cloudinary (SEGURO)
    app.post('/api/admin/produtos/upload', checkAdmin, upload.array('images', 10), async (req, res) => {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: "Nenhum arquivo de imagem foi enviado." });
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
            // Tenta limpar arquivos temporários mesmo em caso de erro
            req.files.forEach(file => {
                try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
            });
            res.status(500).json({ message: "Falha no upload da imagem ou configuração Cloudinary.", error: error.message });
        }
    });

    // ROTA 2: Criar Produto (POST /api/admin/produtos)
    // Esta rota cria o produto no formato que detalhes_do_produto.html espera.
    app.post('/api/admin/produtos', checkAdmin, (req, res) => {
        const { name, price, sku, stock, category, image_urls, description } = req.body;
        
        // Sanitiza valores para evitar que Null/Undefined quebrem a query
        const safeName = name || '';
        const safePrice = price || 0;
        const safeStock = stock || 0;
        const safeSku = sku || '';
        const safeCategory = category || '';
        const safeDescription = description || '';
        
        // CRÍTICO: Converte o array de URLs em string JSON para salvar no banco
        const imageUrlsJson = JSON.stringify(image_urls || []); 

        const sql = "INSERT INTO products (name, price, sku, stock, category, image_urls, description) VALUES (?, ?, ?, ?, ?, ?, ?)";
        db.query(sql, [safeName, safePrice, safeSku, safeStock, safeCategory, imageUrlsJson, safeDescription], (err, result) => {
            if (err) {
                console.error('SQL Error during product creation:', err);
                return res.status(500).json({ message: "Erro ao criar produto no banco de dados.", error: err.message });
            }
            res.json({ message: "Produto criado com sucesso", id: result.insertId });
        });
    });

    // ROTA 3: Listar Produtos (GET /api/admin/produtos)
    app.get('/api/admin/produtos', checkAdmin, (req, res) => {
        // Seleciona todos os campos necessários para a tabela administrativa
        db.query("SELECT id, name, price, sku, stock, category, image_urls FROM products ORDER BY id DESC", (err, result) => {
            if (err) return res.status(500).send(err);
            
            // Converte a string JSON de image_urls em array antes de enviar ao front
            const products = result.map(p => ({
                ...p,
                image_urls: p.image_urls ? JSON.parse(p.image_urls) : []
            }));
            res.json(products);
        });
    });
    
    // ROTA 4: Deletar Produto (DELETE /api/admin/produtos/:id)
    app.delete('/api/admin/produtos/:id', checkAdmin, (req, res) => {
        db.query("DELETE FROM products WHERE id = ?", [req.params.id], (err) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Produto deletado com sucesso" });
        });
    });
    
    // ROTA 5: Atualizar Produto (PUT /api/admin/produtos/:id)
    app.put('/api/admin/produtos/:id', checkAdmin, (req, res) => {
        const { id } = req.params;
        const { name, price, sku, stock, category, image_urls, description } = req.body;
        
        // Sanitiza valores
        const safeName = name || '';
        const safePrice = price || 0;
        const safeStock = stock || 0;
        const safeSku = sku || '';
        const safeCategory = category || '';
        const safeDescription = description || '';
        const imageUrlsJson = JSON.stringify(image_urls || []); 

        const sql = "UPDATE products SET name = ?, price = ?, sku = ?, stock = ?, category = ?, image_urls = ?, description = ? WHERE id = ?";
        db.query(sql, [safeName, safePrice, safeSku, safeStock, safeCategory, imageUrlsJson, safeDescription, id], (err, result) => {
            if (err) {
                console.error('SQL Error during product update:', err);
                return res.status(500).json({ message: "Erro ao atualizar produto no banco de dados.", error: err.message });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Produto não encontrado para atualização" });
            }
            res.json({ message: "Produto atualizado com sucesso" });
        });
    });
};
