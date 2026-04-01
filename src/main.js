import Chart from 'chart.js/auto';

// MOCK DATA
const categoryList = ['ელექტორნული ჟურნალი', 'პირველკლასელთა რეგისტრაცია', 'eschool', 'ანკეტა კითხვარები', 'ინტერნეტის პრობლემა'];

let callRegistry = [
    { id: 1001, type: 'in', name: 'გიორგი მაისურაძე', number: '599 12 34 56', duration: '03:45', time: '10:15', category: 'ელექტორნული ჟურნალი', comment: 'პაროლის აღდგენა ვერ შეძლო', fav: true, avatar: 'https://i.pravatar.cc/150?u=1', tags: ['VIP'] },
    { id: 1002, type: 'out', name: 'ნინო ბერიძე', number: '595 98 76 54', duration: '01:20', time: '11:30', category: 'პირველკლასელთა რეგისტრაცია', comment: '', fav: false, avatar: 'https://i.pravatar.cc/150?u=2', tags: [] },
    { id: 1003, type: 'in', name: 'ლევან მესხი', number: '577 11 22 33', duration: '05:10', time: '12:45', category: 'ინტერნეტის პრობლემა', comment: 'სკოლაში არ არის კავშირი', fav: false, avatar: 'https://i.pravatar.cc/150?u=3', tags: ['Complaint'] }
];

// ადმინიდან მართვადი ცხელი ხაზების სია
let hotlineData = [
    { name: "ბაზები", number: "201" },
    { name: "ინფრასტრუქტურა", number: "202" },
    { name: "EMIS Helpdesk", number: "032 2 200 220" }
];

let currentTab = 'recent';
let activeCall = null; 
let callTimer = 0;
let timerInterval;
let currentDialNumber = "";
let currentUserRole = 'operator';
let currentActiveTags = []; 
let chartInstances = {};

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
let inactivityTimer;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (localStorage.getItem('sipLogged') === 'true') {
        inactivityTimer = setTimeout(performLogout, SESSION_TIMEOUT_MS);
    }
}

window.onload = () => {
    checkSavedCredentials();
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    renderHotlines(); // ვხატავთ ცხელ ხაზებს ჩატვირთვისას
};

function handleLoginEnter(event) { if (event.key === 'Enter') startSipLogin(); }

function checkSavedCredentials() {
    const isRemembered = localStorage.getItem('rememberCreds') === 'true';
    if (isRemembered) {
        document.getElementById('sipWss').value = localStorage.getItem('savedWss') || '';
        document.getElementById('sipExt').value = localStorage.getItem('savedExt') || '';
        document.getElementById('rememberMe').checked = true;
    }
    
    if (localStorage.getItem('sipLogged') === 'true') {
        const ext = localStorage.getItem('activeExt');
        applyRole(localStorage.getItem('userRole') || 'operator');
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('displayOpName').innerText = ext || "ოპერატორი";
        document.getElementById('navOpStatus').style.background = 'var(--primary)';
        resetInactivityTimer();
        updateFooterStats();
    }
}

function performLogout() {
    localStorage.removeItem('sipLogged');
    localStorage.removeItem('activeExt');
    localStorage.removeItem('userRole');
    location.reload(); 
}

function applyRole(role) {
    currentUserRole = role;
    const fStats = document.getElementById('footerOperatorStats');
    const footerContainer = document.getElementById('appFooter');

    if (role === 'admin') {
        document.body.classList.remove('role-operator');
        // ადმინთან ვმალავთ სტატისტიკას ფუტერში და ვცენტრავთ ცხელ ხაზებს
        if(fStats) fStats.style.display = 'none';
        if(footerContainer) footerContainer.style.justifyContent = 'center';
    } else {
        document.body.classList.add('role-operator');
        // ოპერატორთან ვტოვებთ სტატისტიკას და ვშლით ფუტერს ორივე კუთხეში
        if(fStats) fStats.style.display = 'flex';
        if(footerContainer) footerContainer.style.justifyContent = 'space-between';
    }
}

function renderHotlines() {
    const container = document.getElementById('hotlinesContainer');
    if(container) {
        container.innerHTML = hotlineData.map(h => `
            <div class="hl-item">
                <span>${h.name}:</span>
                <strong>${h.number}</strong>
            </div>
        `).join('');
    }
}

function startSipLogin() {
    const wss = document.getElementById('sipWss').value;
    const ext = document.getElementById('sipExt').value;
    const pass = document.getElementById('sipPass').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    if (rememberMe) {
        localStorage.setItem('rememberCreds', 'true');
        localStorage.setItem('savedWss', wss);
        localStorage.setItem('savedExt', ext);
    }

    const role = (ext.toLowerCase() === 'admin') ? 'admin' : 'operator';
    
    if (ext === 'test' || ext === 'admin' || pass === '123') { 
        localStorage.setItem('sipLogged', 'true');
        localStorage.setItem('activeExt', ext);
        localStorage.setItem('userRole', role);
        applyRole(role);
        
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('displayOpName').innerText = ext;
        showToast('სისტემაში შესვლა წარმატებულია', 'success');
        resetInactivityTimer();
        updateFooterStats();
        return;
    }
}

function switchMainView(viewType) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    const workspaceCore = document.querySelector('.workspace-core');
    const statsWidget = document.getElementById('widget-stats');
    const teamWidget = document.getElementById('widget-team');
    
    if(workspaceCore) workspaceCore.style.display = 'none';
    if(statsWidget) statsWidget.style.display = 'none';
    if(teamWidget) teamWidget.style.display = 'none';

    if (viewType === 'phone') {
        if(workspaceCore) workspaceCore.style.display = 'flex';
    } 
    else if (viewType === 'stats') {
        if(statsWidget) {
            statsWidget.style.display = 'block';
            setTimeout(renderAdminCharts, 100); 
        }
    } 
    else if (viewType === 'team') {
        if(teamWidget) teamWidget.style.display = 'block';
    }
}

window.renderAdminCharts = function() {
    Object.keys(chartInstances).forEach(key => {
        if(chartInstances[key]) chartInstances[key].destroy();
    });

    const commonOptions = { responsive: true, maintainAspectRatio: false };

    const ctxTrend = document.getElementById('chartTrend');
    if(ctxTrend) {
        chartInstances.trend = new Chart(ctxTrend, {
            type: 'line',
            data: { labels: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'], datasets: [{ label: 'შემოსული ზარები', data: [12, 19, 35, 25, 42, 38, 50, 20, 10], borderColor: '#00C48C', backgroundColor: 'rgba(0, 196, 140, 0.1)', tension: 0.4, fill: true }] },
            options: { ...commonOptions, plugins: { legend: { display: false } } }
        });
    }

    const ctxCat = document.getElementById('chartCategory');
    if(ctxCat) {
        chartInstances.category = new Chart(ctxCat, {
            type: 'bar',
            data: { labels: ['ელ. ჟურნალი', 'eschool', 'რეგისტრაცია', 'ინტერნეტი', 'სხვა'], datasets: [{ label: 'რაოდენობა', data: [120, 95, 60, 45, 20], backgroundColor: '#4A90E2', borderRadius: 6 }] },
            options: { ...commonOptions, plugins: { legend: { display: false } } }
        });
    }

    const ctxTags = document.getElementById('chartTags');
    if(ctxTags) {
        chartInstances.tags = new Chart(ctxTags, {
            type: 'doughnut',
            data: { labels: ['VIP', 'Complaint', 'Info'], datasets: [{ data: [30, 15, 55], backgroundColor: ['#F5A623', '#FF6B6B', '#50E3C2'], borderWidth: 0 }] },
            options: { ...commonOptions, cutout: '70%', plugins: { legend: { position: 'right' } } }
        });
    }

    const ctxOps = document.getElementById('chartOperators');
    if(ctxOps) {
        chartInstances.ops = new Chart(ctxOps, {
            type: 'bar',
            data: { labels: ['ნ. ბერიძე', 'ლ. მესხი', 'ა. გიორგაძე', 'გ. მახარაძე'], datasets: [{ label: 'ზარები', data: [85, 72, 65, 40], backgroundColor: '#8C54FF', borderRadius: 6 }] },
            options: { ...commonOptions, indexAxis: 'y', plugins: { legend: { display: false } } }
        });
    }

    const ctxTeams = document.getElementById('chartTeams');
    if(ctxTeams) {
        chartInstances.teams = new Chart(ctxTeams, {
            type: 'pie',
            data: { labels: ['Helpdesk', 'IT Support', 'HR/Admin'], datasets: [{ data: [60, 25, 15], backgroundColor: ['#4A90E2', '#00C48C', '#8A94A6'], borderWidth: 0 }] },
            options: { ...commonOptions, plugins: { legend: { position: 'bottom' } } }
        });
    }
};

function setWidgetView(viewId) {
    document.querySelectorAll('.widget-view').forEach(p => p.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
    const key = e.key;
    if (/^[0-9*#]$/.test(key)) addNum(key);
    else if (key === 'Backspace') clearNum();
    else if (key === 'Enter' && currentDialNumber.length > 2) manualDial();
});

function handleWrapupEnter(event) { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') saveRecord(); }
function addNum(n) { currentDialNumber += n; document.getElementById('dialInput').innerText = currentDialNumber; }
function clearNum() { currentDialNumber = currentDialNumber.slice(0, -1); document.getElementById('dialInput').innerText = currentDialNumber; }

function getAvatarUrl(name) {
    if(name === 'უცნობი ნომერი') return '';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
}

window.simulateCall = function(type) {
    const statusEl = document.getElementById('opStatus');
    const status = statusEl ? statusEl.value : 'online';
    
    if(status === 'wrapup') {
        if(type === 'internal') {
            showToast('შიდა ზარი: ნინო ბერიძე (101)', 'info');
        } else {
            showToast('ახალი ზარი დაიბლოკა. თქვენ იმყოფებით ACW სტატუსში.', 'error');
        }
        return;
    }

    if(type === 'internal') {
        startCall('ნინო ბერიძე', '101', true, getAvatarUrl('ნინო ბერიძე'));
    } else {
        const n = '599 12 34 56'; 
        const found = callRegistry.find(c => c.number.replace(/\s/g, '') === n.replace(/\s/g, ''));
        const name = found ? found.name : 'უცნობი ნომერი';
        startCall(name, n, true, found ? found.avatar : '');
    }
}

function manualDial() { 
    if(currentDialNumber.length > 2) {
        const found = callRegistry.find(c => c.number.replace(/\s/g, '') === currentDialNumber);
        const name = found ? found.name : 'უცნობი ნომერი';
        startCall(name, currentDialNumber, false, found ? found.avatar : getAvatarUrl(name));
    }
}

function toggleQuickTag(tag, element) {
    if(currentActiveTags.includes(tag)) {
        currentActiveTags = currentActiveTags.filter(t => t !== tag);
        element.classList.remove('active');
    } else {
        currentActiveTags.push(tag);
        element.classList.add('active');
    }
    const tagCont = document.getElementById('wrapTagsContainer');
    if(tagCont) tagCont.innerHTML = currentActiveTags.map(t => `<span class="tag-pill tag-${t.toLowerCase()} active">${t}</span>`).join('');
}

function startCall(name, number, isIncoming, avatarUrl = '') {
    currentActiveTags = [];
    document.querySelectorAll('.tag-pill').forEach(el => el.classList.remove('active'));
    currentDialNumber = '';
    document.getElementById('dialInput').innerText = '';
    document.getElementById('acwOverlay').style.display = 'none'; 
    
    const opStatusSelect = document.getElementById('opStatus');
    if(opStatusSelect) { opStatusSelect.value = 'online'; changeStatus(opStatusSelect); }

    activeCall = { id: Date.now(), name: name, number: number, type: isIncoming ? 'in' : 'out', duration: '00:00', avatar: avatarUrl };
    
    document.getElementById('callName').innerText = name; 
    document.getElementById('callNumber').innerText = number;
    document.getElementById('callDirectionText').innerText = isIncoming ? 'შემომავალი ზარი' : 'გამავალი ზარი';
    document.getElementById('callStatus').innerText = 'რეკავს...';
    
    const avatarImg = document.getElementById('callAvatarImg');
    const avatarPlaceholder = document.getElementById('callAvatarPlaceholder');
    if (avatarImg && avatarPlaceholder) {
        if(avatarUrl) {
            avatarImg.src = avatarUrl; avatarImg.style.display = 'block'; avatarPlaceholder.style.display = 'none';
        } else {
            avatarImg.style.display = 'none'; avatarPlaceholder.style.display = 'block';
        }
    }

    document.getElementById('wrapName').innerText = name;
    document.getElementById('wrapNumber').innerText = number;
    document.getElementById('wrapDuration').innerHTML = '<span style="animation: pulseGreen 2s infinite;">მიმდინარეობს...</span>';
    document.getElementById('wrapAvatar').src = avatarUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
    document.getElementById('wrapAvatar').style.display = avatarUrl ? 'block' : 'none';
    document.getElementById('wrapTagsContainer').innerHTML = '';

    const pastCalls = callRegistry.filter(c => c.number.replace(/\s/g, '') === number.replace(/\s/g, ''));
    const wrapHist = document.getElementById('wrapupHistoryBlock');
    
    if(pastCalls.length > 0) {
        const last = pastCalls[0];
        document.getElementById('wrapCategory').value = last.category || '';
        document.getElementById('wrapComment').value = last.comment || '';
        
        if (last.tags && last.tags.length > 0) {
            currentActiveTags = [...last.tags];
            document.querySelectorAll('.tag-pill').forEach(el => {
                if(currentActiveTags.includes(el.innerText)) el.classList.add('active');
            });
            document.getElementById('wrapTagsContainer').innerHTML = currentActiveTags.map(t => `<span class="tag-pill tag-${t.toLowerCase()} active">${t}</span>`).join('');
        }
        
        wrapHist.style.display = 'block';
        let items = pastCalls.slice(0, 3).map(p => `
            <div class="hist-item">
                <h5><span><i class="ph-bold ph-calendar-blank" style="color:var(--primary);"></i> ${p.time}</span> <span style="font-size: 11px; color: var(--text-muted); font-weight:500;">${p.category}</span></h5>
                <p>${p.comment || 'კომენტარის გარეშე'}</p>
            </div>
        `).join('');
        wrapHist.innerHTML = `<h4 style="font-size: 14px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;"><i class="ph-bold ph-history"></i> წინა ზარების ისტორია</h4>` + items;
    } else { 
        document.getElementById('wrapCategory').value = '';
        document.getElementById('wrapComment').value = '';
        wrapHist.style.display = 'none'; 
    }
    
    document.getElementById('customer360Panel').classList.add('open');
    document.getElementById('widget-phone').style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector('.nav-item[title="ტელეფონი"]').classList.add('active');
    setWidgetView('view-call');
    
    callTimer = 0; clearInterval(timerInterval);
    setTimeout(() => {
        document.getElementById('callStatus').innerText = '00:00';
        document.getElementById('callAvatarIcon').classList.remove('pulse'); 
        timerInterval = setInterval(() => {
            callTimer++;
            let m = String(Math.floor(callTimer/60)).padStart(2,'0'); let s = String(callTimer%60).padStart(2,'0');
            activeCall.duration = `${m}:${s}`;
            document.getElementById('callStatus').innerText = `${m}:${s}`;
            document.getElementById('wrapDuration').innerText = `${m}:${s} წთ`;
        }, 1000);
    }, isIncoming ? 1500 : 1000);
}

function endCallAndWrapup() {
    clearInterval(timerInterval);
    const opStatusSelect = document.getElementById('opStatus');
    if(opStatusSelect) { opStatusSelect.value = 'wrapup'; changeStatus(opStatusSelect); }
    document.getElementById('acwOverlay').style.display = 'flex'; 
    document.getElementById('wrapDuration').innerText = activeCall.duration + ' წთ';
    if (!document.getElementById('wrapCategory').value) { setTimeout(() => document.getElementById('wrapCategory').focus(), 300); }
}

function toggleInCallKeypad() {
    const keypad = document.getElementById('inCallKeypadOverlay');
    const btn = document.getElementById('keypadBtnIcon').parentElement;
    if(keypad.style.display === 'none') { keypad.style.display = 'block'; btn.classList.add('active');
    } else { keypad.style.display = 'none'; btn.classList.remove('active'); }
}

function sendDTMF(key) { showToast(`DTMF ტონი გაიგზავნა: ${key}`, 'info'); }
function createJiraTicket() { showToast('Jira Task შეიქმნა წარმატებით!', 'info'); }

function saveRecord() {
    const cat = document.getElementById('wrapCategory').value;
    const comment = document.getElementById('wrapComment').value;
    
    if(!cat) { showToast('გთხოვთ აირჩიოთ კატეგორია', 'error'); return; }
    
    callRegistry.unshift({
        id: activeCall.id, type: activeCall.type, name: activeCall.name, number: activeCall.number, duration: activeCall.duration,
        time: new Date().toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'}),
        category: cat, comment: comment, fav: document.getElementById('wrapFavorite').checked, avatar: activeCall.avatar, tags: [...currentActiveTags]
    });
    
    document.getElementById('wrapCategory').value = ''; document.getElementById('wrapComment').value = ''; document.getElementById('wrapFavorite').checked = false;
    currentActiveTags = []; activeCall = null;
    
    document.getElementById('customer360Panel').classList.remove('open');
    document.getElementById('acwOverlay').style.display = 'none';
    
    const opStatusSelect = document.getElementById('opStatus');
    if(opStatusSelect) { opStatusSelect.value = 'online'; changeStatus(opStatusSelect); }
    
    setWidgetView('view-dialpad');
    renderRegistry();
    updateFooterStats();
    showToast('შენახულია', 'success');
}

function updateFooterStats() {
    if(currentUserRole === 'operator') {
        const ins = callRegistry.filter(c => c.type === 'in').length;
        const outs = callRegistry.filter(c => c.type === 'out').length;
        document.getElementById('fsIn').innerText = ins;
        document.getElementById('fsOut').innerText = outs;
        document.getElementById('fsMissed').innerText = Math.floor(Math.random() * 3);
    }
}

function switchTab(tabName, element) {
    currentTab = tabName;
    document.querySelectorAll('.htab').forEach(t => t.classList.remove('active')); 
    element.classList.add('active');
    renderRegistry();
}

function renderRegistry() {
    const list = document.getElementById('registryList');
    let data = currentTab === 'favorites' ? callRegistry.filter(c => c.fav) : callRegistry;
    
    list.innerHTML = data.map(call => {
        let avatarHtml = call.avatar ? `<img src="${call.avatar}" class="h-avatar">` : `<div class="h-icon ${call.type}"><i class="ph-bold ${call.type === 'in' ? 'ph-arrow-down-left' : 'ph-arrow-up-right'}"></i></div>`;
        let tagHtml = call.tags && call.tags.length > 0 ? `<div style="display:inline-block; margin-left:6px; font-size:9px; background:#F0F2F5; padding:2px 6px; border-radius:8px;">${call.tags[0]}</div>` : '';
        return `
        <li onclick="showCallDetails(${call.id})">
            <div class="h-info">${avatarHtml}<div class="h-text"><strong>${call.name} ${call.fav ? '<i class="ph-fill ph-star" style="color: #F5A623"></i>' : ''}</strong><span>${call.category} ${tagHtml}</span></div></div>
            <div class="h-time"><span style="font-size: 10px; opacity:0.8;">${call.type === 'in' ? 'შემომავალი' : 'გამავალი'}</span><br>${call.time}</div>
        </li>`}).join('');
}

function showCallDetails(id) {
    const call = callRegistry.find(c => c.id === id);
    if(!call) return;
    const panel = document.getElementById('callDetailsSlide');
    const body = document.getElementById('slideBodyContent');
    
    let avatarHtml = call.avatar ? `<img src="${call.avatar}" class="caller-avatar-large">` : `<div class="caller-avatar-large" style="display:flex;"><i class="ph-fill ph-user"></i></div>`;
    let tagHtml = call.tags ? call.tags.map(t => `<span class="tag-pill tag-${t.toLowerCase()} active">${t}</span>`).join('') : '';

    body.innerHTML = `
        ${avatarHtml}<h3>${call.name}</h3><p>${call.number}</p>
        <div class="cp-tags" style="justify-content:center; margin-bottom: 24px;">${tagHtml}</div>
        <div class="slide-actions">
            <button class="btn-outline" onclick="startCall('${call.name}', '${call.number}', false, '${call.avatar}'); closeCallDetails();"><i class="ph-bold ph-phone"></i> დარეკვა</button>
            <button class="btn-outline" onclick="showToast('გაზიარდა გუნდის ჩატში', 'info')"><i class="ph-bold ph-share-network"></i> გაზიარება</button>
        </div>
        <div class="slide-meta">
            <div><strong>მიმართულება</strong><span>${call.type === 'in' ? 'შემომავალი ზარი' : 'გამავალი ზარი'}</span></div>
            <div><strong>საუბრის დრო</strong><span>${call.time} / ${call.duration} წთ</span></div>
            <div><strong>კატეგორია</strong><span>${call.category}</span></div>
            ${call.comment ? `<div><strong>კომენტარი</strong><span>${call.comment}</span></div>` : ''}
        </div>
    `;
    panel.classList.add('open');
}

function closeCallDetails() { document.getElementById('callDetailsSlide').classList.remove('open'); }
function showToast(msg, type) {
    const t = document.getElementById('toastMsg'); document.getElementById('toastText').innerText = msg;
    document.getElementById('toastIcon').className = type === 'success' ? 'ph-fill ph-check-circle toast-icon' : type === 'error' ? 'ph-fill ph-warning-circle toast-icon' : 'ph-fill ph-info toast-icon';
    document.getElementById('toastActionBtn').style.display = 'none'; t.className = `toast ${type}`; t.style.display = 'flex';
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => {t.style.display = 'none'; t.style.opacity='1';}, 300); }, 3000);
}

function changeStatus(s) { 
    if(!s || !s.style) return; s.className = 'status-select ' + s.value; const dot = document.getElementById('navOpStatus');
    if(s.value === 'online') { s.style.color = 'var(--primary)'; dot.style.background = 'var(--primary)'; dot.style.boxShadow = '0 0 0 2px var(--primary)'; } 
    else if (s.value === 'wrapup') { s.style.color = '#F5A623'; dot.style.background = '#F5A623'; dot.style.boxShadow = '0 0 0 2px #F5A623'; } 
    else { s.style.color = '#8A94A6'; dot.style.background = '#8A94A6'; dot.style.boxShadow = '0 0 0 2px #8A94A6'; }
}
function handleSearch() {}

window.handleLoginEnter = handleLoginEnter; window.handleWrapupEnter = handleWrapupEnter; window.startSipLogin = startSipLogin; window.performLogout = performLogout; window.switchMainView = switchMainView; window.addNum = addNum; window.clearNum = clearNum; window.manualDial = manualDial; window.startCall = startCall; window.toggleQuickTag = toggleQuickTag; window.endCallAndWrapup = endCallAndWrapup; window.createJiraTicket = createJiraTicket; window.saveRecord = saveRecord; window.switchTab = switchTab; window.showCallDetails = showCallDetails; window.closeCallDetails = closeCallDetails; window.changeStatus = changeStatus; window.handleSearch = handleSearch; window.renderAdminCharts = renderAdminCharts;