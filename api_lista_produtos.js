module.exports = (app, db) => {
    app.get('/api/produtos', (req, res) => {
        const category = req.query.categoria;
        let query = "SELECT * FROM products";
        let params = [];

        if (category && category !== 'Todos') {
            query += " WHERE category = ?";
            params.push(category);
        }

        db.query(query, params, (err, result) => {
            if (err) return res.status(500).send(err);
            res.json(result);
        });
    });
};
