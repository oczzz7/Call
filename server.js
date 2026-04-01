const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const dbPath = path.resolve(__dirname, 'callcenter.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('ბაზასთან კავშირის ერორი:', err.message);
    else console.log('✅ SQLite ბაზასთან კავშირი დამყარებულია.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, name TEXT, number TEXT, duration TEXT, time TEXT, category TEXT, comment TEXT, fav INTEGER DEFAULT 0, tags TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS hotlines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, number TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS operators (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, ext TEXT, team TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, color TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, number TEXT)`);
});

app.get('/api/calls', (req, res) => {
    db.all("SELECT * FROM calls ORDER BY id DESC", [], (err, rows) => {
        res.json(rows ? rows.map(r => ({...r, tags: JSON.parse(r.tags || '[]'), fav: !!r.fav})) : []);
    });
});

app.post('/api/calls', (req, res) => {
    const { type, name, number, duration, time, category, comment, fav, tags } = req.body;
    db.run(`INSERT INTO calls (type, name, number, duration, time, category, comment, fav, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [type, name, number, duration, time, category, comment, fav ? 1 : 0, JSON.stringify(tags || [])], function(err) {
        res.json({ id: this.lastID });
    });
});

app.get('/api/hotlines', (req, res) => { db.all("SELECT * FROM hotlines", [], (err, rows) => res.json(rows || [])); });
app.post('/api/hotlines', (req, res) => {
    db.run(`INSERT INTO hotlines (name, number) VALUES (?, ?)`, [req.body.name, req.body.number], function(err) { res.json({ id: this.lastID }); });
});

app.get('/api/categories', (req, res) => { db.all("SELECT * FROM categories", [], (err, rows) => res.json(rows || [])); });
app.post('/api/categories', (req, res) => {
    db.run(`INSERT INTO categories (name) VALUES (?)`, [req.body.name], function(err) { res.json({ id: this.lastID }); });
});

app.get('/api/tags', (req, res) => { db.all("SELECT * FROM tags", [], (err, rows) => res.json(rows || [])); });
app.post('/api/tags', (req, res) => {
    db.run(`INSERT INTO tags (name, color) VALUES (?, ?)`, [req.body.name, req.body.color], function(err) { res.json({ id: this.lastID }); });
});

app.get('/api/operators', (req, res) => { db.all("SELECT * FROM operators", [], (err, rows) => res.json(rows || [])); });
app.post('/api/operators', (req, res) => {
    db.run(`INSERT INTO operators (name, ext, team) VALUES (?, ?, ?)`, [req.body.name, req.body.ext, req.body.team], function(err) { res.json({ id: this.lastID }); });
});

app.delete('/api/:type/:id', (req, res) => {
    const table = req.params.type;
    db.run(`DELETE FROM ${table} WHERE id = ?`, req.params.id, (err) => res.json({ success: !err }));
});

app.get('/api/lookup', (req, res) => {
    const num = req.query.number;
    db.get(`SELECT name FROM clients WHERE number LIKE ?`, [`%${num}%`], (err, row) => {
        if (row) res.json({ found: true, name: row.name });
        else res.json({ found: false });
    });
});

app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Server on 3000`); });