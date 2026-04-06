const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 📌 ბაზის ინიციალიზაცია
const db = new sqlite3.Database('./callcenter_v2.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS call_details (id INTEGER PRIMARY KEY AUTOINCREMENT, caller_number TEXT, operator_ext TEXT, date TEXT, time TEXT, category TEXT, tag TEXT, priority TEXT, comment TEXT, task_status TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, allowed_exts TEXT)`);
    db.run(`ALTER TABLE categories ADD COLUMN allowed_exts TEXT`, () => {}); 
    db.run(`CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, number TEXT UNIQUE)`);
    db.run(`CREATE TABLE IF NOT EXISTS statuses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    
    db.get("SELECT count(*) as count FROM statuses", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO statuses (name) VALUES ('დასრულებული'), ('შესავსებია'), ('გადასარეკი')");
        }
    });
});

const connectedOperators = new Map();

io.on('connection', (socket) => {
    socket.on('register_operator', (ext) => {
        socket.join(`ext_${ext}`);
        connectedOperators.set(socket.id, ext);
        io.emit('active_operators', Array.from(new Set(connectedOperators.values())));
    });
    socket.on('disconnect', () => {
        if (connectedOperators.has(socket.id)) {
            connectedOperators.delete(socket.id);
            io.emit('active_operators', Array.from(new Set(connectedOperators.values())));
        }
    });
});

// --- API: WEBHOOK (Asterisk) ---
app.get('/api/webhook/call', (req, res) => {
    const { ext, caller } = req.query;
    if (!ext || !caller) return res.status(400).json({ error: "Missing parameters" });

    io.to(`ext_${ext}`).emit('incoming_call', { caller_number: caller, operator_ext: ext, timestamp: new Date().toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'}) });
    io.emit('admin_new_call_alert', { ext, caller });
    res.status(200).send('Event Received'); 
});

app.get('/api/client/:number', (req, res) => {
    db.get('SELECT name FROM clients WHERE number = ?', [req.params.number], (err, row) => res.json({ name: row ? row.name : null }));
});

// --- API: ზარის შენახვა / განახლება ---
app.post('/api/save-call', (req, res) => {
    const { id, caller_number, client_name, operator_ext, category, tags, priority, comment, task_status } = req.body;
    
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const localDate = (new Date(new Date() - tzOffset)).toISOString().split('T')[0];
    const localTime = new Date().toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'});

    const finalCategory = category || 'დაუხარისხებელი';
    const finalStatus = task_status || 'შესავსებია';

    if (id) {
        db.run(`UPDATE call_details SET category=?, tag=?, priority=?, comment=?, task_status=? WHERE id=?`, 
        [finalCategory, tags, priority, comment, finalStatus, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (client_name) db.run(`INSERT INTO clients (name, number) VALUES (?, ?) ON CONFLICT(number) DO UPDATE SET name=excluded.name`, [client_name, caller_number]);
            io.emit('admin_data_updated'); 
            res.json({ success: true, id: id });
        });
    } else {
        db.run(`INSERT INTO call_details (caller_number, operator_ext, date, time, category, tag, priority, comment, task_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [caller_number, operator_ext, localDate, localTime, finalCategory, tags, priority, comment, finalStatus], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (client_name) db.run(`INSERT INTO clients (name, number) VALUES (?, ?) ON CONFLICT(number) DO UPDATE SET name=excluded.name`, [client_name, caller_number]);
            io.emit('admin_data_updated'); 
            res.json({ success: true, id: this.lastID });
        });
    }
});

// --- API: JIRA ინტეგრაცია ---
// --- API: JIRA ინტეგრაცია (ერთი კლიკით) ---
app.post('/api/jira/create', async (req, res) => {
    const { caller, client, category, comment, operator } = req.body;
    
    console.log(`[JIRA] ვაგზავნით თიქეთს. ნომერი: ${caller} | ოპერატორი: ${operator}`);
    
    const jiraWebhookUrl = "https://api-private.atlassian.com/automation/webhooks/jira/a/7da88a2e-121a-42b9-a1cd-dfbf6f62d611/019d6292-6c9f-7758-bf43-2ca82129d6ea";
    const token = "bd9a3bb704852fcad05e7eddafaa80184283bc28";
    
    try {
        const response = await fetch(jiraWebhookUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // 📌 აი აქ ჩაჯდა შენი სეკრეტი ზუსტად ისე, როგორც შენს მოწოდებულ დოკუმენტაციაში ეწერა!
                'X-Automation-Webhook-Token': token 
            },
            // ვაგზავნით მონაცემებს JIRA-სთვის გასაგებ ენაზე
            body: JSON.stringify({
                caller: caller || "უცნობი",
                client: client || "უცნობი აბონენტი",
                category: category || "ზოგადი",
                comment: comment || "კომენტარის გარეშე",
                operator: operator
            })
        });

        if (response.ok) {
            console.log("[JIRA] ✅ თიქეთი წარმატებით გაიგზავნა!");
            res.json({ success: true });
        } else {
            const errorText = await response.text();
            console.error("[JIRA] ❌ შეცდომა Jira-სგან:", errorText);
            res.status(500).json({ success: false });
        }
    } catch (e) {
        console.error("[JIRA] ❌ ქსელის შეცდომა:", e.message);
        res.status(500).json({ success: false });
    }
});
// --- API: წინა ზარის ისტორიის ძებნა ---
app.get('/api/last-call/:number', (req, res) => {
    // ვეძებთ ამ ნომრის ბოლო ზარს (ORDER BY id DESC LIMIT 1)
    db.get('SELECT * FROM call_details WHERE caller_number = ? ORDER BY id DESC LIMIT 1', [req.params.number], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null); // თუ იპოვა დააბრუნებს, თუ არა - null
    });
});
// --- API: ადმინისა და პარამეტრების მართვა ---
app.get('/api/operator-calls', (req, res) => db.all(`SELECT * FROM call_details WHERE operator_ext = ? ORDER BY id DESC LIMIT 40`, [req.query.ext], (err, rows) => res.json(rows || [])));
app.get('/api/admin/calls', (req, res) => db.all(`SELECT * FROM call_details ORDER BY id DESC`, [], (err, rows) => res.json(rows || [])));
app.get('/api/admin/online', (req, res) => res.json(Array.from(new Set(connectedOperators.values()))));

app.get('/api/categories', (req, res) => {
    db.all('SELECT * FROM categories', [], (err, rows) => {
        if (!req.query.ext) return res.json(rows || []);
        res.json((rows || []).filter(r => !r.allowed_exts || r.allowed_exts.split(',').map(s=>s.trim()).includes(req.query.ext)));
    });
});
app.post('/api/categories', (req, res) => { db.run('INSERT INTO categories (name, allowed_exts) VALUES (?, ?)', [req.body.name, req.body.allowed_exts], (err) => { io.emit('settings_updated'); res.json({ success: !err }); }); });
app.delete('/api/categories/:id', (req, res) => { db.run('DELETE FROM categories WHERE id=?', [req.params.id], (err) => { io.emit('settings_updated'); res.json({ success: !err }); }); });

app.get('/api/tags', (req, res) => db.all('SELECT * FROM tags', [], (err, rows) => res.json(rows || [])));
app.post('/api/tags', (req, res) => { db.run('INSERT INTO tags (name) VALUES (?)', [req.body.name], (err) => { io.emit('settings_updated'); res.json({ success: !err }); }); });
app.delete('/api/tags/:id', (req, res) => { db.run('DELETE FROM tags WHERE id=?', [req.params.id], (err) => { io.emit('settings_updated'); res.json({ success: !err }); }); });

app.get('/api/statuses', (req, res) => db.all('SELECT * FROM statuses', [], (err, rows) => res.json(rows || [])));
app.post('/api/statuses', (req, res) => { db.run('INSERT INTO statuses (name) VALUES (?)', [req.body.name], (err) => { io.emit('settings_updated'); res.json({ success: !err }); }); });
app.delete('/api/statuses/:id', (req, res) => { db.run('DELETE FROM statuses WHERE id=?', [req.params.id], (err) => { io.emit('settings_updated'); res.json({ success: !err }); }); });

server.listen(PORT, () => console.log(`🚀 v2 სერვერი ჩაირთო: http://localhost:${PORT}`));