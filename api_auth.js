const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = (app, db) => {
    
    // ROTA DE REGISTRO/CADASTRO DO COMPRADOR
    app.post('/api/registro', async (req, res) => {
        const { name, email, password } = req.body;
        
        // 1. Validação simples
        if (!email || !password || !name) {
            return res.status(400).json({ message: "Nome, e-mail e senha são obrigatórios." });
        }

        try {
            // 2. Hash da senha
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // 3. Salvar no banco com role 'user'
            db.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')", 
                [name, email, hashedPassword], (err, result) => {
                
                if (err && err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ message: "E-mail já cadastrado." });
                }
                if (err) {
                    console.error('Erro no registro:', err);
                    return res.status(500).json({ message: "Erro ao registrar usuário." });
                }
                
                // 4. Gerar token de login automático após registro
                const userId = result.insertId;
                const token = jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
                
                res.status(201).json({ 
                    message: "Usuário registrado com sucesso.",
                    token, 
                    role: 'user', 
                    name: name,
                    id: userId
                });
            });
        } catch (error) {
            console.error('Erro no processamento do registro:', error);
            res.status(500).json({ message: "Erro interno no servidor." });
        }
    });
    
    // ROTA DE LOGIN DO COMPRADOR (Geral)
    app.post('/api/login', (req, res) => {
        const { email, password } = req.body;
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
            if (err) return res.status(500).send(err);
            // Esta rota aceita qualquer usuário (user ou admin)
            if (result.length === 0) return res.status(401).json({ message: "Credenciais inválidas" }); 

            const user = result[0];
            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) return res.status(401).json({ message: "Credenciais inválidas" });

            // Gera o token e retorna o role para o frontend
            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
            res.json({ token, role: user.role, name: user.name, id: user.id });
        });
    });
};
