const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Middleware de autenticação simulado (apenas para referência)
// Em um sistema de produção, você usaria um middleware para verificar o JWT em todas as rotas seguras.
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    // O segredo de JWT deve vir de suas variáveis de ambiente
    jwt.verify(token, process.env.JWT_SECRET || 'SEGREDO_MUITO_SECRETO', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};


module.exports = (app, db) => {
    
    // -------------------------
    // ROTA DE REGISTRO
    // -------------------------
    app.post('/api/register', async (req, res) => {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: "Todos os campos são obrigatórios." });
        }

        try {
            // Hashing da senha
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Inserção no banco
            const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')";
            db.query(sql, [name, email, hashedPassword], (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ message: "Este e-mail já está em uso." });
                    }
                    console.error("Erro ao registrar usuário:", err);
                    return res.status(500).json({ message: "Erro ao registrar usuário." });
                }
                res.json({ message: "Registro concluído com sucesso." });
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
        
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
            if (err) {
                console.error("Erro no SQL de login:", err);
                return res.status(500).json({ message: "Erro interno do servidor." });
            }
            if (result.length === 0) {
                return res.status(401).json({ message: "E-mail ou senha inválidos." });
            }

            const user = result[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(401).json({ message: "E-mail ou senha inválidos." });
            }

            // Geração de Token JWT
            const token = jwt.sign(
                { id: user.id, role: user.role }, 
                process.env.JWT_SECRET || 'SEGREDO_MUITO_SECRETO', 
                { expiresIn: '1h' }
            );

            // Retorna dados para o front-end salvar no localStorage
            res.json({
                token: token,
                id: user.id,
                name: user.name,
                role: user.role,
                message: "Login bem-sucedido."
            });
        });
    });

    // ----------------------------------------------------
    // ROTA PARA OBTER DADOS DO PERFIL DO USUÁRIO (CORREÇÃO)
    // ----------------------------------------------------
    app.get('/api/usuario/:userId', (req, res) => {
        const { userId } = req.params;
        
        // Esta rota é o que corrige o erro "Unexpected end of JSON input"
        
        db.query("SELECT id, name, email, role FROM users WHERE id = ?", [userId], (err, result) => {
            if (err) {
                console.error("Erro ao buscar usuário:", err);
                // CORREÇÃO: Sempre retorna um JSON válido em caso de erro 500
                return res.status(500).json({ message: "Erro interno do servidor." });
            }
            
            if (result.length === 0) {
                // CORREÇÃO: Sempre retorna um JSON válido em caso de erro 404
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

    // ------------------------------------------
    // ROTA PARA OBTER HISTÓRICO DE PEDIDOS
    // ------------------------------------------
    app.get('/api/usuario/:id/pedidos', (req, res) => {
        const { id } = req.params;
        
        db.query("SELECT id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC", [id], (err, result) => {
            if (err) {
                console.error("Erro ao buscar pedidos do usuário:", err);
                return res.status(500).send(err);
            }
            res.json(result);
        });
    });
};
