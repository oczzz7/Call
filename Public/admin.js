const socket = io();
let allCalls = [];
let chartInstances = {};

// 📌 Theme Toggle Logic (ბნელი რეჟიმი)
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const target = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    if(allCalls.length > 0) renderCharts(); 
}
if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

// 📌 ნაგულისხმევად ფილტრებს ვტოვებთ ცარიელს, რომ მთლიანი ისტორია გამოჩნდეს
document.getElementById('filterStart').value = '';
document.getElementById('filterEnd').value = '';

socket.on('active_operators', (ops) => {
    const list = document.getElementById('onlineOperatorsList');
    if (ops.length === 0) { list.innerHTML = '<li style="color:var(--text-muted);">არავინ არ არის</li>'; return; }
    list.innerHTML = ops.map(ext => `<li><span class="live-dot"></span> ოპერატორი ${ext}</li>`).join('');
});

socket.on('admin_data_updated', fetchAdminData);

// 📌 მონაცემების წამოღება (ფილტრაციით)
async function fetchAdminData() {
    try {
        const res = await fetch('/api/admin/calls');
        const data = await res.json();
        
        const start = document.getElementById('filterStart').value;
        const end = document.getElementById('filterEnd').value;
        
        // ფილტრაცია თარიღების მიხედვით (თუ მითითებულია)
        allCalls = data.filter(c => (!start || c.date >= start) && (!end || c.date <= end));
        
        updateKPIs();
        renderCharts();
    } catch (e) { console.error("მონაცემების წამოღების ერორი:", e); }
}

// 📌 KPI-ების განახლება
function updateKPIs() {
    document.getElementById('kpiTotal').innerText = allCalls.length;
    document.getElementById('kpiUnclassified').innerText = allCalls.filter(c => !c.category || c.category === 'დაუხარისხებელი').length;
    document.getElementById('kpiPending').innerText = allCalls.filter(c => c.task_status !== 'დასრულებული').length;
    document.getElementById('kpiPriority').innerText = allCalls.filter(c => c.priority === 'კრიტიკული' || c.priority === 'მაღალი').length;
}

// 📌 გრაფიკების აწყობა (გასწორებული ლოგიკით)
function renderCharts() {
    if(chartInstances.cat) chartInstances.cat.destroy();
    if(chartInstances.tag) chartInstances.tag.destroy();
    if(chartInstances.trend) chartInstances.trend.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
    Chart.defaults.borderColor = isDark ? '#334155' : '#e2e8f0';

    const catData = {}; 
    const tagData = {}; 
    const trendData = {};

    // 📌 უზრუნველვყოფთ, რომ ტრენდის ჩარტს სამუშაო საათები ყოველთვის ჰქონდეს, რომ არ გაქრეს
    for(let i=9; i<=18; i++) {
        trendData[i.toString().padStart(2, '0') + ':00'] = 0;
    }

    allCalls.forEach(c => {
        // კატეგორიები
        const cat = (c.category && c.category.trim() !== '') ? c.category : 'დაუხარისხებელი';
        catData[cat] = (catData[cat] || 0) + 1;
        
        // თეგები
        if (c.tag && c.tag.trim() !== '' && c.tag !== 'undefined' && c.tag !== 'null') {
            tagData[c.tag] = (tagData[c.tag] || 0) + 1;
        }

        // დროის ამოღება საათებში
        if (c.time) {
            const match = c.time.match(/(\d+):/); // ამოიღებს პირველ ციფრებს ორწერტილამდე
            if (match) {
                const hour = match[1].padStart(2, '0') + ':00';
                trendData[hour] = (trendData[hour] || 0) + 1;
            }
        }
    });

    // 1. Categories Chart
    chartInstances.cat = new Chart(document.getElementById('categoryChart'), {
        type: 'doughnut',
        data: { labels: Object.keys(catData), datasets: [{ data: Object.values(catData), backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'], borderWidth: isDark ? 2 : 1, borderColor: isDark ? '#1e293b' : '#ffffff' }] },
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: 10 } }
    });

    // 2. Tags Chart (თუ ცარიელია, ვაჩვენებთ "მონაცემები არ არის")
    if (Object.keys(tagData).length === 0) tagData['თეგი არ არის'] = 0;
    chartInstances.tag = new Chart(document.getElementById('tagChart'), {
        type: 'bar',
        data: { labels: Object.keys(tagData), datasets: [{ label: 'გამოყენება', data: Object.values(tagData), backgroundColor: '#8b5cf6', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 3. Trend Chart
    const sortedHours = Object.keys(trendData).sort();
    chartInstances.trend = new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: { labels: sortedHours, datasets: [{ label: 'ზარები', data: sortedHours.map(h => trendData[h]), borderColor: '#2563eb', tension: 0.4, fill: true, backgroundColor: 'rgba(37, 99, 235, 0.1)' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

// 📌 ექსპორტი
window.exportCSV = function() {
    if (allCalls.length === 0) return alert('მონაცემები არ არის');
    const headers = ['ID', 'თარიღი', 'დრო', 'ოპერატორი', 'აბონენტი', 'კატეგორია', 'თეგი', 'პრიორიტეტი', 'სტატუსი', 'კომენტარი'];
    const rows = [headers.join(',')];
    allCalls.forEach(c => rows.push([c.id, c.date, c.time, c.operator_ext, c.caller_number, `"${c.category || ''}"`, `"${c.tag || ''}"`, c.priority, c.task_status, `"${(c.comment || '').replace(/"/g, '""')}"`].join(',')));
    const blob = new Blob(["\uFEFF" + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `emis_export_${Date.now()}.csv`; a.click();
}

// 📌 პარამეტრების მართვა
async function loadSettings() {
    const renderList = (id, data) => {
        document.getElementById(id).innerHTML = data.map(item => `
            <li style="justify-content:space-between;">
                <div><strong>${item.name}</strong> <span style="font-size:11px; color:var(--text-muted); display:block;">${item.allowed_exts ? 'მხოლოდ: '+item.allowed_exts : ''}</span></div>
                <button onclick="deleteSetting('${id.replace('admin','').replace('List','').toLowerCase()}s', ${item.id})" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="ph-bold ph-trash"></i></button>
            </li>`).join('');
    };
    renderList('adminCatList', await (await fetch('/api/categories')).json());
    renderList('adminTagList', await (await fetch('/api/tags')).json());
    renderList('adminStatusList', await (await fetch('/api/statuses')).json());
}
window.addSetting = async function(type, inputId, extId = null) {
    const val = document.getElementById(inputId).value.trim();
    const exts = extId ? document.getElementById(extId).value.trim() : null;
    if (!val) return;
    await fetch(`/api/${type}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: val, allowed_exts: exts}) });
    document.getElementById(inputId).value = ''; if(extId) document.getElementById(extId).value = '';
};
window.deleteSetting = async function(type, id) { if (confirm('დარწმუნებული ხართ?')) await fetch(`/api/${type}/${id}`, { method: 'DELETE' }); };

socket.on('settings_updated', loadSettings);
fetchAdminData();
loadSettings();
fetch('/api/admin/online').then(r=>r.json()).then(ops => {
    const list = document.getElementById('onlineOperatorsList');
    if(ops.length > 0) list.innerHTML = ops.map(ext => `<li><span class="live-dot"></span> ოპერატორი ${ext}</li>`).join('');
});