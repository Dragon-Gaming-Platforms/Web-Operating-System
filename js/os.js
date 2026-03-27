let topZ = 100;
let installedApps = JSON.parse(localStorage.getItem('installedApps') || '[]');
let appRegistry = JSON.parse(localStorage.getItem('dynamicAppRegistry') || '[]');
window.browserEngines = JSON.parse(localStorage.getItem('browserEngines') || '[]'); 
let openWindows = []; 
const pinnedApps = ['file-explorer', 'browser', 'settings', 'updates', 'task-manager']; 
const ADMINS = ["jkhyer@bluevalleyk12.net", "jaxonkhyer@gmail.com"];
let volumeLevel = 100;

document.addEventListener('contextmenu', e => { e.preventDefault(); hideContextMenu(); });
document.addEventListener('click', (e) => {
    hideContextMenu();
    document.getElementById('action-center').classList.add('hidden');
    if(e.target.id === 'desktop') document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected'));
});

// --------------------------------------------------------
// GLOBAL AUTH SYSTEM (Single Sign-On)
// --------------------------------------------------------
let isLoginMode = true;

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Welcome Back" : "Create Account";
    document.getElementById('auth-btn').innerText = isLoginMode ? "Unlock" : "Sign Up";
    document.getElementById('auth-toggle').innerText = isLoginMode ? "Need an account? Sign up here" : "Already have an account? Login here";
    document.getElementById('login-error').style.display = 'none';
}

function showAuthError(msg) {
    const err = document.getElementById('login-error');
    err.innerText = msg;
    err.style.display = 'block';
}

async function checkAuth() {
    const email = localStorage.getItem('os_email');
    const pass = localStorage.getItem('os_password');
    const url = localStorage.getItem('chat_backend_url'); // Shared with Chat app
    
    if(url) document.getElementById('backend-url').value = url;

    if(email && pass && url) {
        try {
            const res = await fetch(url, {
                 method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify({action:'login', email:email, password:pass})
            });
            const data = await res.json();
            if(data.success) {
                unlockOS(email);
            } else {
                localStorage.removeItem('os_password');
                document.getElementById('lock-screen').classList.remove('hidden');
            }
        } catch (e) {
            // If offline or network error, let them in based on local cache
            unlockOS(email);
        }
    } else {
        document.getElementById('lock-screen').classList.remove('hidden');
    }
}

async function submitAuth() {
    const url = document.getElementById('backend-url').value.trim();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const btn = document.getElementById('auth-btn');
    
    if(!url || !email || !pass) return showAuthError("Please fill out all fields.");
    
    btn.innerText = "Connecting...";
    document.getElementById('login-error').style.display = 'none';

    try {
        const payload = { action: isLoginMode ? 'login' : 'register', email: email, password: pass };
        const res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify(payload) });
        const data = await res.json();
        
        if(data.success) {
            // Save universally for OS and Apps
            localStorage.setItem('chat_backend_url', url);
            localStorage.setItem('os_email', email);
            localStorage.setItem('os_password', pass);
            // Sync with Messages App credentials
            localStorage.setItem('chat_email', email);
            localStorage.setItem('chat_password', pass);
            
            unlockOS(email);
        } else {
            showAuthError(data.error || "Authentication Failed");
            btn.innerText = isLoginMode ? "Unlock" : "Sign Up";
        }
    } catch(e) {
        showAuthError("Connection Error. Check your Backend URL.");
        btn.innerText = isLoginMode ? "Unlock" : "Sign Up";
    }
}

function unlockOS(email) {
    const ls = document.getElementById('lock-screen');
    ls.style.filter = "blur(20px)";
    ls.style.opacity = "0";
    setTimeout(() => { 
        ls.classList.add('hidden'); 
        initOS(email); 
    }, 500);
}
}

function unlockOS(email) {
    const ls = document.getElementById('lock-screen');
    ls.style.transition = "filter 0.5s, opacity 0.5s";
    ls.style.filter = "blur(20px)";
    setTimeout(() => { ls.classList.add('hidden'); initOS(email); }, 500);
}

// --------------------------------------------------------
// CORE OS INIT
// --------------------------------------------------------
async function initOS(userEmail) {
    window.currentUser = userEmail;
    const savedTheme = localStorage.getItem('os_theme') || '#0078D4';
    document.documentElement.style.setProperty('--accent', savedTheme);
    const savedWallpaper = localStorage.getItem('wallpaper');
    if (savedWallpaper) document.body.style.backgroundImage = `url('${savedWallpaper}')`;
    
    // Boot Sound
    await VFS.init();
    renderDesktop(); renderAppStore(); renderTaskbar(); 
    initDragSelection();
    silentUpdateAppList();
    checkForGitHubUpdates();
    updateClockDate();
    
    setInterval(updateClockDate, 1000);
    document.body.addEventListener('click', (e) => {
        if(!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) document.getElementById('start-menu').classList.add('hidden');
    });
    window.addEventListener('vfs-updated', renderDesktop);
}

function updateClockDate() {
    const d = new Date();
    document.getElementById('clock-time').innerText = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    document.getElementById('clock-date').innerText = d.toLocaleDateString();
    document.getElementById('ac-calendar').innerText = `${d.toDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// --------------------------------------------------------
// WINDOW MANAGER (WITH RESIZING)
// --------------------------------------------------------
function openWindow(appOrTitle, url, contentHTML = null, fallbackAppId = null) {
    const title = typeof appOrTitle === 'string' ? appOrTitle : appOrTitle.name;
    const appId = typeof appOrTitle === 'string' ? fallbackAppId : appOrTitle.id;
    const headerIconHTML = typeof appOrTitle === 'string' ? '' : getAppIconHTML(appOrTitle, true);

    const win = document.createElement('div'); win.className = 'window';
    win.style.width = '800px'; win.style.height = '550px'; win.style.left = '150px'; win.style.top = '80px';
    topZ++; win.style.zIndex = topZ;

    win.innerHTML = `
        <div class="window-header">
            <div class="window-title">${headerIconHTML} ${title}</div>
            <div class="window-controls">
                <div class="win-btn minimize" style="font-size: 16px;">—</div>
                <div class="win-btn box" style="font-size: 16px;">□</div>
                <div class="win-btn close" style="font-size: 14px;">✕</div>
            </div>
        </div>
        <div class="resizer-handle resizer-rw"></div>
        <div class="resizer-handle resizer-ns"></div>
        <div class="resizer-handle resizer-br"></div>
        <div class="window-content">
            <div class="drag-shield"></div>
            ${contentHTML ? contentHTML : `<iframe src="${url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`}
        </div>
    `;
    document.body.appendChild(win);
    openWindows.push({ winElement: win, appId: appId });
    renderTaskbar();

    // Draggable Header
    const header = win.querySelector('.window-header');
    const snapPreview = document.getElementById('snap-preview');
    let isDown = false, startX, startY, winX, winY, snapMode = '';

    // Resizing Logic
    const resizers = win.querySelectorAll('.resizer-handle');
    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', (e) => {
            e.stopPropagation(); e.preventDefault();
            isDown = true;
            startX = e.clientX; startY = e.clientY;
            winX = parseFloat(win.style.width); winY = parseFloat(win.style.height);
            win.style.position = 'fixed'; // Prevent layout shifts
            document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'block');
            
            function onMouseMove(me) {
                if(!isDown) return;
                if(resizer.classList.contains('resizer-rw')) { win.style.width = (winX + me.clientX - startX) + 'px'; }
                else if(resizer.classList.contains('resizer-ns')) { win.style.height = (winY + me.clientY - startY) + 'px'; }
                else if(resizer.classList.contains('resizer-br')) { 
                    win.style.width = (winX + me.clientX - startX) + 'px';
                    win.style.height = (winY + me.clientY - startY) + 'px';
                }
            }
            function onMouseUp() {
                isDown = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'none');
            }
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });

    header.addEventListener('mousedown', e => {
        if(e.target.closest('.window-controls')) return; 
        isDown = true; bringToFront(win);
        startX = e.clientX; startY = e.clientY;
        if (win.dataset.snapped) { win.style.width = win.dataset.oldWidth; win.style.height = win.dataset.oldHeight; win.dataset.snapped = ""; winX = startX - (parseInt(win.style.width) / 2); win.style.left = winX + 'px'; win.style.top = '80px'; } else { winX = win.offsetLeft; }
        winY = win.offsetTop;
        document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'block');
    });

    window.addEventListener('mousemove', e => {
        if(!isDown) return;
        win.style.left = (winX + e.clientX - startX) + 'px';
        win.style.top = (winY + e.clientY - startY) + 'px';
        // Snap Detection
        if (e.clientY < 10) { snapMode = 'top'; snapPreview.style.top = '0'; snapPreview.style.left = '0'; snapPreview.style.width = '100%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden'); }
        else if (e.clientX < 10) { snapMode = 'left'; snapPreview.style.top = '0'; snapPreview.style.left = '0'; snapPreview.style.width = '50%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden'); }
        else if (e.clientX > window.innerWidth - 10) { snapMode = 'right'; snapPreview.style.top = '0'; snapPreview.style.left = '50%'; snapPreview.style.width = '50%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden'); }
        else { snapMode = ''; snapPreview.classList.add('hidden'); }
    });

    window.addEventListener('mouseup', () => {
        if(isDown && snapMode !== '') {
            win.dataset.oldWidth = win.style.width; win.dataset.oldHeight = win.style.height; win.dataset.snapped = "true"; win.style.top = '0'; win.style.height = 'calc(100% - 52px)';
            if (snapMode === 'top') { win.style.left = '0'; win.style.width = '100%'; }
            if (snapMode === 'left') { win.style.left = '0'; win.style.width = '50%'; }
            if (snapMode === 'right') { win.style.left = '50%'; win.style.width = '50%'; }
        }
        isDown = false; snapMode = ''; snapPreview.classList.add('hidden');
        document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'none');
    });

    win.addEventListener('mousedown', () => bringToFront(win));
    win.querySelector('.close').onclick = () => { win.remove(); openWindows = openWindows.filter(w => w.winElement !== win); renderTaskbar(); };
    win.querySelector('.minimize').onclick = () => { win.style.display = 'none'; renderTaskbar(); };
    win.querySelector('.box').onclick = () => {
        if(win.style.width === '100%') { win.style.width = win.dataset.oldWidth || '800px'; win.style.height = win.dataset.oldHeight || '550px'; win.style.left = '150px'; win.style.top = '80px'; win.dataset.snapped = ""; }
        else { win.dataset.oldWidth = win.style.width; win.dataset.oldHeight = win.style.height; win.style.width = '100%'; win.style.height = 'calc(100% - 52px)'; win.style.left = '0'; win.style.top = '0'; win.dataset.snapped = "true"; }
    };
}

// Helper Modal API
window.osModal = function(type, title, message, defaultValue = '') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('os-dialog');
        document.getElementById('dialog-title').innerText = title;
        document.getElementById('dialog-message').innerText = message;
        const input = document.getElementById('dialog-input');
        const btnCancel = document.getElementById('dialog-btn-cancel');
        const btnOk = document.getElementById('dialog-btn-ok');
        if(type === 'prompt') { input.style.display = 'block'; input.value = defaultValue; btnCancel.style.display = 'block'; } 
        else if(type === 'confirm') { input.style.display = 'none'; btnCancel.style.display = 'block'; } 
        else { input.style.display = 'none'; btnCancel.style.display = 'none'; }
        dialog.classList.remove('hidden');
        if(type === 'prompt') input.focus();
        btnOk.onclick = () => { dialog.classList.add('hidden'); resolve(type === 'prompt' ? input.value : true); };
        btnCancel.onclick = () => { dialog.classList.add('hidden'); resolve(type === 'prompt' ? null : false); };
    });
};
window.osAlert = (t,m)=>window.osModal('alert',t,m); window.osConfirm = (t,m)=>window.osModal('confirm',t,m); window.osPrompt = (t,m,d)=>window.osModal('prompt',t,m,d);

// Render Functions (Desktop, Taskbar, Store, etc remain mostly same with minor auth tweaks)
// ... [Use previous render functions but update renderDesktop to include File Creation Options] ...
// Note: Due to length, here is the critical `renderDesktop` patch:
function renderDesktop() {
    const desktop = document.getElementById('desktop');
    desktop.innerHTML = '';
    desktop.oncontextmenu = (e) => showContextMenu(e, 'desktop', null);

    appRegistry.forEach(app => {
        if(app.preinstalled || installedApps.includes(app.id)) {
            const icon = document.createElement('div'); icon.className = 'desktop-icon';
            icon.innerHTML = `${getAppIconHTML(app, false)}<span>${app.name}</span>`;
            icon.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected')); icon.classList.add('selected'); };
            icon.ondblclick = () => openWindow(app, app.path);
            icon.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'app', app); };
            desktop.appendChild(icon);
        }
    });

    VFS.getFiles().then(files => {
        const rootFiles = files.filter(f => !f.name.includes('/'));
        rootFiles.forEach(file => {
            if(file.type === 'folder') return; 
            const icon = document.createElement('div'); icon.className = 'desktop-icon';
            let ext = file.name.split('.').pop();
            icon.innerHTML = `<div class="icon-placeholder" style="background:#555">${ext.toUpperCase()}</div><span>${file.name}</span>`;
            icon.onclick = (e) => { e.stopPropagation(); icon.classList.add('selected'); };
            icon.ondblclick = () => openFile(file);
            icon.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'file', file); };
            desktop.appendChild(icon);
        });
    });
}

// Rest of render functions (Taskbar, Store, Drag Selection, Context Menu, Open File, Settings...)
// Copy these exactly from the previous version I gave you, just ensure 'showContextMenu' includes NEW items below:
function showContextMenu(e, type, data) {
    e.preventDefault(); e.stopPropagation(); ctxTarget = { type, data };
    const menu = document.getElementById('context-menu');
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; menu.classList.remove('hidden');
    document.getElementById('ctx-open').style.display = type === 'desktop' ? 'none' : 'block';
    document.getElementById('ctx-delete').style.display = (type === 'desktop' || (type === 'app' && data.preinstalled)) ? 'none' : 'block';
    document.getElementById('ctx-personalize').style.display = type === 'desktop' ? 'block' : 'none';
    document.getElementById('ctx-new-text').style.display = type === 'desktop' ? 'block' : 'none';
    document.getElementById('ctx-new-folder').style.display = type === 'desktop' ? 'block' : 'none';
}
hideContextMenu = () => document.getElementById('context-menu').classList.add('hidden');

document.getElementById('ctx-new-text').onclick = async () => {
    let name = await window.osPrompt("New File", "Enter filename (.txt):");
    if(name) {
        await VFS.saveFile(name, 'text/plain', 'New Text Document');
        renderDesktop(); showNotification('Created', name + ' created on desktop.');
    }
};
document.getElementById('ctx-new-folder').onclick = async () => {
    let name = await window.osPrompt("New Folder", "Enter folder name:");
    if(name) { await VFS.saveFile(name, 'folder', ''); renderDesktop(); showNotification('Created', name + ' created.'); }
};
document.getElementById('ctx-download').onclick = () => { /* ... (add back download logic) ... */ }; // Include logic from previous version

// Action Center & Volume
toggleActionCenter = () => document.getElementById('action-center').classList.toggle('hidden');
toggleTheme = () => {
    const light = document.body.classList.toggle('light-mode');
    // You would need CSS adjustments for Light Mode colors, but for now lets just swap accent
    document.documentElement.style.setProperty('--accent', light ? '#005A9E' : '#0078D4');
};
adjustVolume = (amt) => { 
    volumeLevel += amt; if(volumeLevel > 100) volumeLevel = 100; if(volumeLevel < 0) volumeLevel = 0;
    document.getElementById('vol-level').innerText = volumeLevel + '%';
};

// Background Scanners & Notifications (Keep previous versions of these)
// ...
checkForGitHubUpdates() { /* ... Previous Logic ... */ };
silentUpdateAppList() { /* ... Previous Logic ... */ };
getAppIconHTML() { /* ... Previous Logic ... */ };
renderTaskbar() { /* ... Previous Logic ... */ };
bringToFront() { /* ... Previous Logic ... */ };
renderAppStore() { /* ... Previous Logic ... */ };
openFile() { /* ... Previous Logic ... */ };
setWallpaper() { /* ... Previous Logic ... */ };
initDragSelection() { /* ... Previous Logic ... */ };
showNotification() { /* ... Previous Logic ... */ };

window.onload = checkAuth; // Start at Lock Screen