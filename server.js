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

    // 1. Tabela Usuários (Completa)
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

    // 2. Tabela Produtos (Completa)
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

    // 3. Tabela Pedidos (Completa)
    await promiseDb.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL, /* Permitir NULL para pedidos anônimos */
            external_reference VARCHAR(255) UNIQUE, /* Para referência do Mercado Pago */
            total DECIMAL(10, 2),
            status ENUM('Pendente', 'Processando', 'Enviado', 'Entregue', 'Cancelado', 'Reembolsado') DEFAULT 'Pendente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    
    // 4. NOVA TABELA: Itens do Pedido
    await promiseDb.query(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            product_id INT NULL,
            product_name VARCHAR(255),
            unit_price DECIMAL(10, 2),
            quantity INT,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `);
    
    // --- CORREÇÕES AUTOMÁTICAS ---
    // (Incluído aqui para garantir que as colunas 'image_urls' e 'user_id' existam, caso existam tabelas antigas)
    // Se você executou o SQL de limpeza total, essas correções não serão necessárias.
    
    // CORREÇÃO: AUTO_INCREMENT na orders.id (Essencial para o erro de duplicidade)
    try {
        await promiseDb.query("ALTER TABLE orders MODIFY id INT NOT NULL AUTO_INCREMENT");
    } catch (err) {
         // console.log("Aviso: Falha ao aplicar AUTO_INCREMENT (provavelmente OK).");
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
require('./api_auth')(app, db); // NOVA ROTA DE AUTENTICAÇÃO
require('./api_webhooks')(app, db); // NOVA ROTA DE WEBHOOKS MP/BREVO

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
