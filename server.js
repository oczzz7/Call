require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
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

// 📌 PostgreSQL ბაზასთან კავშირი .env ფაილიდან
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

// 📌 ბაზის ინიციალიზაცია (Postgres სინტაქსით)
const initDB = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS call_details (id SERIAL PRIMARY KEY, caller_number VARCHAR, operator_ext VARCHAR, date VARCHAR, time VARCHAR, category VARCHAR, tag VARCHAR, priority VARCHAR, comment TEXT, task_status VARCHAR)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name VARCHAR, allowed_exts VARCHAR)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS tags (id SERIAL PRIMARY KEY, name VARCHAR)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, name VARCHAR, number VARCHAR UNIQUE)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS statuses (id SERIAL PRIMARY KEY, name VARCHAR)`);
        
        await pool.query(`CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, name VARCHAR NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, full_name VARCHAR NOT NULL, team_id INTEGER REFERENCES teams(id), is_active INTEGER DEFAULT 1)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS extensions (id SERIAL PRIMARY KEY, sip_number VARCHAR UNIQUE NOT NULL, user_id INTEGER REFERENCES users(id), team_id INTEGER REFERENCES teams(id))`);

        // საწყისი სტატუსების დამატება
        const statCheck = await pool.query("SELECT count(*) FROM statuses");
        if (parseInt(statCheck.rows[0].count) === 0) {
            await pool.query("INSERT INTO statuses (name) VALUES ('დასრულებული'), ('შესავსებია'), ('გადასარეკი')");
        }

        // სატესტო SIP ნომრების დამატება
        const sipCheck = await pool.query("SELECT count(*) FROM extensions");
        if (parseInt(sipCheck.rows[0].count) === 0) {
            const initialSips = ['1001', '1002', '1003', '1004', '2001', '9307'];
            for (let sip of initialSips) {
                await pool.query("INSERT INTO extensions (sip_number) VALUES ($1)", [sip]);
            }
            console.log("✅ სატესტო SIP ნომრები დაემატა ბაზაში.");
        }
        console.log("✅ PostgreSQL ბაზა ინიციალიზებულია წარმატებით!");
    } catch (err) {
        console.error("❌ ბაზის ინიციალიზაციის შეცდომა:", err);
    }
};
initDB();

const connectedOperators = new Map();

io.on('connection', (socket) => {
    socket.on('request_login', async (ext) => {
        try {
            const result = await pool.query("SELECT * FROM extensions WHERE sip_number = $1", [ext]);
            if (result.rows.length > 0) {
                socket.join(`ext_${ext}`);
                connectedOperators.set(socket.id, ext);
                io.emit('active_operators', Array.from(new Set(connectedOperators.values())));
                socket.emit('login_success', ext);
            } else {
                socket.emit('login_error', 'SIP ნომერი არ არის დაშვებული!');
            }
        } catch (err) {
            socket.emit('login_error', 'სერვერის შეცდომა მონაცემთა ბაზასთან.');
        }
    });

    socket.on('disconnect', () => {
        if (connectedOperators.has(socket.id)) {
            connectedOperators.delete(socket.id);
            io.emit('active_operators', Array.from(new Set(connectedOperators.values())));
        }
    });
});

// --- API: WEBHOOK (Asterisk) ---
app.get('/api/webhook/call', async (req, res) => {
    const { ext, caller } = req.query;
    if (!ext || !caller) return res.status(400).json({ error: "Missing parameters" });

    // 1. მყისიერი პასუხი ასტერისკს
    res.status(200).send('OK');

    // 2. ფონური დამუშავება
    try {
        const extCheck = await pool.query("SELECT * FROM extensions WHERE sip_number = $1", [ext]);
        if (extCheck.rows.length === 0) return;

        const tzOffset = new Date().getTimezoneOffset() * 60000;
        const localDate = (new Date(new Date() - tzOffset)).toISOString().split('T')[0];
        const localTime = new Date().toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'});

        const sql = `INSERT INTO call_details (caller_number, operator_ext, date, time, category, tag, priority, comment, task_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;
        
        const result = await pool.query(sql, [caller, ext, localDate, localTime, 'დაუხარისხებელი', '', 'ნორმალური', '', 'შესავსებია']);
        const newCallId = result.rows[0].id;

        io.to(`ext_${ext}`).emit('incoming_call', { call_id: newCallId, caller_number: caller, operator_ext: ext, timestamp: localTime });
        io.emit('admin_data_updated'); 
    } catch (err) {
        console.error("Webhook DB Error:", err);
    }
});

// --- API: ზარის შენახვა / განახლება ---
app.post('/api/save-call', async (req, res) => {
    const { id, caller_number, client_name, operator_ext, category, tags, priority, comment, task_status } = req.body;
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const localDate = (new Date(new Date() - tzOffset)).toISOString().split('T')[0];
    const localTime = new Date().toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'});

    const finalCategory = category || 'დაუხარისხებელი';
    const finalStatus = task_status || 'შესავსებია';

    try {
        let returnId = id;
        if (id) {
            await pool.query(`UPDATE call_details SET category=$1, tag=$2, priority=$3, comment=$4, task_status=$5 WHERE id=$6`, 
            [finalCategory, tags, priority, comment, finalStatus, id]);
        } else {
            const result = await pool.query(`INSERT INTO call_details (caller_number, operator_ext, date, time, category, tag, priority, comment, task_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, 
            [caller_number, operator_ext, localDate, localTime, finalCategory, tags, priority, comment, finalStatus]);
            returnId = result.rows[0].id;
        }

        if (client_name) {
            await pool.query(`INSERT INTO clients (name, number) VALUES ($1, $2) ON CONFLICT(number) DO UPDATE SET name=excluded.name`, [client_name, caller_number]);
        }

        io.emit('admin_data_updated'); 
        res.json({ success: true, id: returnId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: JIRA ინტეგრაცია ---
app.post('/api/jira/create', async (req, res) => {
    const { caller, client, category, comment, operator } = req.body;
    const jiraWebhookUrl = "https://api-private.atlassian.com/automation/webhooks/jira/a/7da88a2e-121a-42b9-a1cd-dfbf6f62d611/019d6292-6c9f-7758-bf43-2ca82129d6ea";
    const token = "bd9a3bb704852fcad05e7eddafaa80184283bc28";
    
    try {
        const response = await fetch(jiraWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Automation-Webhook-Token': token },
            body: JSON.stringify({ caller: caller || "უცნობი", client: client || "უცნობი", category: category || "ზოგადი", comment: comment || "", operator: operator })
        });
        if (response.ok) res.json({ success: true });
        else res.status(500).json({ success: false });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- API: კლიენტის და წინა ზარის მოძიება ---
app.get('/api/client/:number', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clients WHERE number = $1 LIMIT 1', [req.params.number]);
        res.json(result.rows[0] || {});
    } catch (err) { res.status(500).json({error: err.message}); }
});

app.get('/api/last-call/:number', async (req, res) => {
    try {
        const excludeId = req.query.excludeId;
        let result;
        if (excludeId) {
            result = await pool.query('SELECT * FROM call_details WHERE caller_number = $1 AND id != $2 ORDER BY id DESC LIMIT 1', [req.params.number, excludeId]);
        } else {
            result = await pool.query('SELECT * FROM call_details WHERE caller_number = $1 ORDER BY id DESC LIMIT 1', [req.params.number]);
        }
        res.json(result.rows[0] || null);
    } catch (err) { res.status(500).json({error: err.message}); }
});

// --- API: სტატისტიკა ---
app.get('/api/operator-calls', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM call_details WHERE operator_ext = $1 ORDER BY id DESC LIMIT 40`, [req.query.ext]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({error: err.message}); }
});

app.get('/api/admin/calls', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM call_details ORDER BY id DESC`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({error: err.message}); }
});

app.get('/api/admin/online', (req, res) => res.json(Array.from(new Set(connectedOperators.values()))));

// --- API: ბანერი ---
let globalAnnouncementText = "";
app.post('/api/announcement', (req, res) => {
    globalAnnouncementText = req.body.text || "";
    io.emit('global_announcement', globalAnnouncementText);
    res.json({ success: true });
});

// --- API: TEAMS ---
app.get('/api/teams', async (req, res) => { try { const result = await pool.query('SELECT * FROM teams'); res.json(result.rows); } catch (e) { res.json([]); } });
app.post('/api/teams', async (req, res) => { try { await pool.query('INSERT INTO teams (name) VALUES ($1)', [req.body.name]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.put('/api/teams/:id', async (req, res) => { try { await pool.query('UPDATE teams SET name=$1 WHERE id=$2', [req.body.name, req.params.id]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.delete('/api/teams/:id', async (req, res) => { try { await pool.query('DELETE FROM teams WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// --- API: SIP EXTENSIONS ---
app.get('/api/extensions', async (req, res) => { try { const result = await pool.query(`SELECT e.*, t.name as team_name FROM extensions e LEFT JOIN teams t ON e.team_id = t.id`); res.json(result.rows); } catch (e) { res.json([]); } });
app.post('/api/extensions', async (req, res) => { try { await pool.query(`INSERT INTO extensions (sip_number, team_id) VALUES ($1, $2)`, [req.body.sip_number, req.body.team_id || null]); res.json({ success: true }); } catch (e) { res.status(400).json({error: "შეცდომა"}); } });
app.put('/api/extensions/:id', async (req, res) => { try { await pool.query(`UPDATE extensions SET sip_number=$1, team_id=$2 WHERE id=$3`, [req.body.sip_number, req.body.team_id || null, req.params.id]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.delete('/api/extensions/:id', async (req, res) => { try { await pool.query(`DELETE FROM extensions WHERE id=$1`, [req.params.id]); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

// --- API: კატეგორიები, თეგები, სტატუსები ---
app.get('/api/categories', async (req, res) => { 
    try { 
        const result = await pool.query('SELECT * FROM categories'); 
        let rows = result.rows;
        if (req.query.ext) {
            rows = rows.filter(r => !r.allowed_exts || r.allowed_exts.split(',').map(s=>s.trim()).includes(req.query.ext));
        }
        res.json(rows); 
    } catch (e) { res.json([]); } 
});
app.post('/api/categories', async (req, res) => { try { await pool.query('INSERT INTO categories (name, allowed_exts) VALUES ($1, $2)', [req.body.name, req.body.allowed_exts]); io.emit('settings_updated'); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.put('/api/categories/:id', async (req, res) => { try { await pool.query('UPDATE categories SET name=$1, allowed_exts=$2 WHERE id=$3', [req.body.name, req.body.allowed_exts, req.params.id]); io.emit('settings_updated'); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.delete('/api/categories/:id', async (req, res) => { try { await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]); io.emit('settings_updated'); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

app.get('/api/tags', async (req, res) => { try { const result = await pool.query('SELECT * FROM tags'); res.json(result.rows); } catch (e) { res.json([]); } });
app.post('/api/tags', async (req, res) => { try { await pool.query('INSERT INTO tags (name) VALUES ($1)', [req.body.name]); io.emit('settings_updated'); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.delete('/api/tags/:id', async (req, res) => { try { await pool.query('DELETE FROM tags WHERE id=$1', [req.params.id]); io.emit('settings_updated'); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

app.get('/api/statuses', async (req, res) => { try { const result = await pool.query('SELECT * FROM statuses'); res.json(result.rows); } catch (e) { res.json([]); } });
app.post('/api/statuses', async (req, res) => { try { await pool.query('INSERT INTO statuses (name) VALUES ($1)', [req.body.name]); io.emit('settings_updated'); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.delete('/api/statuses/:id', async (req, res) => { try { await pool.query('DELETE FROM statuses WHERE id=$1', [req.params.id]); io.emit('settings_updated'); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

server.listen(PORT, () => console.log(`🚀 PostgreSQL სერვერი ჩაირთო: http://localhost:${PORT}`));