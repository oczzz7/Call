import Chart from 'chart.js/auto';

// გლობალური მონაცემების მასივები
let callRegistry = [];
let filteredCalls = []; // ახალი: ფილტრაციისთვის განკუთვნილი მასივი
let hotlineData = [];
let operatorData = [];
let categoryData = [];
let tagData = [];
let clientsData = [];
let visibleCallsCount = 15;

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

function handleLoginEnter(event) { if (event.key === 'Enter') startSipLogin(); }

function checkSavedCredentials() {
    const isRemembered = localStorage.getItem('rememberCreds') === 'true';
    if (isRemembered) {
        const wssEl = document.getElementById('sipWss');
        const extEl = document.getElementById('sipExt');
        const remEl = document.getElementById('rememberMe');
        if (wssEl) wssEl.value = localStorage.getItem('savedWss') || '';
        if (extEl) extEl.value = localStorage.getItem('savedExt') || '';
        if (remEl) remEl.checked = true;
    }
    
    if (localStorage.getItem('sipLogged') === 'true') {
        const ext = localStorage.getItem('activeExt');
        applyRole(localStorage.getItem('userRole') || 'operator');
        const overlay = document.getElementById('loginOverlay');
        const opName = document.getElementById('displayOpName');
        const navStatus = document.getElementById('navOpStatus');
        if(overlay) overlay.style.display = 'none';
        if(opName) opName.innerText = ext || "ოპერატორი";
        if(navStatus) navStatus.style.background = 'var(--primary)';
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
        if(fStats) fStats.style.display = 'none';
        if(footerContainer) footerContainer.style.justifyContent = 'center';
    } else {
        document.body.classList.add('role-operator');
        if(fStats) fStats.style.display = 'flex';
        if(footerContainer) footerContainer.style.justifyContent = 'space-between';
    }
}

function startSipLogin() {
    const wssEl = document.getElementById('sipWss');
    const extEl = document.getElementById('sipExt');
    const passEl = document.getElementById('sipPass');
    const rememberMeEl = document.getElementById('rememberMe');
    
    if(!wssEl || !extEl || !passEl) return;
    
    const wss = wssEl.value;
    const ext = extEl.value;
    const pass = passEl.value;
    const rememberMe = rememberMeEl ? rememberMeEl.checked : false;

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
        
        const overlay = document.getElementById('loginOverlay');
        const opName = document.getElementById('displayOpName');
        if(overlay) overlay.style.display = 'none';
        if(opName) opName.innerText = ext;
        showToast('სისტემაში შესვლა წარმატებულია', 'success');
        resetInactivityTimer();
        updateFooterStats();
    }
}

window.switchMainView = function(viewType, element) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    if (element) {
        element.classList.add('active');
    } else if (typeof event !== 'undefined' && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    const workspaceCore = document.querySelector('.workspace-core');
    const statsWidget = document.getElementById('widget-stats');
    const teamWidget = document.getElementById('widget-team');

    if (workspaceCore) workspaceCore.style.display = 'none';
    if (statsWidget) statsWidget.style.display = 'none';
    if (teamWidget) teamWidget.style.display = 'none';

    if (viewType === 'phone') {
        if (workspaceCore) workspaceCore.style.display = 'flex';
    } 
    else if (viewType === 'stats') {
        if (statsWidget) {
            statsWidget.style.display = 'block';
            setTimeout(renderAdminCharts, 100); 
        }
    } 
    else if (viewType === 'team') {
        if (teamWidget) teamWidget.style.display = 'block';
    }
};

// ==========================================
// ფილტრაციის და ექსპორტის ლოგიკა
// ==========================================
window.handlePresetFilter = function() {
    const val = document.getElementById('filterPreset').value;
    const startEl = document.getElementById('filterStartDate');
    const endEl = document.getElementById('filterEndDate');
    
    const todayObj = new Date();
    // ვითვალისწინებთ ლოკალურ დროის სარტყელს სწორი თარიღისთვის
    const tzOffset = todayObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(todayObj - tzOffset)).toISOString().slice(0, 10);
    
    let start = '';
    let end = localISOTime;

    if (val === 'today') {
        start = end;
    } else if (val === 'week') {
        const w = new Date(todayObj); w.setDate(todayObj.getDate() - 7);
        start = (new Date(w - tzOffset)).toISOString().slice(0, 10);
    } else if (val === 'month') {
        const m = new Date(todayObj); m.setDate(todayObj.getDate() - 30);
        start = (new Date(m - tzOffset)).toISOString().slice(0, 10);
    }

    if(startEl) startEl.value = start;
    if(endEl) endEl.value = end;
    
    if(val === 'all') {
        if(startEl) startEl.value = '';
        if(endEl) endEl.value = '';
    }

    applyFilters();
};

window.handleDateFilter = function() {
    const presetEl = document.getElementById('filterPreset');
    if(presetEl) presetEl.value = 'all'; // ვხსნით პრისეტს თუ ხელით აირჩია
    applyFilters();
};

function applyFilters() {
    const start = document.getElementById('filterStartDate')?.value;
    const end = document.getElementById('filterEndDate')?.value;

    if (!start && !end) {
        filteredCalls = [...callRegistry];
    } else {
        filteredCalls = callRegistry.filter(c => {
            const cDate = c.date; // ვიყენებთ ბაზის თარიღს
            if (start && end) return cDate >= start && cDate <= end;
            if (start) return cDate >= start;
            if (end) return cDate <= end;
            return true;
        });
    }
    renderAdminCharts(); // ვაახლებთ ჩარტებს გაფილტრული მონაცემებით
}

window.exportToCSV = function() {
    if (filteredCalls.length === 0) {
        showToast('საექსპორტო მონაცემები არ არის', 'error');
        return;
    }

    const headers = ['ID', 'თარიღი', 'დრო', 'მიმართულება', 'აბონენტი', 'ნომერი', 'ხანგრძლივობა', 'კატეგორია', 'კომენტარი'];
    const csvRows = [headers.join(',')];

    filteredCalls.forEach(c => {
        const row = [
            c.id,
            c.date || '',
            c.time || '',
            c.type === 'in' ? 'შემომავალი' : 'გამავალი',
            `"${c.name || ''}"`, // ბრჭყალებში ვსვამთ რომ მძიმემ არ აურიოს ექსელში
            `"${c.number || ''}"`,
            c.duration || '',
            `"${c.category || ''}"`,
            `"${c.comment ? c.comment.replace(/"/g, '""') : ''}"`
        ];
        csvRows.push(row.join(','));
    });

    // \uFEFF არის BOM (Byte Order Mark), რომელიც ეხმარება Excel-ს ქართული ასოების (UTF-8) სწორად წაკითხვაში
    const csvString = "\uFEFF" + csvRows.join('\n'); 
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emis_calls_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// ==========================================
// განახლებული ჩარტების რენდერი (გაფილტრული)
// ==========================================
window.renderAdminCharts = function() {
    Object.keys(chartInstances).forEach(key => {
        if(chartInstances[key]) chartInstances[key].destroy();
    });

    const commonOptions = { responsive: true, maintainAspectRatio: false };

    // 1. ჯამური სტატისტიკა ფილტრის მიხედვით
    const totalCalls = filteredCalls.length;
    const incoming = filteredCalls.filter(c => c.type === 'in').length;
    const outgoing = filteredCalls.filter(c => c.type === 'out').length;
    
    const statTotalEl = document.getElementById('statTotal');
    const statInEl = document.getElementById('statIn');
    const statOutEl = document.getElementById('statOut');
    
    if (statTotalEl) statTotalEl.innerText = totalCalls;
    if (statInEl) statInEl.innerText = incoming;
    if (statOutEl) statOutEl.innerText = outgoing;

    // 2. ზარების დინამიკა
    const hourlyData = {};
    filteredCalls.forEach(c => {
        if(c.time) {
            const hour = c.time.split(':')[0] + ':00';
            hourlyData[hour] = (hourlyData[hour] || 0) + 1;
        }
    });
    
    const sortedHours = Object.keys(hourlyData).sort();
    const trendValues = sortedHours.map(h => hourlyData[h]);

    const ctxTrend = document.getElementById('chartTrend');
    if(ctxTrend) {
        chartInstances.trend = new Chart(ctxTrend, {
            type: 'line',
            data: { 
                labels: sortedHours.length ? sortedHours : ['00:00'], 
                datasets: [{ 
                    label: 'ზარები', 
                    data: trendValues.length ? trendValues : [0], 
                    borderColor: '#00C48C', backgroundColor: 'rgba(0, 196, 140, 0.1)', tension: 0.4, fill: true 
                }] 
            },
            options: { ...commonOptions, plugins: { legend: { display: false } } }
        });
    }

    // 3. კატეგორიები
    const catData = {};
    filteredCalls.forEach(c => {
        const cat = c.category || 'კატეგორიის გარეშე';
        catData[cat] = (catData[cat] || 0) + 1;
    });

    const ctxCat = document.getElementById('chartCategory');
    if(ctxCat) {
        chartInstances.category = new Chart(ctxCat, {
            type: 'bar',
            data: { 
                labels: Object.keys(catData).length ? Object.keys(catData) : ['ცარიელი'], 
                datasets: [{ 
                    label: 'რაოდენობა', 
                    data: Object.values(catData).length ? Object.values(catData) : [0], 
                    backgroundColor: '#4A90E2', borderRadius: 6 
                }] 
            },
            options: { ...commonOptions, plugins: { legend: { display: false } } }
        });
    }

    // 4. ტეგები
    const tagsCount = {};
    filteredCalls.forEach(c => {
        if(c.tags && c.tags.length > 0) {
            c.tags.forEach(t => { tagsCount[t] = (tagsCount[t] || 0) + 1; });
        } else {
            tagsCount['ტეგის გარეშე'] = (tagsCount['ტეგის გარეშე'] || 0) + 1;
        }
    });

    const tagLabels = Object.keys(tagsCount);
    const tagColors = tagLabels.map(t => {
        if (t === 'ტეგის გარეშე') return '#E2E8F0';
        const found = tagData.find(td => td.name === t);
        return found ? found.color : '#F5A623'; 
    });

    const ctxTags = document.getElementById('chartTags');
    if(ctxTags) {
        chartInstances.tags = new Chart(ctxTags, {
            type: 'doughnut',
            data: { 
                labels: tagLabels.length ? tagLabels : ['ცარიელი'], 
                datasets: [{ 
                    data: Object.values(tagsCount).length ? Object.values(tagsCount) : [1], 
                    backgroundColor: tagColors.length ? tagColors : ['#E2E8F0'], borderWidth: 0 
                }] 
            },
            options: { ...commonOptions, cutout: '70%', plugins: { legend: { position: 'right' } } }
        });
    }
};

function setWidgetView(viewId) {
    document.querySelectorAll('.widget-view').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(viewId);
    if(target) target.classList.add('active');
}

document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
    const key = e.key;
    if (/^[0-9*#]$/.test(key)) addNum(key);
    else if (key === 'Backspace') clearNum();
    else if (key === 'Enter' && currentDialNumber.length > 2) manualDial();
});

function handleWrapupEnter(event) { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') saveRecord(); }
function addNum(n) { currentDialNumber += n; const d = document.getElementById('dialInput'); if(d) d.innerText = currentDialNumber; }
function clearNum() { currentDialNumber = currentDialNumber.slice(0, -1); const d = document.getElementById('dialInput'); if(d) d.innerText = currentDialNumber; }

function getAvatarUrl(name) {
    if(name === 'უცნობი ნომერი') return '';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
}

function identifyCaller(number) {
    const cleanNumber = number.replace(/\s/g, '');
    const client = clientsData.find(c => c.number.replace(/\s/g, '') === cleanNumber);
    return client ? client.name : 'უცნობი ნომერი';
}

window.simulateCall = function(type) {
    const statusEl = document.getElementById('opStatus');
    const status = statusEl ? statusEl.value : 'online';
    
    if(status === 'wrapup') {
        if(type === 'internal') showToast('შიდა ზარი: ნინო ბერიძე (101)', 'info');
        else showToast('ახალი ზარი დაიბლოკა. თქვენ იმყოფებით ACW სტატუსში.', 'error');
        return;
    }

    if(type === 'internal') {
        startCall('ნინო ბერიძე', '101', true, getAvatarUrl('ნინო ბერიძე'));
    } else {
        const n = '599 12 34 56'; 
        const name = identifyCaller(n); 
        startCall(name, n, true, getAvatarUrl(name));
    }
};

function manualDial() { 
    if(currentDialNumber.length > 2) {
        const name = identifyCaller(currentDialNumber);
        startCall(name, currentDialNumber, false, getAvatarUrl(name));
    }
}

function toggleQuickTag(tag, element) {
    if(currentActiveTags.includes(tag)) {
        currentActiveTags = currentActiveTags.filter(t => t !== tag);
        element.style.opacity = "0.6";
        element.style.borderStyle = "dashed";
    } else {
        currentActiveTags.push(tag);
        element.style.opacity = "1";
        element.style.borderStyle = "solid";
    }
    const tagCont = document.getElementById('wrapTagsContainer');
    if(tagCont) tagCont.innerHTML = currentActiveTags.map(t => `<span class="tag-pill active" style="background:var(--primary); color:white; border:none;">${t}</span>`).join('');
}

function startCall(name, number, isIncoming, avatarUrl = '') {
    currentActiveTags = [];
    currentDialNumber = '';
    const dInput = document.getElementById('dialInput'); if(dInput) dInput.innerText = '';
    const acw = document.getElementById('acwOverlay'); if(acw) acw.style.display = 'none'; 
    
    if (typeof renderAvailableTagsForCall === 'function') renderAvailableTagsForCall();
    if (typeof renderAvailableCategoriesForCall === 'function') renderAvailableCategoriesForCall();

    const opStatusSelect = document.getElementById('opStatus');
    if(opStatusSelect) { opStatusSelect.value = 'online'; changeStatus(opStatusSelect); }

    activeCall = { id: Date.now(), name: name, number: number, type: isIncoming ? 'in' : 'out', duration: '00:00', avatar: avatarUrl };
    
    const callNameEl = document.getElementById('callName'); if(callNameEl) callNameEl.innerText = name; 
    const callNumberEl = document.getElementById('callNumber'); if(callNumberEl) callNumberEl.innerText = number;
    const callDirEl = document.getElementById('callDirectionText'); if(callDirEl) callDirEl.innerText = isIncoming ? 'შემომავალი ზარი' : 'გამავალი ზარი';
    const callStatusMainEl = document.getElementById('callStatus'); if(callStatusMainEl) callStatusMainEl.innerText = 'რეკავს...';
    
    const avatarImg = document.getElementById('callAvatarImg');
    const avatarPlaceholder = document.getElementById('callAvatarPlaceholder');
    if (avatarImg && avatarPlaceholder) {
        if(avatarUrl) {
            avatarImg.src = avatarUrl; avatarImg.style.display = 'block'; avatarPlaceholder.style.display = 'none';
        } else {
            avatarImg.style.display = 'none'; avatarPlaceholder.style.display = 'block';
        }
    }

    const wrapNameEl = document.getElementById('wrapName');
    if(wrapNameEl) {
        if (name === 'უცნობი ნომერი') {
            wrapNameEl.innerHTML = `<input type="text" id="newCallerNameInput" placeholder="შეიყვანეთ სახელი..." style="padding: 6px; border: 1px solid var(--border); border-radius: 4px; width: 100%; font-size: 14px; margin-top: 5px;">`;
        } else {
            wrapNameEl.innerText = name;
        }
    }

    const wrapNumEl = document.getElementById('wrapNumber'); if(wrapNumEl) wrapNumEl.innerText = number;
    const wrapDurEl = document.getElementById('wrapDuration'); if(wrapDurEl) wrapDurEl.innerHTML = '<span style="animation: pulseGreen 2s infinite;">მიმდინარეობს...</span>';
    
    const pastCalls = callRegistry.filter(c => c.number.replace(/\s/g, '') === number.replace(/\s/g, ''));
    const wrapHist = document.getElementById('wrapupHistoryBlock');
    
    if(wrapHist) {
        if(pastCalls.length > 0) {
            wrapHist.style.display = 'block';
            let items = pastCalls.slice(0, 3).map(p => `
                <div class="hist-item">
                    <h5><span><i class="ph-bold ph-calendar-blank" style="color:var(--primary);"></i> ${p.date || ''} ${p.time}</span> <span style="font-size: 11px; color: var(--text-muted); font-weight:500;">${p.category}</span></h5>
                    <p>${p.comment || 'კომენტარის გარეშე'}</p>
                </div>
            `).join('');
            wrapHist.innerHTML = `<h4 style="font-size: 14px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;"><i class="ph-bold ph-history"></i> წინა ზარების ისტორია</h4>${items}`;
        } else { 
            wrapHist.style.display = 'none'; 
        }
    }
    
    const c360 = document.getElementById('customer360Panel'); if(c360) c360.classList.add('open');
    const wPhone = document.getElementById('widget-phone'); if(wPhone) wPhone.style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navPhone = document.querySelector('.nav-item[title="ტელეფონი"]'); if(navPhone) navPhone.classList.add('active');
    setWidgetView('view-call');
    
    callTimer = 0; clearInterval(timerInterval);
    setTimeout(() => {
        const callStatusEl = document.getElementById('callStatus');
        const callAvatarIcon = document.getElementById('callAvatarIcon');
        if(callStatusEl) callStatusEl.innerText = '00:00';
        if(callAvatarIcon) callAvatarIcon.classList.remove('pulse'); 
        
        timerInterval = setInterval(() => {
            callTimer++;
            let m = String(Math.floor(callTimer/60)).padStart(2,'0'); let s = String(callTimer%60).padStart(2,'0');
            if (activeCall) activeCall.duration = `${m}:${s}`;
            const statusEl = document.getElementById('callStatus');
            const wrapEl = document.getElementById('wrapDuration');
            if (statusEl) statusEl.innerText = `${m}:${s}`;
            if (wrapEl) wrapEl.innerText = `${m}:${s} წთ`;
        }, 1000);
    }, isIncoming ? 1500 : 1000);
}

function endCallAndWrapup() {
    clearInterval(timerInterval);
    const opStatusSelect = document.getElementById('opStatus');
    if(opStatusSelect) { opStatusSelect.value = 'wrapup'; changeStatus(opStatusSelect); }
    const acw = document.getElementById('acwOverlay'); if(acw) acw.style.display = 'flex'; 
    if(activeCall) {
        const wrapDur = document.getElementById('wrapDuration');
        if(wrapDur) wrapDur.innerText = activeCall.duration + ' წთ';
    }
}

function toggleInCallKeypad() {
    const keypad = document.getElementById('inCallKeypadOverlay');
    const btnIcon = document.getElementById('keypadBtnIcon');
    if(!keypad || !btnIcon) return;
    const btn = btnIcon.parentElement;
    if(keypad.style.display === 'none') { keypad.style.display = 'block'; btn.classList.add('active');
    } else { keypad.style.display = 'none'; btn.classList.remove('active'); }
}

function sendDTMF(key) { showToast(`DTMF ტონი გაიგზავნა: ${key}`, 'info'); }

function saveRecord() {
    const catEl = document.getElementById('wrapCategory');
    const commentEl = document.getElementById('wrapComment');
    
    const cat = catEl ? catEl.value : '';
    const comment = commentEl ? commentEl.value : '';
    
    const nameInputObj = document.getElementById('newCallerNameInput');
    const wrapNameEl = document.getElementById('wrapName');
    const wrapNameText = nameInputObj ? nameInputObj.value.trim() : (wrapNameEl ? wrapNameEl.innerText : '');
    
    if(!cat) { showToast('გთხოვთ აირჩიოთ კატეგორია', 'error'); return; }
    
    const finalName = (wrapNameText && wrapNameText !== 'უცნობი ნომერი') ? wrapNameText : (activeCall ? activeCall.name : 'უცნობი');
    
    // თარიღის დაგენერირება ლოკალურ დროში (YYYY-MM-DD)
    const todayObj = new Date();
    const tzOffset = todayObj.getTimezoneOffset() * 60000;
    const localDate = (new Date(todayObj - tzOffset)).toISOString().slice(0, 10);

    const newCallData = {
        type: activeCall ? activeCall.type : 'in',
        name: finalName,
        number: activeCall ? activeCall.number : '',
        duration: activeCall ? activeCall.duration : '00:00',
        date: localDate, // 📌 ახალი პარამეტრი ფილტრაციისთვის
        time: new Date().toLocaleTimeString('ka-GE', {hour: '2-digit', minute:'2-digit'}),
        category: cat,
        comment: comment,
        fav: document.getElementById('wrapFavorite') && document.getElementById('wrapFavorite').checked ? 1 : 0,
        tags: currentActiveTags
    };

    fetch('http://localhost:3000/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCallData)
    })
    .then(res => res.json())
    .then(() => {
        fetchCallsData();
        
        if (finalName !== 'უცნობი ნომერი' && finalName !== 'უცნობი' && activeCall && activeCall.number) {
            fetch('http://localhost:3000/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: finalName, number: activeCall.number })
            }).then(() => fetchClientsData());
        }

        if(catEl) catEl.value = ''; 
        if(commentEl) commentEl.value = ''; 
        const favEl = document.getElementById('wrapFavorite');
        if(favEl) favEl.checked = false;
        
        currentActiveTags = []; activeCall = null;
        
        const c360 = document.getElementById('customer360Panel'); if(c360) c360.classList.remove('open');
        const acw = document.getElementById('acwOverlay'); if(acw) acw.style.display = 'none';
        
        const opStatusSelect = document.getElementById('opStatus');
        if(opStatusSelect) { opStatusSelect.value = 'online'; changeStatus(opStatusSelect); }
        
        setWidgetView('view-dialpad');
        showToast('შენახულია', 'success');
    })
    .catch(err => {
        console.error('შენახვის შეცდომა:', err);
        showToast('შენახვა ვერ მოხერხდა', 'error');
    });
}

function updateFooterStats() {
    if(currentUserRole === 'operator') {
        const ins = callRegistry.filter(c => c.type === 'in').length;
        const outs = callRegistry.filter(c => c.type === 'out').length;
        const fsIn = document.getElementById('fsIn');
        const fsOut = document.getElementById('fsOut');
        if (fsIn) fsIn.innerText = ins;
        if (fsOut) fsOut.innerText = outs;
    }
}

function switchTab(tabName, element) {
    currentTab = tabName;
    visibleCallsCount = 10; // 📌 ეს ხაზი ჩაამატე
    document.querySelectorAll('.htab').forEach(t => t.classList.remove('active')); 
    if(element) element.classList.add('active');
    renderRegistry();
}

window.renderRegistry = function() {
    const list = document.getElementById('registryList');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (!list) return;

    // 1. გამოვიანგარიშოთ "გუშინწინდელი" თარიღი
    const today = new Date();
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);
    const twoDaysAgoStr = (new Date(twoDaysAgo - (twoDaysAgo.getTimezoneOffset() * 60000))).toISOString().split('T')[0];

    // 2. გავფილტროთ ზარები: ბოლო 2 დღე + (თუ ფავორიტების ტაბზე ვართ)
    let data = callRegistry.filter(c => {
        const isRecent = (c.date || '') >= twoDaysAgoStr;
        const isFav = currentTab === 'favorites' ? c.fav : true;
        return isRecent && isFav;
    });

    // 3. ამოვჭრათ მხოლოდ იმდენი, რამდენიც უნდა ჩანდეს (visibleCallsCount)
    const displayData = data.slice(0, visibleCallsCount);
    
    // 4. დავხატოთ სია
    list.innerHTML = displayData.map(call => {
        let avatarHtml = call.avatar ? `<img src="${call.avatar}" class="h-avatar">` : `<div class="h-icon ${call.type}"><i class="ph-bold ${call.type === 'in' ? 'ph-arrow-down-left' : 'ph-arrow-up-right'}"></i></div>`;
        let tagHtml = call.tags && call.tags.length > 0 ? `<div style="display:inline-block; margin-left:6px; font-size:9px; background:#F0F2F5; padding:2px 6px; border-radius:8px;">${call.tags[0]}</div>` : '';
        return `
        <li onclick="showCallDetails(${call.id})">
            <div class="h-info">${avatarHtml}<div class="h-text"><strong>${call.name} ${call.fav ? '<i class="ph-fill ph-star" style="color: #F5A623"></i>' : ''}</strong><span>${call.category} ${tagHtml}</span></div></div>
            <div class="h-time"><span style="font-size: 10px; opacity:0.8;">${call.type === 'in' ? 'შემომავალი' : 'გამავალი'}</span><br>${call.time}</div>
        </li>`}).join('');

    // 5. ღილაკის ჩვენება/დამალვა
    if (loadMoreBtn) {
        if (data.length > visibleCallsCount) {
            loadMoreBtn.style.display = 'block';
            loadMoreBtn.innerHTML = `<i class="ph-bold ph-caret-circle-down"></i> კიდევ ${data.length - visibleCallsCount} ზარის ჩვენება`;
        } else {
            loadMoreBtn.style.display = 'none';
        }
    }
};

function showCallDetails(id) {
    const call = callRegistry.find(c => c.id === id);
    if(!call) return;
    const panel = document.getElementById('callDetailsSlide');
    const body = document.getElementById('slideBodyContent');
    if(!panel || !body) return;
    
    let avatarHtml = call.avatar ? `<img src="${call.avatar}" class="caller-avatar-large">` : `<div class="caller-avatar-large" style="display:flex;"><i class="ph-fill ph-user"></i></div>`;
    let tagHtml = call.tags ? call.tags.map(t => `<span class="tag-pill active" style="background:var(--primary); color:white; border:none;">${t}</span>`).join('') : '';

    body.innerHTML = `
        ${avatarHtml}<h3>${call.name}</h3><p>${call.number}</p>
        <div class="cp-tags" style="justify-content:center; margin-bottom: 24px;">${tagHtml}</div>
        <div class="slide-actions">
            <button class="btn-outline" onclick="startCall('${call.name}', '${call.number}', false, '${call.avatar}'); closeCallDetails();"><i class="ph-bold ph-phone"></i> დარეკვა</button>
        </div>
        <div class="slide-meta">
            <div><strong>მიმართულება</strong><span>${call.type === 'in' ? 'შემომავალი ზარი' : 'გამავალი ზარი'}</span></div>
            <div><strong>საუბრის დრო</strong><span>${call.date || ''} ${call.time} / ${call.duration} წთ</span></div>
            <div><strong>კატეგორია</strong><span>${call.category}</span></div>
            ${call.comment ? `<div><strong>კომენტარი</strong><span>${call.comment}</span></div>` : ''}
        </div>
    `;
    panel.classList.add('open');
}

function closeCallDetails() { 
    const panel = document.getElementById('callDetailsSlide');
    if(panel) panel.classList.remove('open'); 
}

function showToast(msg, type) {
    const t = document.getElementById('toastMsg'); 
    if(!t) return;
    const textEl = document.getElementById('toastText');
    const iconEl = document.getElementById('toastIcon');
    const actionBtn = document.getElementById('toastActionBtn');
    if(textEl) textEl.innerText = msg;
    if(iconEl) iconEl.className = type === 'success' ? 'ph-fill ph-check-circle toast-icon' : type === 'error' ? 'ph-fill ph-warning-circle toast-icon' : 'ph-fill ph-info toast-icon';
    if(actionBtn) actionBtn.style.display = 'none'; 
    t.className = `toast ${type}`; 
    t.style.display = 'flex';
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => {t.style.display = 'none'; t.style.opacity='1';}, 300); }, 3000);
}

function changeStatus(s) { 
    if(!s || !s.style) return; 
    s.className = 'status-select ' + s.value; 
    const dot = document.getElementById('navOpStatus');
    if(!dot) return;
    if(s.value === 'online') { s.style.color = 'var(--primary)'; dot.style.background = 'var(--primary)'; dot.style.boxShadow = '0 0 0 2px var(--primary)'; } 
    else if (s.value === 'wrapup') { s.style.color = '#F5A623'; dot.style.background = '#F5A623'; dot.style.boxShadow = '0 0 0 2px #F5A623'; } 
    else { s.style.color = '#8A94A6'; dot.style.background = '#8A94A6'; dot.style.boxShadow = '0 0 0 2px #8A94A6'; }
}

window.handleSearch = function() {
    const searchInput = document.getElementById('topSearchInput');
    if(!searchInput) return;

    const query = searchInput.value.toLowerCase();
    let resultsContainer = document.getElementById('topSearchResults'); 
    
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'topSearchResults';
        resultsContainer.style.position = 'absolute';
        resultsContainer.style.top = '100%'; 
        resultsContainer.style.left = '0';
        resultsContainer.style.width = '100%';
        resultsContainer.style.background = 'white';
        resultsContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        resultsContainer.style.borderRadius = '8px';
        resultsContainer.style.zIndex = '1000';
        resultsContainer.style.maxHeight = '300px';
        resultsContainer.style.overflowY = 'auto';
        
        const parent = searchInput.parentElement;
        if(parent) {
            parent.style.position = 'relative';
            parent.appendChild(resultsContainer);
        }
    }

    if (query.length < 2) {
        resultsContainer.style.display = 'none';
        return;
    }

    const results = clientsData.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.number.replace(/\s/g, '').includes(query.replace(/\s/g, ''))
    );

    if (results.length > 0) {
        resultsContainer.innerHTML = results.map(c => `
            <div style="padding: 10px 15px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="startCall('${c.name}', '${c.number}', false); document.getElementById('topSearchResults').style.display='none'; document.getElementById('topSearchInput').value='';">
                <strong style="color: var(--text-main); font-size: 14px;">${c.name}</strong> 
                <span style="color: var(--text-muted); font-size: 13px;"><i class="ph-fill ph-phone" style="color:var(--primary);"></i> ${c.number}</span>
            </div>
        `).join('');
        resultsContainer.style.display = 'block';
    } else {
        resultsContainer.innerHTML = '<div style="padding: 15px; color: var(--text-muted); text-align: center; font-size: 13px;">შედეგი ვერ მოიძებნა</div>';
        resultsContainer.style.display = 'block';
    }
};

window.handleLoginEnter = handleLoginEnter; window.handleWrapupEnter = handleWrapupEnter; window.startSipLogin = startSipLogin; window.performLogout = performLogout; window.addNum = addNum; window.clearNum = clearNum; window.manualDial = manualDial; window.startCall = startCall; window.toggleQuickTag = toggleQuickTag; window.endCallAndWrapup = endCallAndWrapup; window.toggleInCallKeypad = toggleInCallKeypad; window.sendDTMF = sendDTMF; window.saveRecord = saveRecord; window.switchTab = switchTab; window.showCallDetails = showCallDetails; window.closeCallDetails = closeCallDetails; window.changeStatus = changeStatus; window.showToast = showToast;

async function fetchHotlinesData() {
    try {
        const res = await fetch('http://localhost:3000/api/hotlines'); 
        if (!res.ok) throw new Error();
        hotlineData = await res.json(); 
        
        const container = document.getElementById('hotlinesContainer');
        if(container) {
            container.innerHTML = hotlineData.map(h => `<div class="hl-item"><span>${h.name}:</span><strong>${h.number}</strong></div>`).join('');
        }
        if (typeof renderAdminHotlines === 'function') renderAdminHotlines();
    } catch (error) { console.error('ცხელი ხაზების წამოღება ვერ მოხერხდა', error); }
}

async function fetchCallsData() {
    try {
        const res = await fetch('http://localhost:3000/api/calls');
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        // 📌 თუ ძველ ზარებს თარიღი არ აქვთ, ვანიჭებთ დღევანდელს
        const todayStr = new Date().toISOString().split('T')[0];
        
        callRegistry = data.map(call => ({ 
            ...call, 
            fav: call.fav === 1, 
            tags: call.tags ? JSON.parse(call.tags) : [],
            date: call.date || todayStr 
        }));
        
        filteredCalls = [...callRegistry]; // დეფოლტად ყველა ჩანს
        
        renderRegistry();
        updateFooterStats();
        if (typeof renderAdminCharts === 'function') renderAdminCharts();
    } catch (error) { console.error('ზარების წამოღება ვერ მოხერხდა', error); }
}

async function fetchOperatorsData() {
    try {
        const res = await fetch('http://localhost:3000/api/operators'); 
        if (!res.ok) throw new Error();
        operatorData = await res.json(); 
        if (typeof renderAdminOperators === 'function') renderAdminOperators();
    } catch (error) { console.error('ოპერატორების წამოღება ვერ მოხერხდა', error); }
}

async function fetchCategoriesData() {
    try {
        const res = await fetch('http://localhost:3000/api/categories');
        if (!res.ok) throw new Error();
        categoryData = await res.json();
        if (typeof renderAdminCategories === 'function') renderAdminCategories();
        window.renderAvailableCategoriesForCall(); 
    } catch (e) { console.error('კატეგორიების წამოღება ვერ მოხერხდა', e); }
}

async function fetchTagsData() {
    try {
        const res = await fetch('http://localhost:3000/api/tags');
        if (!res.ok) throw new Error();
        tagData = await res.json();
        if (typeof renderAdminTags === 'function') renderAdminTags();
        window.renderAvailableTagsForCall(); 
    } catch (e) { console.error('ტეგების წამოღება ვერ მოხერხდა', e); }
}

async function fetchClientsData() {
    try {
        const res = await fetch('http://localhost:3000/api/clients');
        if (!res.ok) throw new Error();
        clientsData = await res.json();
    } catch (e) { console.error('კლიენტების წამოღება ვერ მოხერხდა', e); }
}

window.addNewHotline = async function() {
    const nameEl = document.getElementById('newHotlineName');
    const numEl = document.getElementById('newHotlineNumber');
    const name = nameEl ? nameEl.value : '';
    const number = numEl ? numEl.value : '';
    if(!name || !number) { showToast('შეავსეთ ველები', 'error'); return; }
    try {
        const res = await fetch('http://localhost:3000/api/hotlines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, number }) });
        if(res.ok) { showToast('დაემატა', 'success'); if(nameEl) nameEl.value = ''; if(numEl) numEl.value = ''; fetchHotlinesData(); }
    } catch (err) { showToast('შეცდომა', 'error'); }
};

window.deleteHotline = async function(id) {
    if(!confirm('წავშალოთ?')) return;
    try {
        const res = await fetch(`http://localhost:3000/api/hotlines/${id}`, { method: 'DELETE' });
        if(res.ok) { showToast('წაიშალა', 'success'); fetchHotlinesData(); }
    } catch (err) { showToast('შეცდომა', 'error'); }
};

window.renderAdminHotlines = function() {
    const cont = document.getElementById('adminHotlinesList');
    if(!cont) return;
    if(hotlineData.length === 0) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">ცარიელია</p>'; return; }
    cont.innerHTML = hotlineData.map(h => `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border);"><div><strong>${h.name}</strong> <span style="font-size:12px;">${h.number}</span></div><button onclick="deleteHotline(${h.id})" class="btn-outline" style="color:#FF6B6B; border:none;"><i class="ph-bold ph-trash"></i></button></div>`).join('');
};

window.addNewOperator = async function() {
    const nameEl = document.getElementById('newOpName');
    const extEl = document.getElementById('newOpExt');
    const teamEl = document.getElementById('newOpTeam');
    const name = nameEl ? nameEl.value : '';
    const ext = extEl ? extEl.value : '';
    const team = teamEl ? teamEl.value : '';
    if(!name || !ext) { showToast('შეავსეთ ველები', 'error'); return; }
    try {
        const res = await fetch('http://localhost:3000/api/operators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ext, team }) });
        if(res.ok) { showToast('დაემატა', 'success'); if(nameEl) nameEl.value = ''; if(extEl) extEl.value = ''; fetchOperatorsData(); }
    } catch (err) { showToast('შეცდომა', 'error'); }
};

window.deleteOperator = async function(id) {
    if(!confirm('წავშალოთ?')) return;
    try {
        const res = await fetch(`http://localhost:3000/api/operators/${id}`, { method: 'DELETE' });
        if(res.ok) { showToast('წაიშალა', 'success'); fetchOperatorsData(); }
    } catch (err) { showToast('შეცდომა', 'error'); }
};

window.renderAdminOperators = function() {
    const cont = document.getElementById('adminOperatorsList');
    if(!cont) return;
    if(operatorData.length === 0) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">ცარიელია</p>'; return; }
    cont.innerHTML = operatorData.map(o => `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border);"><div><strong>${o.name}</strong> <span style="font-size:12px;">${o.ext} (${o.team})</span></div><button onclick="deleteOperator(${o.id})" class="btn-outline" style="color:#FF6B6B; border:none;"><i class="ph-bold ph-trash"></i></button></div>`).join('');
};

window.addNewCategory = async function() {
    const nameEl = document.getElementById('newCategoryName');
    const name = nameEl ? nameEl.value : '';
    if(!name) { showToast('შეავსეთ ველები', 'error'); return; }
    try {
        const res = await fetch('http://localhost:3000/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        if(res.ok) { showToast('დაემატა', 'success'); if(nameEl) nameEl.value = ''; fetchCategoriesData(); }
    } catch (e) { showToast('შეცდომა', 'error'); }
};

window.deleteCategory = async function(id) {
    if(!confirm('წავშალოთ?')) return;
    try {
        const res = await fetch(`http://localhost:3000/api/categories/${id}`, { method: 'DELETE' });
        if(res.ok) { showToast('წაიშალა', 'success'); fetchCategoriesData(); }
    } catch (e) { showToast('შეცდომა', 'error'); }
};

window.renderAdminCategories = function() {
    const cont = document.getElementById('adminCategoriesList');
    if(!cont) return;
    if(categoryData.length === 0) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">ცარიელია</p>'; return; }
    cont.innerHTML = categoryData.map(c => `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border);"><strong>${c.name}</strong><button onclick="deleteCategory(${c.id})" class="btn-outline" style="color:#FF6B6B; border:none;"><i class="ph-bold ph-trash"></i></button></div>`).join('');
};

window.renderAvailableCategoriesForCall = function() {
    const select = document.getElementById('wrapCategory');
    if(select) {
        select.innerHTML = '<option value="" disabled selected>აირჩიეთ კატეგორია</option>' + 
        categoryData.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }
};

window.addNewTag = async function() {
    const nameEl = document.getElementById('newTagName');
    const colorEl = document.getElementById('newTagColor');
    const name = nameEl ? nameEl.value : '';
    const color = colorEl ? colorEl.value : '';
    if(!name) { showToast('შეავსეთ ველები', 'error'); return; }
    try {
        const res = await fetch('http://localhost:3000/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }) });
        if(res.ok) { showToast('დაემატა', 'success'); if(nameEl) nameEl.value = ''; fetchTagsData(); }
    } catch (e) { showToast('შეცდომა', 'error'); }
};

window.deleteTag = async function(id) {
    if(!confirm('წავშალოთ?')) return;
    try {
        const res = await fetch(`http://localhost:3000/api/tags/${id}`, { method: 'DELETE' });
        if(res.ok) { showToast('წაიშალა', 'success'); fetchTagsData(); }
    } catch (e) { showToast('შეცდომა', 'error'); }
};

window.renderAdminTags = function() {
    const cont = document.getElementById('adminTagsList');
    if(!cont) return;
    if(tagData.length === 0) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">ცარიელია</p>'; return; }
    cont.innerHTML = tagData.map(t => `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border);"><span style="background:${t.color}20; color:${t.color}; padding:4px 10px; border-radius:12px; font-weight:bold; font-size:12px;">${t.name}</span><button onclick="deleteTag(${t.id})" class="btn-outline" style="color:#FF6B6B; border:none;"><i class="ph-bold ph-trash"></i></button></div>`).join('');
};

window.renderAvailableTagsForCall = function() {
    const wrapper = document.getElementById('availableTagsWrapper');
    if(!wrapper) return;
    wrapper.innerHTML = tagData.map(t => `
        <span class="tag-pill" onclick="toggleQuickTag('${t.name}', this)" style="border: 1px dashed ${t.color}; color: ${t.color}; cursor: pointer; opacity: 0.6; transition: all 0.2s;">
            ${t.name}
        </span>
    `).join('');
};

window.onload = () => {
    checkSavedCredentials();
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    
    const searchInput = document.getElementById('topSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        document.addEventListener('click', (e) => {
            const parent = searchInput.parentElement;
            if (parent && !parent.contains(e.target)) {
                const res = document.getElementById('topSearchResults');
                if (res) res.style.display = 'none';
            }
        });
    }

    fetchHotlinesData();
    fetchCallsData();
    fetchOperatorsData();
    fetchCategoriesData();
    fetchTagsData();
    fetchClientsData(); 
};
window.loadMoreCalls = function() {
    visibleCallsCount += 10; // ყოველ დაჭერაზე ვამატებთ 15-ს
    renderRegistry();
};