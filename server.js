const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- 1. ბაზასთან კავშირი ---
const db = new sqlite3.Database('./callcenter.db', (err) => {
    if (err) console.error('შეცდომა ბაზასთან:', err.message);
    else console.log('✅ დაკავშირებულია SQLite ბაზასთან.');
});

// --- 2. ცხრილების შექმნა (date სვეტით) ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        type TEXT, 
        name TEXT, 
        number TEXT, 
        duration TEXT, 
        date TEXT, 
        time TEXT, 
        category TEXT, 
        comment TEXT, 
        fav INTEGER DEFAULT 0, 
        tags TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS hotlines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, number TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS operators (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, ext TEXT, team TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, color TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, number TEXT)`);
    console.log('✅ ცხრილები შემოწმებულია.');
});

// --- 3. API მარშრუტები (ზარები) ---
app.get('/api/calls', (req, res) => {
    db.all("SELECT * FROM calls ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/calls', (req, res) => {
    const { type, name, number, duration, date, time, category, comment, fav, tags } = req.body;
    const sql = `INSERT INTO calls (type, name, number, duration, date, time, category, comment, fav, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [type, name, number, duration, date, time, category, comment, fav || 0, JSON.stringify(tags || [])];
    
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

// --- 4. API (ცხელი ხაზები) ---
app.get('/api/hotlines', (req, res) => {
    db.all("SELECT * FROM hotlines", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
app.post('/api/hotlines', (req, res) => {
    const { name, number } = req.body;
    db.run(`INSERT INTO hotlines (name, number) VALUES (?, ?)`, [name, number], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});
app.delete('/api/hotlines/:id', (req, res) => {
    db.run(`DELETE FROM hotlines WHERE id = ?`, req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 5. API (ოპერატორები) ---
app.get('/api/operators', (req, res) => {
    db.all("SELECT * FROM operators", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
app.post('/api/operators', (req, res) => {
    const { name, ext, team } = req.body;
    db.run(`INSERT INTO operators (name, ext, team) VALUES (?, ?, ?)`, [name, ext, team], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});
app.delete('/api/operators/:id', (req, res) => {
    db.run(`DELETE FROM operators WHERE id = ?`, req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 6. API (კატეგორიები) ---
app.get('/api/categories', (req, res) => {
    db.all("SELECT * FROM categories", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
app.post('/api/categories', (req, res) => {
    const { name } = req.body;
    db.run(`INSERT INTO categories (name) VALUES (?)`, [name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});
app.delete('/api/categories/:id', (req, res) => {
    db.run(`DELETE FROM categories WHERE id = ?`, req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 7. API (ტეგები) ---
app.get('/api/tags', (req, res) => {
    db.all("SELECT * FROM tags", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
app.post('/api/tags', (req, res) => {
    const { name, color } = req.body;
    db.run(`INSERT INTO tags (name, color) VALUES (?, ?)`, [name, color], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});
app.delete('/api/tags/:id', (req, res) => {
    db.run(`DELETE FROM tags WHERE id = ?`, req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 8. API (კლიენტები) ---
app.get('/api/clients', (req, res) => {
    db.all("SELECT * FROM clients", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});
app.post('/api/clients', (req, res) => {
    const { name, number } = req.body;
    db.get("SELECT id FROM clients WHERE number = ?", [number], (err, row) => {
        if (row) {
            db.run("UPDATE clients SET name = ? WHERE number = ?", [name, number]);
            res.json({ id: row.id, updated: true });
        } else {
            db.run(`INSERT INTO clients (name, number) VALUES (?, ?)`, [name, number], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, created: true });
            });
        }
    });
});

// სერვერის გაშვება
app.listen(PORT, () => {
    console.log(`🚀 სერვერი ჩაირთო პორტზე: http://localhost:${PORT}`);
});