// 📌 0. Socket.io ინიციალიზაცია (აუცილებელია ბანერისთვის და ლაივ განახლებებისთვის!)
const socket = io();

// 📌 1. XSS დამცავი ფუნქცია (ვირუსული კოდებისგან დასაცავად)
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 📌 2. ბნელი/ნათელი რეჟიმის მართვა
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const target = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    if(currentCallData.length > 0) updateDashboardUI(currentCallData); 
}
if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

// 📌 3. გლობალური ცვლადები
let allSipNumbers = [];
let allTeams = [];
let currentCallData = [];
let callsChartInstance = null;
let categoryPieInstance = null;
let statusPieInstance = null;

// 📌 4. ლაივ სოკეტების მოსმენა
socket.on('admin_data_updated', loadAnalytics);
socket.on('settings_updated', () => {
    loadTeams().then(loadSips);
    loadCategories();
    loadStatuses();
    loadTags();
});
socket.on('active_operators', (ops) => {
    const list = document.getElementById('onlineOperatorsList');
    if (!list) return; // თუ ეკრანზე ეს ბლოკი არ გვაქვს, არ გაჭედოს
    if (ops.length === 0) { list.innerHTML = '<li style="color:var(--text-muted);">არავინ არ არის</li>'; return; }
    list.innerHTML = ops.map(ext => `<li><span class="live-dot"></span> ოპერატორი ${ext}</li>`).join('');
});

// --- ანალიტიკა და ჩარტები ---
async function loadAnalytics() {
    try {
        const res = await fetch('/api/admin/calls');
        let data = await res.json();
        const startDate = document.getElementById('filterStartDate').value;
        const endDate = document.getElementById('filterEndDate').value;

        if (startDate) data = data.filter(c => c.date >= startDate);
        if (endDate) data = data.filter(c => c.date <= endDate);

        currentCallData = data;
        updateDashboardUI(data);
    } catch (e) { console.error("Analytics Load Error:", e); }
}

function updateDashboardUI(data) {
    document.getElementById('statTotal').innerText = data.length;
    document.getElementById('statCompleted').innerText = data.filter(c => c.task_status === 'დასრულებული').length;
    document.getElementById('statPending').innerText = data.filter(c => c.task_status !== 'დასრულებული').length;

    const countsByDate = {};
    const catCounts = {};
    const statusCounts = {};

    [...data].sort((a,b) => a.date.localeCompare(b.date)).forEach(c => { 
        countsByDate[c.date] = (countsByDate[c.date] || 0) + 1; 
        const cat = c.category || 'დაუხარისხებელი';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
        statusCounts[c.task_status] = (statusCounts[c.task_status] || 0) + 1;
    });

    const labels = Object.keys(countsByDate).reverse();
    const dataPoints = Object.values(countsByDate).reverse().map(Number);
    
    // თუ მხოლოდ 1 დღის მონაცემია, ვამატებთ დუმილს რომ ხაზი გაივლოს
    if (labels.length === 1) {
        labels.unshift('წინა დღეები');
        dataPoints.unshift(0);
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
    Chart.defaults.borderColor = isDark ? '#334155' : '#e2e8f0';

    const ctxLine = document.getElementById('callsChart').getContext('2d');
    if (callsChartInstance) callsChartInstance.destroy();
    callsChartInstance = new Chart(ctxLine, {
        type: 'line',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'შემოსული ზარები', 
                data: dataPoints, 
                borderColor: '#2563eb', 
                backgroundColor: 'rgba(37, 99, 235, 0.1)', 
                borderWidth: 2, 
                fill: true, 
                tension: 0.3 
            }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    const ctxCat = document.getElementById('categoryPieChart').getContext('2d');
    if (categoryPieInstance) categoryPieInstance.destroy();
    categoryPieInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: { labels: Object.keys(catCounts).map(escapeHTML), datasets: [{ data: Object.values(catCounts), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'], borderWidth: isDark ? 2 : 1, borderColor: isDark ? '#1e293b' : '#ffffff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'ზარები კატეგორიების მიხედვით' }, legend: { position: 'right' } } }
    });

    const ctxStat = document.getElementById('statusPieChart').getContext('2d');
    if (statusPieInstance) statusPieInstance.destroy();
    statusPieInstance = new Chart(ctxStat, {
        type: 'pie',
        data: { labels: Object.keys(statusCounts).map(escapeHTML), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderWidth: isDark ? 2 : 1, borderColor: isDark ? '#1e293b' : '#ffffff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'დავალებების სტატუსები' }, legend: { position: 'right' } } }
    });

    // ოპერატორების ეფექტურობის ცხრილი
    const opStats = {};
    data.forEach(c => {
        const ext = c.operator_ext || 'უცნობი';
        if (!opStats[ext]) opStats[ext] = { total: 0, completed: 0, pending: 0 };
        opStats[ext].total++;
        if (c.task_status === 'დასრულებული') opStats[ext].completed++;
        else opStats[ext].pending++;
    });

    const tbody = document.getElementById('operatorStatsTable');
    if(tbody) {
        tbody.innerHTML = Object.keys(opStats).sort((a,b) => opStats[b].total - opStats[a].total).map(ext => {
            const stats = opStats[ext];
            const eff = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            return `
                <tr style="border-bottom: 1px solid var(--border); transition: 0.2s;" onmouseover="this.style.background='var(--input-bg)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 12px; font-weight: 600;"><i class="ph-bold ph-user" style="color:var(--text-muted); margin-right:5px;"></i> ${escapeHTML(ext)}</td>
                    <td style="padding: 12px; font-weight: 700;">${stats.total}</td>
                    <td style="padding: 12px; color: var(--success); font-weight: 600;">${stats.completed}</td>
                    <td style="padding: 12px; color: var(--warning); font-weight: 600;">${stats.pending}</td>
                    <td style="padding: 12px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width: 100px; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${eff}%; height: 100%; background: ${eff > 70 ? 'var(--success)' : 'var(--warning)'};"></div>
                            </div>
                            <span style="font-size: 12px; font-weight: 600;">${eff}%</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function exportToCSV() {
    if (currentCallData.length === 0) return alert("მონაცემები არ არის!");
    const headers = ["ID", "ნომერი", "ოპერატორი", "თარიღი", "დრო", "კატეგორია", "თეგი", "პრიორიტეტი", "სტატუსი", "კომენტარი"];
    const csvRows = [headers.join(',')];
    currentCallData.forEach(c => {
        const comment = `"${(c.comment || '').replace(/"/g, '""')}"`;
        csvRows.push([c.id, c.caller_number, c.operator_ext, c.date, c.time, escapeHTML(c.category || "დაუხარისხებელი"), escapeHTML(c.tag || ""), c.priority || "", c.task_status, comment].join(','));
    });
    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `stats_${new Date().toISOString().split('T')[0]}.csv`; a.click();
}

// --- 📢 ბანერი ---
async function setAnnouncement() { 
    const t = document.getElementById('announcementInput').value.trim(); 
    if(t) { 
        await fetch('/api/announcement', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text: t}) }); 
        alert("ბანერი ჩაირთო!"); 
    } 
}
async function clearAnnouncement() { 
    await fetch('/api/announcement', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text: ""}) }); 
    document.getElementById('announcementInput').value = ""; 
    alert("გაითიშა!"); 
}

// --- გუნდები ---
async function loadTeams() { 
    allTeams = await (await fetch('/api/teams')).json(); 
    const list = document.getElementById('teamsList');
    list.innerHTML = allTeams.map(t => `<li class="history-item" style="display:flex; justify-content:space-between;"><strong>${escapeHTML(t.name)}</strong> <button style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="deleteTeam(${t.id})"><i class="ph-bold ph-trash"></i></button></li>`).join('');
    document.getElementById('newSipTeam').innerHTML = '<option value="">გუნდის გარეშე</option>' + allTeams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
}
async function addTeam() { const val = document.getElementById('newTeamInput').value.trim(); if(val) { await fetch('/api/teams', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name: val}) }); document.getElementById('newTeamInput').value = ''; loadTeams(); } }
async function deleteTeam(id) { if(confirm("წავშალოთ გუნდი?")) { await fetch(`/api/teams/${id}`, { method:'DELETE' }); loadTeams(); loadSips(); } }

// --- SIP ნომრები ---
async function loadSips() { 
    allSipNumbers = await (await fetch('/api/extensions')).json();
    const list = document.getElementById('sipExtensionsList');
    list.innerHTML = allSipNumbers.map(s => `
        <li class="history-item" style="display:flex; justify-content:space-between; align-items:center;">
            <div><strong>${escapeHTML(s.sip_number)}</strong> <span style="font-size:11px; color:var(--text-muted); margin-left:10px;"><i class="ph-bold ph-users-three"></i> ${escapeHTML(s.team_name || 'გუნდის გარეშე')}</span></div>
            <div style="display:flex; gap:5px;">
                <button style="background:var(--warning); color:black; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="editSip(${s.id}, '${escapeHTML(s.sip_number)}', ${s.team_id || "''"})"><i class="ph-bold ph-pencil-simple"></i></button>
                <button style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="deleteSip(${s.id})"><i class="ph-bold ph-trash"></i></button>
            </div>
        </li>
    `).join('');
    renderCategoryCheckboxes();
}
function editSip(id, sip, teamId) {
    document.getElementById('editSipId').value = id;
    document.getElementById('newSipInput').value = sip;
    document.getElementById('newSipTeam').value = teamId || "";
    document.getElementById('saveSipBtn').innerHTML = '<i class="ph-bold ph-check"></i>';
    document.getElementById('saveSipBtn').style.background = 'var(--warning)';
    document.getElementById('cancelSipBtn').style.display = 'block';
}
function cancelSipEdit() {
    document.getElementById('editSipId').value = '';
    document.getElementById('newSipInput').value = '';
    document.getElementById('newSipTeam').value = '';
    document.getElementById('saveSipBtn').innerHTML = '<i class="ph-bold ph-plus"></i>';
    document.getElementById('saveSipBtn').style.background = 'var(--primary)';
    document.getElementById('cancelSipBtn').style.display = 'none';
}
async function saveSipExtension() {
    const id = document.getElementById('editSipId').value;
    const sip = document.getElementById('newSipInput').value.trim();
    const team = document.getElementById('newSipTeam').value;
    if (!sip) return;
    const payload = { sip_number: sip, team_id: team || null };
    if (id) await fetch(`/api/extensions/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    else await fetch('/api/extensions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    cancelSipEdit(); loadSips();
}
async function deleteSip(id) { if(confirm("წავშალოთ ნომერი?")) { await fetch(`/api/extensions/${id}`, { method:'DELETE' }); loadSips(); } }

// --- კატეგორიები ---
function renderCategoryCheckboxes() {
    const container = document.getElementById('categorySipCheckboxes');
    let html = '<span style="font-size: 11px; color: var(--text-muted); width: 100%; text-transform: uppercase;">მონიშნეთ რომელ ნომრებს გამოუჩნდეს (თუ ცარიელია, გამოუჩნდება ყველას)</span>';
    allSipNumbers.forEach(sip => { 
        html += `<label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; cursor:pointer;"><input type="checkbox" value="${escapeHTML(sip.sip_number)}" class="cat-sip-cb" style="width:16px; height:16px; cursor:pointer;">${escapeHTML(sip.sip_number)}</label>`; 
    });
    container.innerHTML = html;
}
async function loadCategories() {
    const categories = await (await fetch('/api/categories')).json();
    const list = document.getElementById('categoriesList');
    list.innerHTML = categories.map(c => `
        <li class="history-item" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="display:flex; flex-direction:column; flex:1;">
                <strong style="font-size:14px;">${escapeHTML(c.name)}</strong>
                <span style="font-size:11px; color:var(--text-muted);"><i class="ph-bold ph-users"></i> ${c.allowed_exts ? escapeHTML(c.allowed_exts) : 'ყველა ოპერატორი'}</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button style="background:var(--warning); color:black; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;" onclick="editCategory(${c.id}, '${escapeHTML(c.name)}', '${escapeHTML(c.allowed_exts || '')}')"><i class="ph-bold ph-pencil-simple"></i></button>
                <button style="background:var(--danger); color:white; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;" onclick="deleteCategory(${c.id})"><i class="ph-bold ph-trash"></i></button>
            </div>
        </li>
    `).join('');
}
function editCategory(id, name, exts) {
    document.getElementById('editCategoryId').value = id;
    document.getElementById('newCategoryInput').value = name;
    const allowedArray = exts ? exts.split(',').map(s => s.trim()) : [];
    document.querySelectorAll('.cat-sip-cb').forEach(cb => { cb.checked = allowedArray.includes(cb.value); });
    document.getElementById('cancelCatBtn').style.display = 'block';
    document.getElementById('saveCatBtn').style.background = 'var(--warning)';
    document.getElementById('saveCatBtn').style.color = 'black';
}
function cancelCategoryEdit() {
    document.getElementById('editCategoryId').value = '';
    document.getElementById('newCategoryInput').value = '';
    document.querySelectorAll('.cat-sip-cb').forEach(cb => cb.checked = false);
    document.getElementById('cancelCatBtn').style.display = 'none';
    document.getElementById('saveCatBtn').style.background = 'var(--success)';
    document.getElementById('saveCatBtn').style.color = 'white';
}
async function saveCategory() {
    const id = document.getElementById('editCategoryId').value;
    const name = document.getElementById('newCategoryInput').value.trim();
    if (!name) return;
    const exts = Array.from(document.querySelectorAll('.cat-sip-cb:checked')).map(cb => cb.value).join(','); 
    const payload = { name: name, allowed_exts: exts };
    if (id) await fetch(`/api/categories/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    else await fetch('/api/categories', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    cancelCategoryEdit(); loadCategories();
}
async function deleteCategory(id) { if(confirm("წავშალოთ?")) { await fetch(`/api/categories/${id}`, { method:'DELETE' }); loadCategories(); } }

// --- სტატუსები და თეგები ---
function renderSimpleList(id, items, key, delFn) { document.getElementById(id).innerHTML = items.map(i => `<li class="history-item" style="display:flex; justify-content:space-between;"><strong>${escapeHTML(i[key])}</strong><button style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="${delFn}(${i.id})"><i class="ph-bold ph-trash"></i></button></li>`).join(''); }
async function loadStatuses() { renderSimpleList('statusesList', await (await fetch('/api/statuses')).json(), 'name', 'deleteStatus'); }
async function addStatus() { const val = document.getElementById('newStatusInput').value.trim(); if(val) { await fetch('/api/statuses', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:val}) }); document.getElementById('newStatusInput').value=''; loadStatuses(); } }
async function deleteStatus(id) { if(confirm("წავშალოთ?")) { await fetch(`/api/statuses/${id}`, { method:'DELETE' }); loadStatuses(); } }

async function loadTags() { renderSimpleList('tagsList', await (await fetch('/api/tags')).json(), 'name', 'deleteTag'); }
async function addTag() { const val = document.getElementById('newTagInput').value.trim(); if(val) { await fetch('/api/tags', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:val}) }); document.getElementById('newTagInput').value=''; loadTags(); } }
async function deleteTag(id) { if(confirm("წავშალოთ?")) { await fetch(`/api/tags/${id}`, { method:'DELETE' }); loadTags(); } }

// --- Service Worker ---
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Error:', err)); }); }

// 📌 ჩატვირთვა გვერდის გახსნისას
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date(); const lastWeek = new Date(); lastWeek.setDate(today.getDate() - 7);
    document.getElementById('filterEndDate').value = today.toISOString().split('T')[0];
    document.getElementById('filterStartDate').value = lastWeek.toISOString().split('T')[0];
    
    // საწყისი ონლაინ ოპერატორების წამოღება (რესტარტის დროს რომ არ დაიკარგოს)
    fetch('/api/admin/online').then(r=>r.json()).then(ops => {
        const list = document.getElementById('onlineOperatorsList');
        if(list && ops.length > 0) list.innerHTML = ops.map(ext => `<li><span class="live-dot"></span> ოპერატორი ${ext}</li>`).join('');
    });

    loadAnalytics(); loadTeams().then(loadSips); loadCategories(); loadStatuses(); loadTags();
});