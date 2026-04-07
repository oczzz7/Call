const socket = io();
let currentExt = "";
let currentCaller = "";
let currentOperatorCalls = [];

// 📌 სესიის აღდგენა Refresh-ის დროს
document.addEventListener('DOMContentLoaded', () => {
    const savedSip = localStorage.getItem('userSip');
    if (savedSip) {
        // თუ მეხსიერებაშია, სერვერს ვთხოვთ ავტორიზაციას
        socket.emit('request_login', savedSip); 
    }
});

// 📌 Theme Toggle Logic
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const target = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
}
if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

// 📌 შესვლა სისტემაში (მხოლოდ მოთხოვნის გაგზავნა)
window.connectOperator = function() {
    const ext = document.getElementById('extInput').value.trim();
    if (!ext) return;
    socket.emit('request_login', ext);
};

// 📌 სერვერის პასუხი წარმატებულ ლოგინზე
socket.on('login_success', (ext) => {
    currentExt = ext;
    localStorage.setItem('userSip', currentExt); // ვინახავთ Refresh-ისთვის

    document.getElementById('loginBlock').style.display = 'none';
    document.getElementById('workspace').style.display = 'flex';
    document.getElementById('myExt').innerText = currentExt;
    
    loadDynamicOptions();
    loadOperatorHistory();
});

// 📌 სერვერის პასუხი შეცდომაზე
socket.on('login_error', (message) => {
    alert(message);
    localStorage.removeItem('userSip'); // ყოველი შემთხვევისთვის
});

// 📌 სისტემიდან გამოსვლა (შეგიძლია ღილაკზე მიაბა)
window.logoutOperator = function() {
    localStorage.removeItem('userSip');
    location.reload(); // ვარეფრეშებთ გვერდს, რაც ლოგინის ფანჯარაზე დაგვაბრუნებს
};

// 📌 1. ზარის შემოსვლა
socket.on('incoming_call', async (data) => {
    if (currentCaller && document.getElementById('activeCallMode').style.display === 'block') {
        saveCallRecord(false); 
    }

    currentCaller = data.caller_number;
    
    document.getElementById('standbyMode').style.display = 'none';
    document.getElementById('activeCallMode').style.display = 'block';
    
    document.getElementById('callModeLabel').innerText = "მიმდინარე ზარი";
    document.getElementById('callPulseIcon').style.display = "block";
    document.getElementById('callerNumberText').innerText = currentCaller;
    
    clearForm();

    if (data.call_id) {
        document.getElementById('currentEditId').value = data.call_id;
    }

    const nameInput = document.getElementById('clientNameInput');
    nameInput.disabled = true;
    try {
        const res = await fetch(`/api/client/${currentCaller}`);
        const client = await res.json();
        nameInput.disabled = false;
        if (client.name) {
            nameInput.value = client.name;
            nameInput.style.borderColor = '#4ade80';
        } else {
            nameInput.value = '';
            nameInput.style.borderColor = 'var(--border)';
        }
    } catch (e) { nameInput.disabled = false; nameInput.value = ''; }

    try {
        const lcRes = await fetch(`/api/last-call/${currentCaller}`);
        const lastCall = await lcRes.json();
        const banner = document.getElementById('lastCallInfoBanner');
        
        if (lastCall && lastCall.id !== data.call_id && lastCall.category !== 'დაუხარისხებელი') {
            document.getElementById('lcDate').innerText = `${lastCall.date} ${lastCall.time}`;
            document.getElementById('lcOp').innerText = `შიდა ნომერი: ${lastCall.operator_ext}`;
            document.getElementById('lcCat').innerText = `${lastCall.category} ${lastCall.tag ? ' (#'+lastCall.tag+')' : ''}`;
            document.getElementById('lcComment').innerText = `"${lastCall.comment || 'კომენტარის გარეშე'}"`;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    } catch (e) {
        if(document.getElementById('lastCallInfoBanner')) {
            document.getElementById('lastCallInfoBanner').style.display = 'none';
        }
    }
});

window.clearForm = function() {
    document.getElementById('currentEditId').value = ''; 
    document.getElementById('wrapCategory').value = '';
    document.getElementById('wrapComment').value = '';
    
    const statusSelect = document.getElementById('wrapTaskStatus');
    if(statusSelect.options.length > 0) statusSelect.selectedIndex = 0;
    
    document.getElementById('wrapPriority').value = 'ნორმალური';
    document.querySelectorAll('#priorityGroup .chip').forEach(el => el.classList.remove('active'));
    const normalChip = document.querySelector('#priorityGroup .chip.priority-normal');
    if(normalChip) normalChip.classList.add('active');

    document.getElementById('wrapTag').value = '';
    document.querySelectorAll('#tagGroup .chip').forEach(el => el.classList.remove('active'));

    const jiraBtn = document.getElementById('jiraBtn');
    if (jiraBtn) {
        jiraBtn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> Jira-ში გაგზავნა';
        jiraBtn.style.background = '#0052CC';
        jiraBtn.disabled = false;
        jiraBtn.style.cursor = 'pointer';
    }

    const banner = document.getElementById('lastCallInfoBanner');
    if (banner) banner.style.display = 'none';
};

// 📌 2. შენახვა
window.saveCallRecord = async function(closeAfter = true) {
    const category = document.getElementById('wrapCategory').value;
    const status = document.getElementById('wrapTaskStatus').value;
    
    if (closeAfter && status === 'დასრულებული' && !category) {
        alert("დასრულებისთვის აირჩიეთ კატეგორია! ან აირჩიეთ სტატუსი 'შესავსებია'.");
        return;
    }

    const payload = {
        id: document.getElementById('currentEditId').value || null,
        caller_number: currentCaller,
        client_name: document.getElementById('clientNameInput').value.trim(),
        operator_ext: currentExt,
        category: category,
        priority: document.getElementById('wrapPriority').value,
        tags: document.getElementById('wrapTag').value,
        comment: document.getElementById('wrapComment').value,
        task_status: status
    };

    try {
        const response = await fetch('/api/save-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.ok) {
            const data = await response.json();
            if (data.id) document.getElementById('currentEditId').value = data.id;

            if (closeAfter) cancelEdit();
            loadOperatorHistory();
        }
    } catch (error) { console.error(error); }
};

// 📌 3. ისტორია და ტასკების დაფა
window.loadOperatorHistory = async function() {
    if (!currentExt) return;
    try {
        const response = await fetch(`/api/operator-calls?ext=${currentExt}`);
        const calls = await response.json();
        currentOperatorCalls = calls; 

        const list = document.getElementById('operatorHistoryList');
        list.innerHTML = calls.map(c => {
            const catClass = c.category === 'დაუხარისხებელი' ? 'unclassified' : '';
            const tagHtml = c.tag ? `<span class="tag-badge"><i class="ph-bold ph-hash"></i> ${c.tag}</span>` : '';
            
            const isJiraSent = c.comment && c.comment.includes('[Jira ✓]');
            const jiraHtml = isJiraSent ? `<span class="jira-badge" title="გაგზავნილია Jira-ში"><i class="ph-bold ph-check-circle"></i> Jira</span>` : '';

            let statusColor = 'var(--text-muted)';
            let statusIcon = 'ph-info';
            
            if (c.task_status === 'დასრულებული') { statusColor = 'var(--success)'; statusIcon = 'ph-check-circle'; } 
            else if (c.task_status === 'შესავსებია') { statusColor = 'var(--warning)'; statusIcon = 'ph-warning-circle'; } 
            else if (c.task_status === 'გადასარეკი') { statusColor = 'var(--primary)'; statusIcon = 'ph-phone-call'; }

            return `
            <li class="history-item" style="border-left: 4px solid ${statusColor};" onclick="editTask(${c.id})">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                    <strong style="font-size: 14px; color: var(--text-main); margin:0;">
                        <i class="ph-bold ph-phone"></i> ${c.caller_number}
                    </strong>
                    <span style="color: ${statusColor}; font-size: 11px; font-weight: 700; display:flex; align-items:center; gap:4px; text-transform: uppercase;">
                        <i class="ph-bold ${statusIcon}"></i> ${c.task_status}
                    </span>
                </div>
                <div class="meta" style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <span style="font-size:11px; color:var(--text-muted);"><i class="ph-bold ph-clock"></i> ${c.time}</span>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; max-width: 70%;">
                        <span class="cat-badge ${catClass}">${c.category || 'ზოგადი'}</span>
                        ${tagHtml}
                        ${jiraHtml}
                    </div>
                </div>
            </li>`;
        }).join('');

        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('opTodayCalls').innerText = calls.filter(c => c.date === todayStr).length;
        
        const pendingCalls = calls.filter(c => c.task_status !== 'დასრულებული');
        document.getElementById('opPendingCalls').innerText = pendingCalls.length;
        
        const grid = document.getElementById('taskGrid');
        if (pendingCalls.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:40px; border: 2px dashed var(--border); border-radius: 16px;">დავალებები არ გაქვთ, ყველაფერი სუფთაა! ✨</div>';
        } else {
            grid.innerHTML = pendingCalls.map(c => {
                const isJiraSent = c.comment && c.comment.includes('[Jira ✓]');
                const jiraHtml = isJiraSent ? `<span class="jira-badge"><i class="ph-bold ph-check-circle"></i> Jira</span>` : '';

                return `
                <div class="task-card" onclick="editTask(${c.id})">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <div style="display:flex; gap: 6px;">
                            <span class="cat-badge unclassified">${c.task_status}</span>
                            ${jiraHtml}
                        </div>
                        <span style="font-size:12px; color:var(--text-muted);">${c.date} ${c.time}</span>
                    </div>
                    <strong style="display:block; font-size:18px; margin-bottom:5px; color:var(--text-main);">${c.caller_number}</strong>
                    <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px;">${c.category || 'დაუხარისხებელი'} ${c.tag ? `(#${c.tag})` : ''}</div>
                    <div style="font-size:13px; color:var(--text-main); background:var(--input-bg); padding:10px; border-radius:8px; border: 1px solid var(--border);">
                        ${c.comment || '<i>კომენტარი არ არის...</i>'}
                    </div>
                </div>`;
            }).join('');
        }
    } catch (e) { console.error(e); }
};

window.editTask = async function(id) {
    const call = currentOperatorCalls.find(c => c.id === id);
    if (!call) return;

    currentCaller = call.caller_number;
    
    document.getElementById('standbyMode').style.display = 'none';
    document.getElementById('activeCallMode').style.display = 'block';
    
    document.getElementById('callModeLabel').innerText = "დავალების რედაქტირება";
    document.getElementById('callPulseIcon').style.display = "none"; 
    document.getElementById('callerNumberText').innerText = currentCaller;
    
    document.getElementById('currentEditId').value = call.id;
    document.getElementById('wrapCategory').value = call.category === 'დაუხარისხებელი' ? '' : call.category;
    document.getElementById('wrapComment').value = call.comment || '';
    document.getElementById('wrapTaskStatus').value = call.task_status || 'დასრულებული';

    selectPriority(document.querySelector(`#priorityGroup .chip[onclick*="${call.priority || 'ნორმალური'}"]`), call.priority || 'ნორმალური');
    if(call.tag) selectTag(document.querySelector(`#tagGroup .chip[onclick*="${call.tag}"]`), call.tag);

    const jiraBtn = document.getElementById('jiraBtn');
    if (call.comment && call.comment.includes('[Jira ✓]')) {
        jiraBtn.innerHTML = '<i class="ph-bold ph-check"></i> გაგზავნილია';
        jiraBtn.style.background = '#10b981';
        jiraBtn.disabled = true;
        jiraBtn.style.cursor = 'not-allowed';
    } else {
        jiraBtn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> Jira-ში გაგზავნა';
        jiraBtn.style.background = '#0052CC';
        jiraBtn.disabled = false;
        jiraBtn.style.cursor = 'pointer';
    }
    
    const banner = document.getElementById('lastCallInfoBanner');
    if (banner) banner.style.display = 'none';

    try {
        const res = await fetch(`/api/client/${call.caller_number}`);
        const client = await res.json();
        document.getElementById('clientNameInput').value = client.name || '';
    } catch(e) {}
};

window.cancelEdit = function() {
    currentCaller = "";
    document.getElementById('activeCallMode').style.display = 'none';
    document.getElementById('standbyMode').style.display = 'flex';
};

// 📌 4. Jira-ს ინტეგრაცია
window.sendToJira = async function() {
    const btn = document.getElementById('jiraBtn');
    const commentBox = document.getElementById('wrapComment');
    
    if (!btn || btn.disabled) return; 

    if (commentBox.value.includes('[Jira ✓]')) {
        alert("ეს დავალება უკვე გაგზავნილია Jira-ში!");
        return;
    }

    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> იგზავნება...';
    btn.disabled = true;
    btn.style.cursor = 'wait';

    const payload = {
        caller: currentCaller,
        client: document.getElementById('clientNameInput').value.trim(),
        category: document.getElementById('wrapCategory').value || "ზოგადი",
        comment: document.getElementById('wrapComment').value.trim(),
        operator: currentExt
    };

    try {
        const res = await fetch('/api/jira/create', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(payload) 
        });
        
        if (res.ok) {
            btn.innerHTML = '<i class="ph-bold ph-check"></i> გაგზავნილია';
            btn.style.background = '#10b981'; 
            btn.style.cursor = 'not-allowed';
            
            if (!commentBox.value.includes('[Jira ✓]')) {
                commentBox.value = "[Jira ✓] \n" + commentBox.value; 
            }
            
            await saveCallRecord(false);

        } else {
            throw new Error("Server Error");
        }
    } catch (e) {
        console.error("Jira Error:", e);
        btn.innerHTML = '<i class="ph-bold ph-warning"></i> შეცდომა';
        btn.style.background = '#ef4444';
        
        setTimeout(() => { 
            btn.innerHTML = originalText; 
            btn.style.background = '#0052CC'; 
            btn.disabled = false; 
            btn.style.cursor = 'pointer';
        }, 3000);
    }
}

// Chips Logic
window.selectPriority = function(el, val) { if(!el) return; document.querySelectorAll('#priorityGroup .chip').forEach(e => e.classList.remove('active')); el.classList.add('active'); document.getElementById('wrapPriority').value = val; };
window.selectTag = function(el, val) { if(!el) return; if (el.classList.contains('active')) { el.classList.remove('active'); document.getElementById('wrapTag').value = ''; } else { document.querySelectorAll('#tagGroup .chip').forEach(e => e.classList.remove('active')); el.classList.add('active'); document.getElementById('wrapTag').value = val; } };

window.loadDynamicOptions = async function() {
    if (!currentExt) return;
    try {
        const catRes = await fetch(`/api/categories?ext=${currentExt}`);
        const tagRes = await fetch('/api/tags');
        const statusRes = await fetch('/api/statuses');
        
        const categories = await catRes.json();
        const tags = await tagRes.json();
        const statuses = await statusRes.json();

        document.getElementById('wrapCategory').innerHTML = '<option value="" disabled selected>აირჩიეთ კატეგორია</option>' + categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        document.getElementById('tagGroup').innerHTML = tags.map(t => `<div class="chip tag-chip" onclick="selectTag(this, '${t.name}')">${t.name}</div>`).join('');
        document.getElementById('wrapTaskStatus').innerHTML = statuses.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    } catch (e) {}
}

socket.on('settings_updated', loadDynamicOptions);