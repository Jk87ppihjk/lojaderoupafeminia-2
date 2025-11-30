require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');

const app = express();

// Configurações
app.use(cors({ origin: '*' })); 
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Conexão com o Banco de Dados (Hostinger)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Inicialização das Tabelas e do Admin
const initDb = async () => {
    const promiseDb = db.promise();

    // Tabela Usuários (MANTIDA)
    await promiseDb.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255),
            email VARCHAR(255) UNIQUE,
            password VARCHAR(255),
            role ENUM('user', 'admin') DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela Produtos (ATUALIZADA: image_url -> image_urls TEXT para JSON Array)
    await promiseDb.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255),
            description TEXT,
            price DECIMAL(10, 2),
            sku VARCHAR(50),
            image_urls TEXT, /* Alterado para armazenar JSON de URLs */
            category VARCHAR(100),
            stock INT DEFAULT 0
        )
    `);

    // Tabela Pedidos (MANTIDA)
    await promiseDb.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            total DECIMAL(10, 2),
            status ENUM('Pendente', 'Processando', 'Enviado', 'Entregue', 'Cancelado') DEFAULT 'Pendente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Criar Admin Padrão (MANTIDO)
    const [rows] = await promiseDb.query("SELECT * FROM users WHERE email = 'adm@gmail.com'");
    if (rows.length === 0) {
        const hashedPassword = await bcrypt.hash('1234', 10);
        await promiseDb.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", 
            ['Administrador', 'adm@gmail.com', hashedPassword, 'admin']);
        console.log('Admin criado com sucesso: adm@gmail.com / 1234');
    }
};

initDb().catch(err => console.error("Erro ao iniciar DB:", err));

// Importar as rotas
require('./api_index')(app, db);
require('./api_detalhes_produto')(app, db);
require('./api_lista_produtos')(app, db);
require('./api_carrinho')(app, db);
require('./api_checkout')(app, db);
require('./api_perfil_usuario')(app, db);
require('./api_dashboard_admin')(app, db); 
require('./api_admin_produtos')(app, db); // Onde a nova lógica de upload estará
require('./api_admin_pedidos')(app, db);
require('./api_admin_clientes')(app, db);
require('./api_relatorios')(app, db);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
