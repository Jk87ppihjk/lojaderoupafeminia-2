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

// Conexão com o Banco de Dados
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Inicialização e Migração do Banco de Dados
const initDb = async () => {
    const promiseDb = db.promise();

    console.log("Verificando estrutura do banco de dados...");

    // 1. Tabela Usuários
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

    // 2. Tabela Produtos
    await promiseDb.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255),
            description TEXT,
            price DECIMAL(10, 2),
            sku VARCHAR(50),
            image_urls TEXT,
            category VARCHAR(100),
            stock INT DEFAULT 0
        )
    `);

    // 3. Tabela Pedidos
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

    // --- CORREÇÕES AUTOMÁTICAS (MIGRAÇÕES) ---

    // CORREÇÃO 1: AUTO_INCREMENT NA COLUNA 'id' DA TABELA 'orders' (RESOLVE O ERRO DE DUPLICIDADE)
    try {
        // Força a coluna ID a ser AUTO_INCREMENT (necessário se o comando CREATE TABLE falhou inicialmente)
        await promiseDb.query("ALTER TABLE orders MODIFY id INT NOT NULL AUTO_INCREMENT");
        console.log("Correção: AUTO_INCREMENT aplicado à coluna 'id' em orders.");
    } catch (err) {
        console.log("Aviso: Falha ao aplicar AUTO_INCREMENT (provavelmente já está OK).");
    }
    
    // Correção 2: Coluna 'image_urls' (Produtos)
    try {
        await promiseDb.query("SELECT image_urls FROM products LIMIT 1");
    } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') {
            console.log("Coluna 'image_urls' faltando. Adicionando...");
            await promiseDb.query("ALTER TABLE products ADD COLUMN image_urls TEXT");
        }
    }

    // Correção 3: Coluna 'user_id' (Pedidos)
    try {
        await promiseDb.query("SELECT user_id FROM orders LIMIT 1");
    } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') {
            console.log("Coluna 'user_id' faltando em orders. Adicionando...");
            await promiseDb.query("ALTER TABLE orders ADD COLUMN user_id INT");
            try {
                await promiseDb.query("ALTER TABLE orders ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id)");
            } catch (fkErr) {
                console.log("Aviso: Não foi possível adicionar FK em user_id.");
            }
        }
    }

    // Criar Admin Padrão
    const [rows] = await promiseDb.query("SELECT * FROM users WHERE email = 'adm@gmail.com'");
    if (rows.length === 0) {
        const hashedPassword = await bcrypt.hash('1234', 10);
        await promiseDb.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", 
            ['Administrador', 'adm@gmail.com', hashedPassword, 'admin']);
        console.log('Admin padrão criado.');
    }
    
    console.log("Banco de dados pronto.");
};

initDb().catch(err => console.error("Erro ao iniciar DB:", err));

// Importar rotas
require('./api_index')(app, db);
require('./api_detalhes_produto')(app, db);
require('./api_lista_produtos')(app, db);
require('./api_carrinho')(app, db);
require('./api_checkout')(app, db);
require('./api_perfil_usuario')(app, db);
require('./api_dashboard_admin')(app, db);
require('./api_admin_produtos')(app, db);
require('./api_admin_pedidos')(app, db);
require('./api_admin_clientes')(app, db);
require('./api_relatorios')(app, db);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
