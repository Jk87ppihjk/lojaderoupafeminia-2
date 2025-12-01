const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken'); // Adicionado o JWT

// Configuração do Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// Configuração do Multer
const upload = multer({ dest: 'uploads/' });

// FUNÇÃO: Lógica de parsing seguro para evitar erros de JSON
const safeJSONParse = (jsonString) => {
    if (!jsonString) return [];
    try {
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        // console.error("Erro ao parsear JSON:", e); // Comentei para evitar logs excessivos em produção
        return [];
    }
}

// FUNÇÃO: Serialização segura para o banco de dados
const safeJSONStringify = (data) => {
    try {
        return JSON.stringify(data || []);
    } catch (e) {
        return '[]';
    }
}

// FUNÇÃO: Calcula o menor preço para o preço base na listagem
const calculateBasePrice = (variations) => {
    if (!variations || variations.length === 0) return 0;
    // Filtra apenas preços válidos e maiores que zero
    const prices = variations.map(v => parseFloat(v.price)).filter(p => !isNaN(p) && p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
}

// Middleware para verificar se o usuário é Admin
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
    
    // ROTA 1: Upload de Imagens (PROTEGIDA)
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
                    fs.unlinkSync(file.path); 
                    return result.secure_url;
                });
            });

            const imageUrls = await Promise.all(uploadPromises);
            
            res.json({ message: "Uploads concluídos com sucesso", imageUrls: imageUrls });

        } catch (error) {
            console.error('Erro no upload para Cloudinary:', error);
            req.files.forEach(file => { try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ } });
            res.status(500).json({ message: "Falha no upload da imagem ou configuração Cloudinary.", error: error.message });
        }
    });

    // ROTA 2: Criar Produto (POST /api/admin/produtos) - COM VARIAÇÕES E TRANSAÇÃO
    app.post('/api/admin/produtos', checkAdmin, (req, res) => {
        const { name, description, sku, stock, category, tags, variations } = req.body;
        
        const base_price = calculateBasePrice(variations);
        
        // Dados do produto principal
        const productData = {
            name: name || '',
            description: description || '',
            sku: sku || '',
            base_price: base_price,
            stock: stock || 0,
            category: category || '',
            // Campos legados (manter como array vazio ou remover do SQL)
            image_urls: safeJSONStringify([]),
            colors: safeJSONStringify([]),
            tags: safeJSONStringify(tags)
        };
        
        if (!variations || variations.length === 0) {
            return res.status(400).json({ message: "É necessário fornecer pelo menos uma variação (tamanho/cor/preço)." });
        }

        db.getConnection((err, connection) => {
            if (err) return res.status(500).json({ message: "Erro ao obter conexão com o banco de dados." });

            connection.beginTransaction(err => {
                if (err) { connection.release(); return res.status(500).json({ message: "Erro ao iniciar transação." }); }

                // 1. INSERIR NA TABELA PRINCIPAL (products)
                const sqlProduct = 'INSERT INTO products SET ?';
                connection.query(sqlProduct, productData, (err, result) => {
                    if (err) {
                        return connection.rollback(() => {
                            connection.release();
                            res.status(500).json({ message: "Erro ao inserir produto principal.", error: err.message });
                        });
                    }

                    const productId = result.insertId;

                    // 2. INSERIR VARIAÇÕES NA TABELA product_variations
                    const variationsValues = variations.map(v => [
                        productId,
                        v.size,
                        v.color,
                        parseFloat(v.price),
                        v.image_url || null,
                        parseInt(v.stock) || 0
                    ]);

                    const sqlVariations = 'INSERT INTO product_variations (product_id, size, color, price, image_url, stock) VALUES ?';
                    connection.query(sqlVariations, [variationsValues], (err) => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                res.status(500).json({ message: "Erro ao inserir variações do produto.", error: err.message });
                            });
                        }

                        // 3. COMITAR A TRANSAÇÃO
                        connection.commit(err => {
                            if (err) {
                                return connection.rollback(() => {
                                    connection.release();
                                    res.status(500).json({ message: "Erro ao finalizar transação.", error: err.message });
                                });
                            }
                            connection.release();
                            res.status(201).json({ message: "Produto e variações criados com sucesso!", id: productId });
                        });
                    });
                });
            });
        });
    });

    // ROTA 3: Listar Produtos (GET /api/admin/produtos) - AGORA USA base_price
    app.get('/api/admin/produtos', checkAdmin, (req, res) => {
        // Seleciona base_price e tags
        db.query("SELECT id, name, base_price, sku, stock, category, tags FROM products ORDER BY id DESC", (err, result) => {
            if (err) {
                 console.error('SQL Error on GET /api/admin/produtos:', err);
                 return res.status(500).json({ message: "Erro ao listar produtos. Verifique se a coluna 'base_price' e 'tags' foram adicionadas ao banco de dados." }); 
            }
            
            // Apenas deserializa tags
            const products = result.map(p => ({
                ...p,
                tags: safeJSONParse(p.tags)
            }));
            res.json(products);
        });
    });
    
    // ROTA 4: Obter Detalhes do Produto (GET /api/admin/produtos/:id) - PARA EDIÇÃO
    app.get('/api/admin/produtos/:id', checkAdmin, (req, res) => {
        const { id } = req.params;

        db.query("SELECT id, name, description, sku, stock, category, tags, base_price FROM products WHERE id = ?", [id], (err, productResult) => {
            if (err) return res.status(500).json({ message: "Erro ao buscar produto principal.", error: err.message });
            if (productResult.length === 0) return res.status(404).json({ message: "Produto não encontrado." });

            const product = productResult[0];
            
            // Buscar variações
            db.query("SELECT id, size, color, price, image_url, stock FROM product_variations WHERE product_id = ?", [id], (err, variationsResult) => {
                if (err) return res.status(500).json({ message: "Erro ao buscar variações.", error: err.message });

                // Retornar o produto com as variações
                product.tags = safeJSONParse(product.tags);
                product.variations = variationsResult; // Adiciona a lista de variações
                
                res.json(product);
            });
        });
    });


    // ROTA 5: Deletar Produto (DELETE /api/admin/produtos/:id) - PROTEGIDA
    app.delete('/api/admin/produtos/:id', checkAdmin, (req, res) => {
        db.query("DELETE FROM products WHERE id = ?", [req.params.id], (err) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Produto deletado com sucesso" });
        });
    });

    // ROTA 6: Atualizar Produto (PUT /api/admin/produtos/:id) - COM VARIAÇÕES E TRANSAÇÃO
    app.put('/api/admin/produtos/:id', checkAdmin, (req, res) => {
        const { id } = req.params;
        const { name, description, sku, stock, category, tags, variations } = req.body;
        
        const base_price = calculateBasePrice(variations);

        const productData = {
            name: name || '',
            description: description || '',
            sku: sku || '',
            base_price: base_price,
            stock: stock || 0,
            category: category || '',
            image_urls: safeJSONStringify([]),
            colors: safeJSONStringify([]),
            tags: safeJSONStringify(tags)
        };
        
        if (!variations || variations.length === 0) {
            return res.status(400).json({ message: "É necessário fornecer pelo menos uma variação (tamanho/cor/preço)." });
        }

        db.getConnection((err, connection) => {
            if (err) return res.status(500).json({ message: "Erro ao obter conexão com o banco de dados." });

            connection.beginTransaction(err => {
                if (err) { connection.release(); return res.status(500).json({ message: "Erro ao iniciar transação." }); }

                // 1. ATUALIZAR NA TABELA PRINCIPAL (products)
                const sqlProduct = 'UPDATE products SET ? WHERE id = ?';
                connection.query(sqlProduct, [productData, id], (err, result) => {
                    if (err) {
                        return connection.rollback(() => {
                            connection.release();
                            res.status(500).json({ message: "Erro ao atualizar produto principal.", error: err.message });
                        });
                    }

                    // 2. DELETAR VARIAÇÕES ANTIGAS
                    const sqlDeleteVariations = 'DELETE FROM product_variations WHERE product_id = ?';
                    connection.query(sqlDeleteVariations, [id], (err) => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                res.status(500).json({ message: "Erro ao deletar variações antigas.", error: err.message });
                            });
                        }

                        // 3. INSERIR NOVAS VARIAÇÕES
                        const variationsValues = variations.map(v => [
                            id, 
                            v.size,
                            v.color,
                            parseFloat(v.price),
                            v.image_url || null,
                            parseInt(v.stock) || 0
                        ]);
                        
                        const sqlInsertVariations = 'INSERT INTO product_variations (product_id, size, color, price, image_url, stock) VALUES ?';
                        connection.query(sqlInsertVariations, [variationsValues], (err) => {
                            if (err) {
                                return connection.rollback(() => {
                                    connection.release();
                                    res.status(500).json({ message: "Erro ao inserir novas variações do produto.", error: err.message });
                                });
                            }

                            // 4. COMITAR A TRANSAÇÃO
                            connection.commit(err => {
                                if (err) {
                                    return connection.rollback(() => {
                                        connection.release();
                                        res.status(500).json({ message: "Erro ao finalizar transação.", error: err.message });
                                    });
                                }
                                connection.release();
                                res.json({ message: "Produto e variações atualizados com sucesso!" });
                            });
                        });
                    });
                });
            });
        });
    });

    // ROTA 7: Obter Detalhes do Produto (GET /api/produto/:id) - ROTA PÚBLICA (Para loja)
    // CORRIGIDA para retornar as variações de forma estruturada para o front-end da loja.
    app.get('/api/produto/:id', (req, res) => {
        const { id } = req.params;

        db.query("SELECT id, name, description, sku, category, tags, base_price FROM products WHERE id = ?", [id], (err, productResult) => {
            if (err) return res.status(500).json({ message: "Erro ao buscar produto principal.", error: err.message });
            if (productResult.length === 0) return res.status(404).json({ message: "Produto não encontrado." });

            const product = productResult[0];
            
            // Buscar variações
            db.query("SELECT id, size, color, price, image_url, stock FROM product_variations WHERE product_id = ?", [id], (err, variationsResult) => {
                if (err) return res.status(500).json({ message: "Erro ao buscar variações.", error: err.message });
                
                // Mapear Cores, Tamanhos e Imagens Únicas para o front-end (visão de detalhes)
                const uniqueColors = [...new Set(variationsResult.map(v => v.color))];
                const uniqueSizes = [...new Set(variationsResult.map(v => v.size))];
                
                // Pegar todas as imagens únicas das variações para uma galeria
                const allImages = variationsResult.map(v => v.image_url).filter(url => url);
                const uniqueImages = [...new Set(allImages)];

                product.tags = safeJSONParse(product.tags);
                product.colors = uniqueColors;
                product.sizes = uniqueSizes;
                product.image_urls = uniqueImages; // Lista de imagens para a galeria
                product.variations = variationsResult; // Variações completas
                
                res.json(product);
            });
        });
    });
};
