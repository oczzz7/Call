// 1. შემოგვაქვს Chart.js NPM მოდულიდან
import Chart from 'chart.js/auto';

// --- Mock Data Generation ---
const categoryList = ['ელექტორნული ჟურნალი', 'პირველკლასელთა რეგისტრაცია', 'eschool', 'ანკეტა კითხვარები', 'ინტერნეტის პრობლემა'];
const names = ["გიორგი მაისურაძე", "ნინო ბერიძე", "ლევან მესხი", "ანა გიორგაძე", "უცნობი ნომერი", "მარიამ კვირიკაშვილი", "სკოლის დირექცია"];
let callRegistry = [];

function generateMockData() {
    const today = new Date();
    for(let i=0; i<115; i++) {
        let date = new Date();
        date.setDate(today.getDate() - Math.floor(Math.random() * 30));
        
        let timeStr = date.toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'});
        let dayDiff = today.getDate() - date.getDate();
        let dateDisplay = dayDiff === 0 ? timeStr : (dayDiff === 1 ? 'გუშინ' : `${date.getDate()}/${date.getMonth()+1}`);

        callRegistry.push({
            id: Date.now() - i,
            type: Math.random() > 0.3 ? 'in' : 'out',
            name: names[Math.floor(Math.random() * names.length)],
            number: `5${Math.floor(Math.random() * 90000000 + 10000000)}`,
            time: dateDisplay,
            rawDate: date,
            category: categoryList[Math.floor(Math.random() * categoryList.length)],
            comment: 'ავტომატურად გენერირებული ჩანაწერი ტესტირებისთვის',
            fav: Math.random() > 0.9 
        });
    }
    callRegistry.sort((a,b) => b.rawDate - a.rawDate);
}

// --- State Variables ---
let currentTab = 'recent';
let activeCall = null; 
let callTimer = 0;
let timerInterval;
let currentDialNumber = "";
let chartsInstance = { bar: null, pie: null };

// App Initialization
generateMockData();
// We will call renderRegistry() after assigning it to window

// --- View Logic ---
function setView(viewId) {
    document.querySelectorAll('.workspace-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    const sidebar = document.getElementById('mainSidebar');
    if(viewId === 'view-statistics') {
        sidebar.style.display = 'none';
    } else {
        sidebar.style.display = 'flex';
    }
}

// --- Statistics ---
function openStatistics() {
    setView('view-statistics');
    updateCharts();
}

function closeStatistics() {
    setView('view-dialpad');
}

function updateCharts() {
    const period = document.getElementById('statsPeriod').value;
    const today = new Date();
    
    let filteredData = callRegistry.filter(call => {
        if(period === 'all') return true;
        const diffTime = Math.abs(today - call.rawDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if(period === 'today') return diffDays <= 1;
        if(period === 'week') return diffDays <= 7;
        return true;
    });

    document.getElementById('kpiTotal').innerText = filteredData.length;

    let catCounts = {};
    let inCount = 0; let outCount = 0;
    
    categoryList.forEach(c => catCounts[c] = 0);
    filteredData.forEach(c => {
        if(catCounts[c.category] !== undefined) catCounts[c.category]++;
        if(c.type === 'in') inCount++; else outCount++;
    });

    let topCat = '-'; let topVal = -1;
    for (const [key, value] of Object.entries(catCounts)) {
        if(value > topVal) { topVal = value; topCat = key; }
    }
    document.getElementById('kpiTopCategory').innerText = topCat;
    document.getElementById('kpiTopCount').innerText = `${topVal} შეტყობინება`;

    renderChartJS(catCounts, inCount, outCount);
}

function renderChartJS(catCounts, inCount, outCount) {
    const barColors = ['#0052CC', '#36B37E', '#FFAB00', '#FF5630', '#00B8D9'];
    
    if(chartsInstance.bar) chartsInstance.bar.destroy();
    if(chartsInstance.pie) chartsInstance.pie.destroy();

    const ctxBar = document.getElementById('barChart').getContext('2d');
    chartsInstance.bar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: Object.keys(catCounts),
            datasets: [{
                label: 'ზარების რაოდენობა',
                data: Object.values(catCounts),
                backgroundColor: barColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#EBECF0' } }, x: { grid: { display: false } } }
        }
    });

    const ctxPie = document.getElementById('pieChart').getContext('2d');
    chartsInstance.pie = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['შემომავალი', 'გამავალი'],
            datasets: [{
                data: [inCount, outCount],
                backgroundColor: ['#36B37E', '#0052CC'],
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });
}

// --- Call Handling Logic ---
function addNum(n) { currentDialNumber += n; document.getElementById('dialInput').innerText = currentDialNumber; }
function clearNum() { currentDialNumber = currentDialNumber.slice(0, -1); document.getElementById('dialInput').innerText = currentDialNumber; }
function manualDial() { if(currentDialNumber.length > 2) startCall('უცნობი ნომერი', currentDialNumber, false); currentDialNumber = ""; document.getElementById('dialInput').innerText="";}
function simulateIncomingCall() { startCall(names[Math.floor(Math.random() * names.length)], `599${Math.floor(Math.random()*900000)}`, true); }

function startCall(name, number, isIncoming) {
    activeCall = { name: name, number: number, type: isIncoming ? 'in' : 'out', duration: '00:00' };
    document.getElementById('callName').innerText = name; document.getElementById('callNumber').innerText = number;
    document.getElementById('callStatus').innerText = isIncoming ? 'შემომავალი ზარი...' : 'რეკავს...';
    setView('view-call');
    
    callTimer = 0; clearInterval(timerInterval);
    setTimeout(() => {
        document.getElementById('callStatus').innerText = 'მიმდინარეობს საუბარი: 00:00';
        timerInterval = setInterval(() => {
            callTimer++;
            let m = String(Math.floor(callTimer/60)).padStart(2,'0'); let s = String(callTimer%60).padStart(2,'0');
            activeCall.duration = `${m}:${s}`;
            document.getElementById('callStatus').innerText = `მიმდინარეობს საუბარი: ${m}:${s}`;
        }, 1000);
    }, isIncoming ? 1500 : 1000);
}

function endCallAndWrapup() {
    clearInterval(timerInterval);
    document.getElementById('wrapName').innerText = activeCall.name;
    document.getElementById('wrapDetails').innerText = `ხანგრძლივობა: ${activeCall.duration} • ${activeCall.number}`;
    document.getElementById('wrapCategory').value = ''; document.getElementById('wrapComment').value = '';
    setView('view-wrapup');
}

function saveRecord() {
    const cat = document.getElementById('wrapCategory').value;
    if(!cat) { showToast('აირჩიეთ კატეგორია!', 'error'); return; }
    
    callRegistry.unshift({
        id: Date.now(), type: activeCall.type, name: activeCall.name, number: activeCall.number,
        time: new Date().toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'}),
        rawDate: new Date(), category: cat, comment: document.getElementById('wrapComment').value, fav: false
    });
    
    renderRegistry();
    showToast('✅ ზარი შენახულია ბაზაში', 'success');
    setView('view-dialpad');
}

// --- Registry Renderer ---
function switchTab(tabName, element) {
    currentTab = tabName;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); element.classList.add('active');
    renderRegistry();
}

function renderRegistry() {
    const list = document.getElementById('registryList');
    let data = currentTab === 'favorites' ? callRegistry.filter(c => c.fav) : callRegistry;
    
    list.innerHTML = data.slice(0, 30).map(call => `
        <li class="call-item" onclick="startCall('${call.name}', '${call.number}', false)">
            <div class="call-header">
                <div class="call-identity">
                    <div class="call-icon ${call.type === 'in' ? 'icon-in' : 'icon-out'}">${call.type === 'in' ? '↓' : '↑'}</div>
                    <div>
                        <div class="call-name">${call.name} ${call.fav ? '<span class="fav-star">⭐</span>' : ''}</div>
                        <div class="call-number">${call.number}</div>
                    </div>
                </div>
                <div class="call-meta">${call.time}</div>
            </div>
            <div class="call-details">
                <span class="call-tag">${call.category}</span>
            </div>
        </li>
    `).join('');
}

function showToast(msg, type) {
    const t = document.getElementById('toastMsg');
    t.innerText = msg; t.className = `toast ${type}`; t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

function changeStatus(s) { s.className = 'op-status-select ' + s.value; }
function handleSearch() {
    // Search logic from V5
    const query = document.getElementById('searchInput').value.toLowerCase();
    const resultsBox = document.getElementById('searchResults');
    if (query.length < 2) { resultsBox.style.display = 'none'; return; }
    resultsBox.style.display = 'block';
    resultsBox.innerHTML = `<div style="padding: 16px; color: #888; text-align:center;">ძებნის იმიტაცია: ${query}</div>`;
}

// --- EXPOSE FUNCTIONS TO WINDOW FOR HTML ONCLICK EVENTS ---
// რადგან Vite იყენებს ES Modules, HTML-დან ეს ფუნქციები რომ გამოვიძახოთ, `window`-ს უნდა მივაბათ.
window.openStatistics = openStatistics;
window.closeStatistics = closeStatistics;
window.updateCharts = updateCharts;
window.addNum = addNum;
window.clearNum = clearNum;
window.manualDial = manualDial;
window.simulateIncomingCall = simulateIncomingCall;
window.startCall = startCall;
window.endCallAndWrapup = endCallAndWrapup;
window.saveRecord = saveRecord;
window.switchTab = switchTab;
window.changeStatus = changeStatus;
window.handleSearch = handleSearch;

// Initial render
renderRegistry();