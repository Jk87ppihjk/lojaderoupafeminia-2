const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = (app, db) => {
    
    // -------------------------
    // ROTA DE REGISTRO
    // -------------------------
    app.post('/api/register', async (req, res) => {
        const { name, email, password } = req.body;

        // Validação básica
        if (!name || !email || !password) {
            return res.status(400).json({ message: "Todos os campos são obrigatórios." });
        }

        try {
            // Criptografa a senha antes de salvar
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Insere o novo usuário no banco com papel padrão 'user'
            const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')";
            
            db.query(sql, [name, email, hashedPassword], (err, result) => {
                if (err) {
                    // Se o erro for de duplicidade (e-mail já existe)
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ message: "Este e-mail já está em uso." });
                    }
                    console.error("Erro ao registrar usuário:", err);
                    return res.status(500).json({ message: "Erro ao registrar usuário." });
                }
                res.status(201).json({ message: "Registro concluído com sucesso." });
            });
        } catch (error) {
            console.error("Erro interno:", error);
            res.status(500).json({ message: "Erro interno no servidor." });
        }
    });

    // -------------------------
    // ROTA DE LOGIN
    // -------------------------
    app.post('/api/login', (req, res) => {
        const { email, password } = req.body;
        
        // Busca o usuário pelo e-mail
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
            if (err) {
                console.error("Erro no SQL de login:", err);
                return res.status(500).json({ message: "Erro interno do servidor." });
            }
            
            // Se não encontrar o usuário
            if (result.length === 0) {
                return res.status(401).json({ message: "E-mail ou senha inválidos." });
            }

            const user = result[0];

            // Compara a senha enviada com a senha criptografada no banco
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(401).json({ message: "E-mail ou senha inválidos." });
            }

            // Gera o Token JWT
            const token = jwt.sign(
                { id: user.id, role: user.role }, 
                process.env.JWT_SECRET || 'SEGREDO_MUITO_SECRETO', 
                { expiresIn: '1h' }
            );

            // RETORNA OS DADOS PARA O FRONT-END
            // IMPORTANTE: Aqui garantimos que o 'id' é enviado
            res.json({
                token: token,
                id: user.id,        // <--- CRUCIAL PARA O PERFIL FUNCIONAR
                name: user.name,
                role: user.role,
                message: "Login bem-sucedido."
            });
        });
    });

    // -------------------------
    // ROTA DE PERFIL DO USUÁRIO
    // -------------------------
    app.get('/api/usuario/:userId', (req, res) => {
        const { userId } = req.params;
        
        // Verifica se o ID é válido (não é 'undefined' ou nulo)
        if (!userId || userId === 'undefined') {
            return res.status(400).json({ message: "ID de usuário inválido." });
        }
        
        db.query("SELECT id, name, email, role FROM users WHERE id = ?", [userId], (err, result) => {
            if (err) {
                console.error("Erro ao buscar usuário:", err);
                return res.status(500).json({ message: "Erro interno do servidor." });
            }
            
            if (result.length === 0) {
                return res.status(404).json({ message: "Usuário não encontrado." });
            }

            const userData = result[0];
            res.json({
                id: userData.id,
                name: userData.name,
                email: userData.email,
                role: userData.role
            });
        });
    });

    // -------------------------
    // ROTA DE HISTÓRICO DE PEDIDOS
    // -------------------------
    app.get('/api/usuario/:id/pedidos', (req, res) => {
        const { id } = req.params;
        
        if (!id || id === 'undefined') {
             return res.status(400).json({ message: "ID inválido." });
        }

        db.query("SELECT id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC", [id], (err, result) => {
            if (err) {
                console.error("Erro ao buscar pedidos do usuário:", err);
                return res.status(500).json({ message: "Erro ao buscar pedidos." });
            }
            res.json(result);
        });
    });
};
