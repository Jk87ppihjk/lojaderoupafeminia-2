const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = (app, db) => {
    
    // -------------------------
    // ROTA DE REGISTRO
    // -------------------------
    app.post('/api/register', async (req, res) => {
        const { name, email, password } = req.body;
        console.log(`[REGISTER] Tentativa de registro para: ${email}`);

        if (!name || !email || !password) {
            console.log('[REGISTER] Falha: Campos obrigatórios ausentes.');
            return res.status(400).json({ message: "Todos os campos são obrigatórios." });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')";
            db.query(sql, [name, email, hashedPassword], (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        console.log('[REGISTER] Falha: E-mail duplicado.');
                        return res.status(409).json({ message: "Este e-mail já está em uso." });
                    }
                    console.error("[REGISTER] Erro DB:", err);
                    return res.status(500).json({ message: "Erro ao registrar usuário." });
                }
                console.log(`[REGISTER] Sucesso! Novo ID: ${result.insertId}`);
                res.status(201).json({ message: "Registro concluído com sucesso." });
            });
        } catch (error) {
            console.error("[REGISTER] Erro interno:", error);
            res.status(500).json({ message: "Erro interno no servidor." });
        }
    });

    // -------------------------
    // ROTA DE LOGIN (COM LOGS EXTREMOS)
    // -------------------------
    app.post('/api/login', (req, res) => {
        const { email, password } = req.body;
        console.log(`\n>>> [LOGIN] Iniciando login para: ${email}`);
        
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
            if (err) {
                console.error("[LOGIN] Erro SQL:", err);
                return res.status(500).json({ message: "Erro interno do servidor." });
            }
            
            // LOG DO BANCO DE DADOS
            console.log(`[LOGIN] Resultado da busca no DB: ${result.length} usuário(s) encontrado(s).`);
            
            if (result.length === 0) {
                console.log("[LOGIN] Falha: Usuário não encontrado.");
                return res.status(401).json({ message: "E-mail ou senha inválidos." });
            }

            const user = result[0];
            
            // LOG DOS DADOS BRUTOS (Verificar se o 'id' existe aqui)
            console.log("[LOGIN] Dados brutos do usuário (DB):", JSON.stringify(user));

            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                console.log("[LOGIN] Falha: Senha incorreta.");
                return res.status(401).json({ message: "E-mail ou senha inválidos." });
            }

            const token = jwt.sign(
                { id: user.id, role: user.role }, 
                process.env.JWT_SECRET || 'SEGREDO_MUITO_SECRETO', 
                { expiresIn: '1h' }
            );

            // LOG DA RESPOSTA FINAL (A prova real)
            const responseData = {
                token: token, // (encurtado para log)
                id: user.id,
                name: user.name,
                role: user.role,
                message: "Login bem-sucedido."
            };
            
            console.log("[LOGIN] Enviando resposta JSON:", JSON.stringify({
                ...responseData, 
                token: "TOKEN_GERADO..."
            }));

            res.json(responseData);
        });
    });

    // -------------------------
    // ROTA DE PERFIL
    // -------------------------
    app.get('/api/usuario/:userId', (req, res) => {
        const { userId } = req.params;
        console.log(`\n[PERFIL] Buscando dados para ID: ${userId}`);
        
        if (!userId || userId === 'undefined') {
            console.log("[PERFIL] Erro: ID inválido recebido.");
            return res.status(400).json({ message: "ID de usuário inválido." });
        }
        
        db.query("SELECT id, name, email, role FROM users WHERE id = ?", [userId], (err, result) => {
            if (err) {
                console.error("[PERFIL] Erro SQL:", err);
                return res.status(500).json({ message: "Erro interno do servidor." });
            }
            
            if (result.length === 0) {
                console.log("[PERFIL] Usuário não encontrado no DB.");
                return res.status(404).json({ message: "Usuário não encontrado." });
            }

            const userData = result[0];
            console.log("[PERFIL] Dados encontrados:", userData.name);
            
            res.json({
                id: userData.id,
                name: userData.name,
                email: userData.email,
                role: userData.role
            });
        });
    });

    // -------------------------
    // ROTA DE PEDIDOS
    // -------------------------
    app.get('/api/usuario/:id/pedidos', (req, res) => {
        const { id } = req.params;
        // console.log(`[PEDIDOS] Buscando pedidos para ID: ${id}`);
        
        if (!id || id === 'undefined') {
             return res.status(400).json({ message: "ID inválido." });
        }

        db.query("SELECT id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC", [id], (err, result) => {
            if (err) {
                console.error("Erro ao buscar pedidos:", err);
                return res.status(500).json({ message: "Erro ao buscar pedidos." });
            }
            res.json(result);
        });
    });
};
