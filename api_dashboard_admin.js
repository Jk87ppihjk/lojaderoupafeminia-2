const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = (app, db) => {
    
    // ROTA DE LOGIN
    app.post('/api/login', (req, res) => {
        const { email, password } = req.body;
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
            if (err) return res.status(500).send(err);
            if (result.length === 0) return res.status(401).json({ message: "Usuário não encontrado" });

            const user = result[0];
            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) return res.status(401).json({ message: "Senha incorreta" });

            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
            res.json({ token, role: user.role, name: user.name });
        });
    });

    // Dashboard Stats
    app.get('/api/admin/stats', (req, res) => {
        const stats = {};
        // Exemplo simplificado (ideal usar Promise.all)
        db.query("SELECT SUM(total) as total_vendas FROM orders", (err, r1) => {
            stats.vendas = r1[0].total_vendas || 0;
            db.query("SELECT COUNT(*) as total_pedidos FROM orders", (err, r2) => {
                stats.pedidos = r2[0].total_pedidos || 0;
                res.json(stats);
            });
        });
    });
};
