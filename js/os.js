// ==========================================
// CUSTOM OS DIALOG API (Bypasses Iframe Blocks)
// ==========================================
window.osModal = function(type, title, message, defaultValue = '') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('os-dialog');
        document.getElementById('dialog-title').innerText = title;
        document.getElementById('dialog-message').innerText = message;
        
        const input = document.getElementById('dialog-input');
        const btnCancel = document.getElementById('dialog-btn-cancel');
        const btnOk = document.getElementById('dialog-btn-ok');
        
        if(type === 'prompt') {
            input.style.display = 'block'; input.value = defaultValue; btnCancel.style.display = 'block';
        } else if(type === 'confirm') {
            input.style.display = 'none'; btnCancel.style.display = 'block';
        } else { 
            input.style.display = 'none'; btnCancel.style.display = 'none';
        }
        
        dialog.classList.remove('hidden');
        if(type === 'prompt') input.focus();
        
        btnOk.onclick = () => {
            dialog.classList.add('hidden');
            if(type === 'prompt') resolve(input.value);
            else resolve(true);
        };
        
        btnCancel.onclick = () => {
            dialog.classList.add('hidden');
            if(type === 'prompt') resolve(null);
            else resolve(false);
        };
    });
};
window.osAlert = (title, msg) => window.osModal('alert', title, msg);
window.osConfirm = (title, msg) => window.osModal('confirm', title, msg);
window.osPrompt = (title, msg, def) => window.osModal('prompt', title, msg, def);
let topZ = 100;
let installedApps = JSON.parse(localStorage.getItem('installedApps') || '[]');
let appRegistry = [];
let openWindows = []; 
const pinnedApps = ['file-explorer', 'settings', 'terminal']; 

document.addEventListener('contextmenu', e => { e.preventDefault(); hideContextMenu(); });
document.addEventListener('click', (e) => {
    hideContextMenu();
    if(e.target.id === 'desktop') document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected'));
});

// Iframe Communication API (Bulletproofs the OS)
window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.action === 'notify') showNotification(e.data.title, e.data.msg);
    if (e.data.action === 'openWindow') openWindow(e.data.title || 'App', e.data.url, e.data.content, e.data.appId);
    if (e.data.action === 'changeTheme') {
        document.documentElement.style.setProperty('--accent', e.data.color);
        localStorage.setItem('os_theme', e.data.color);
    }
});

async function initOS() {
    // Load Settings
    const savedTheme = localStorage.getItem('os_theme') || '#0078D4';
    document.documentElement.style.setProperty('--accent', savedTheme);
    const savedWallpaper = localStorage.getItem('wallpaper');
    if (savedWallpaper) document.body.style.backgroundImage = `url('${savedWallpaper}')`;
    
    setTimeout(() => { document.getElementById('boot-screen').classList.add('hidden'); }, 1500);

    await VFS.init();
    
    const savedRegistry = localStorage.getItem('dynamicAppRegistry');
    if (savedRegistry) appRegistry = JSON.parse(savedRegistry);

    renderDesktop(); renderAppStore(); renderTaskbar(); 
    initDragSelection();
    
    setInterval(() => {
        const d = new Date();
        document.getElementById('clock-time').innerText = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        document.getElementById('clock-date').innerText = d.toLocaleDateString();
    }, 1000);

    document.body.addEventListener('click', (e) => {
        if(!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) document.getElementById('start-menu').classList.add('hidden');
    });

    window.addEventListener('vfs-updated', renderDesktop);
}

// ------------------------------------
// Toast Notifications
// ------------------------------------
function showNotification(title, message) {
    const center = document.getElementById('notification-center');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<h4>${title}</h4><p>${message}</p>`;
    center.appendChild(toast);
    
    // Play subtle sound (using a tiny base64 blip to avoid file linking issues)
    try {
        const audio = new Audio("data:audio/wav;base64,UklGRlIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTEAAAAcHR0eHh4fHx8gICAhISEiIiIjIyMkJCQlJSUmJiYnJycoKCgA");
        audio.play().catch(e=>{});
    } catch(e) {}

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ------------------------------------
// Desktop Drag Selection
// ------------------------------------
function initDragSelection() {
    const desktop = document.getElementById('desktop');
    const box = document.getElementById('selection-box');
    let isSelecting = false, startX, startY;

    desktop.addEventListener('mousedown', (e) => {
        if(e.target !== desktop) return;
        isSelecting = true;
        startX = e.clientX; startY = e.clientY;
        box.style.left = startX + 'px'; box.style.top = startY + 'px';
        box.style.width = '0px'; box.style.height = '0px';
        box.classList.remove('hidden');
        document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected'));
        // Prevent iframes from stealing mouse during drag
        document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'block');
    });

    window.addEventListener('mousemove', (e) => {
        if(!isSelecting) return;
        const currentX = e.clientX, currentY = e.clientY;
        const x = Math.min(startX, currentX), y = Math.min(startY, currentY);
        const w = Math.abs(currentX - startX), h = Math.abs(currentY - startY);
        
        box.style.left = x + 'px'; box.style.top = y + 'px';
        box.style.width = w + 'px'; box.style.height = h + 'px';

        // Check intersections
        document.querySelectorAll('.desktop-icon').forEach(icon => {
            const rect = icon.getBoundingClientRect();
            if(rect.left < x + w && rect.right > x && rect.top < y + h && rect.bottom > y) {
                icon.classList.add('selected');
            } else {
                icon.classList.remove('selected');
            }
        });
    });

    window.addEventListener('mouseup', () => {
        if(isSelecting) {
            isSelecting = false; box.classList.add('hidden');
            document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'none');
        }
    });
}

// ------------------------------------
// App Fetching (GitHub API)
// ------------------------------------
async function updateAppList() {
    const btn = document.getElementById('update-store-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `⏳ Scanning...`; btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none';

    let user = '', repo = '';
    const host = window.location.hostname;
    if (host.includes('github.io')) {
        user = host.split('.')[0];
        const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
        repo = pathParts.length > 0 ? pathParts[0] : host; 
    } else {
        let repoInfo = prompt("Enter 'username/repo':", localStorage.getItem('gh_repo_cache') || "");
        if (!repoInfo || !repoInfo.includes('/')) { resetBtn(); return; }
        [user, repo] = repoInfo.split('/'); localStorage.setItem('gh_repo_cache', repoInfo);
    }

    try {
        let newRegistry = [];
        const fetchFolder = async (folder, isPreinstalled, defaultCategory) => {
            const res = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/apps/${folder}`);
            if (res.ok) {
                const files = await res.json();
                for(let file of files) {
                    if(file.name.endsWith('.html')) {
                        let baseName = file.name.replace('.html', '');
                        let title = baseName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        
                        let customIcon = null;
                        if(baseName === 'file-explorer') customIcon = '📁';
                        if(baseName === 'settings') customIcon = '⚙️';
                        if(baseName === 'terminal') customIcon = '⌨️';

                        newRegistry.push({ id: baseName, name: title, path: file.path, category: defaultCategory, preinstalled: isPreinstalled, icon: customIcon });
                    }
                }
            }
        };

        await fetchFolder('preinstalled', true, 'System'); await fetchFolder('store', false, 'App Store');
        if (newRegistry.length > 0) {
            localStorage.setItem('dynamicAppRegistry', JSON.stringify(newRegistry));
            appRegistry = newRegistry;
            renderDesktop(); renderAppStore(); renderTaskbar();
            btn.innerHTML = `✅ Found ${newRegistry.length} Apps!`;
            setTimeout(() => resetBtn(), 3000);
        } else { alert("No HTML apps found."); resetBtn(); }
    } catch(e) { console.error(e); alert("Failed to connect to GitHub."); resetBtn(); }
    function resetBtn() { btn.innerHTML = originalText; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
}

function getAppIconHTML(app, isSmall = false) {
    const fallbackClass = isSmall ? 'icon-placeholder-small' : 'icon-placeholder';
    if (app.icon) {
        if (app.icon.length <= 2) return `<div class="${fallbackClass}" style="background: transparent; font-size: ${isSmall ? '18px' : '36px'}; box-shadow: none;">${app.icon}</div>`;
        return `<img src="${app.icon}" class="${fallbackClass}" style="background: transparent; box-shadow: none; object-fit: contain;">`;
    }
    const pathParts = app.path.split('/'); const baseName = pathParts.pop().replace('.html', ''); const folderPath = pathParts.join('/'); 
    return `<img src="${folderPath}/icons/${baseName}.png" class="${fallbackClass}" style="background:transparent; box-shadow:none; object-fit:contain;" onerror="this.onerror=null; this.src='${folderPath}/icons/${baseName}.jpg'; this.onerror=function(){ const d = document.createElement('div'); d.className='${fallbackClass}'; d.innerText='${app.name.charAt(0)}'; this.parentNode.replaceChild(d, this); }">`;
}

// ------------------------------------
// UI Renderers & Window Manager
// ------------------------------------
function renderTaskbar() {
    const taskbar = document.getElementById('taskbar-icons');
    taskbar.innerHTML = ''; 
    const startBtn = document.createElement('div'); startBtn.className = 'taskbar-icon start-btn'; startBtn.id = 'start-btn';
    startBtn.innerHTML = `<img class="start-icon" src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Windows_11_logo.svg">`;
    startBtn.onclick = (e) => { e.stopPropagation(); document.getElementById('start-menu').classList.toggle('hidden'); };
    taskbar.appendChild(startBtn);

    const activeAppIds = [...new Set(openWindows.filter(w => w.appId !== null).map(w => w.appId))];
    const appsToShow = [...new Set([...pinnedApps, ...activeAppIds])];

    appsToShow.forEach(appId => {
        const app = appRegistry.find(a => a.id === appId); if(!app) return;
        const isOpen = activeAppIds.includes(appId);
        const appWins = openWindows.filter(w => w.appId === appId);
        const topAppWin = appWins.length > 0 ? appWins[appWins.length - 1].winElement : null;
        const isActive = topAppWin && topAppWin === openWindows[openWindows.length - 1].winElement && topAppWin.style.display !== 'none';

        const btn = document.createElement('div');
        btn.className = `taskbar-icon ${isOpen ? 'is-open active-app' : ''} ${isActive ? 'is-active' : ''}`;
        btn.innerHTML = getAppIconHTML(app, true);
        btn.onclick = () => {
            if (isOpen) {
                if (isActive) { topAppWin.style.display = 'none'; renderTaskbar(); } 
                else { topAppWin.style.display = 'flex'; bringToFront(topAppWin); }
            } else { openWindow(app, app.path); }
        };
        taskbar.appendChild(btn);
    });
}

function bringToFront(win) {
    if(win.style.display === 'none') win.style.display = 'flex';
    topZ++; win.style.zIndex = topZ;
    const index = openWindows.findIndex(w => w.winElement === win);
    if(index !== -1) { const obj = openWindows.splice(index, 1)[0]; openWindows.push(obj); }
    renderTaskbar();
}

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
            icon.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'app', app); document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected')); icon.classList.add('selected'); };
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
            icon.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected')); icon.classList.add('selected'); };
            icon.ondblclick = () => openFile(file);
            icon.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'file', file); document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected')); icon.classList.add('selected'); };
            desktop.appendChild(icon);
        });
    });
}

function renderAppStore() {
    const store = document.getElementById('store-categories');
    store.innerHTML = '';
    const categories = [...new Set(appRegistry.map(a => a.category || 'Other'))];
    
    categories.forEach(cat => {
        const section = document.createElement('div'); section.innerHTML = `<div class="category-header">${cat}</div>`;
        const grid = document.createElement('div'); grid.className = 'app-grid';
        appRegistry.filter(a => a.category === cat).forEach(app => {
            if(app.preinstalled) return; 
            const btn = document.createElement('div'); btn.className = 'desktop-icon';
            btn.innerHTML = `${getAppIconHTML(app, false)}<span>${app.name}</span>`;
            btn.onclick = () => {
                if(!installedApps.includes(app.id)) {
                    if(confirm(`Install ${app.name}?`)) {
                        installedApps.push(app.id); localStorage.setItem('installedApps', JSON.stringify(installedApps));
                        renderDesktop(); renderAppStore(); renderTaskbar(); showNotification('App Installed', `${app.name} has been added to your desktop.`);
                    }
                } else alert('App is already installed.');
            };
            grid.appendChild(btn);
        });
        section.appendChild(grid); store.appendChild(section);
    });
}

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
        <div class="window-content">
            <div class="drag-shield"></div>
            ${contentHTML ? contentHTML : `<iframe src="${url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`}
        </div>
    `;
    document.body.appendChild(win);
    openWindows.push({ winElement: win, appId: appId });
    renderTaskbar();

    const header = win.querySelector('.window-header');
    const snapPreview = document.getElementById('snap-preview');
    let isDown = false, startX, startY, winX, winY, snapMode = '';

    header.addEventListener('mousedown', e => {
        if(e.target.closest('.window-controls')) return; 
        isDown = true; bringToFront(win);
        startX = e.clientX; startY = e.clientY;
        if (win.dataset.snapped) { win.style.width = win.dataset.oldWidth; win.style.height = win.dataset.oldHeight; win.dataset.snapped = ""; winX = startX - (parseInt(win.style.width) / 2); win.style.left = winX + 'px'; } else { winX = win.offsetLeft; }
        winY = win.offsetTop;
        document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'block');
    });

    window.addEventListener('mousemove', e => {
        if(!isDown) return;
        win.style.left = (winX + e.clientX - startX) + 'px'; win.style.top = (winY + e.clientY - startY) + 'px';
        if (e.clientY < 10) { snapMode = 'top'; snapPreview.style.top = '0'; snapPreview.style.left = '0'; snapPreview.style.width = '100%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden'); } else if (e.clientX < 10) { snapMode = 'left'; snapPreview.style.top = '0'; snapPreview.style.left = '0'; snapPreview.style.width = '50%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden'); } else if (e.clientX > window.innerWidth - 10) { snapMode = 'right'; snapPreview.style.top = '0'; snapPreview.style.left = '50%'; snapPreview.style.width = '50%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden'); } else { snapMode = ''; snapPreview.classList.add('hidden'); }
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
        if(win.style.width === '100%') { win.style.width = win.dataset.oldWidth || '800px'; win.style.height = win.dataset.oldHeight || '550px'; win.style.left = '150px'; win.style.top = '80px'; win.dataset.snapped = ""; } else { win.dataset.oldWidth = win.style.width; win.dataset.oldHeight = win.style.height; win.style.width = '100%'; win.style.height = 'calc(100% - 52px)'; win.style.left = '0'; win.style.top = '0'; win.dataset.snapped = "true"; }
    };
}

// Media / File Player
function openFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if(ext === 'html') openWindow(file.name.split('/').pop(), null, `<iframe srcdoc="${file.content.replace(/"/g, '&quot;')}"></iframe>`);
    else if(ext === 'txt') openWindow(file.name.split('/').pop(), null, `<textarea style="width:100%;height:100%;resize:none;padding:15px;box-sizing:border-box;background:#1e1e1e;color:#fff;border:none;outline:none;" readonly>${file.content}</textarea>`);
    else if(ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif') openWindow(file.name.split('/').pop(), null, `<div style="background:#111;height:100%;display:flex;align-items:center;justify-content:center;"><img src="${file.content}" style="max-width:100%;max-height:100%;"></div>`);
    else if(ext === 'mp4' || ext === 'webm') openWindow(file.name.split('/').pop(), null, `<div style="background:#000;height:100%;display:flex;align-items:center;justify-content:center;"><video src="${file.content}" controls autoplay style="width:100%;height:100%;outline:none;"></video></div>`);
    else if(ext === 'mp3' || ext === 'wav') openWindow(file.name.split('/').pop(), null, `<div style="background:#111;height:100%;display:flex;align-items:center;justify-content:center; flex-direction:column; gap:20px;"><h2>🎵 ${file.name.split('/').pop()}</h2><audio src="${file.content}" controls autoplay style="width:80%;outline:none;"></audio></div>`);
    else alert('Filetype not supported');
}

// Global Context Menus
let ctxTarget = null;
function showContextMenu(e, type, data) {
    e.preventDefault(); e.stopPropagation();
    ctxTarget = { type, data };
    const menu = document.getElementById('context-menu');
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; menu.classList.remove('hidden');

    document.getElementById('ctx-open').style.display = type === 'desktop' ? 'none' : 'block';
    document.getElementById('ctx-delete').style.display = (type === 'desktop' || (type === 'app' && data.preinstalled)) ? 'none' : 'block';
    document.getElementById('ctx-download').style.display = type === 'file' ? 'block' : 'none';
    document.getElementById('ctx-personalize').style.display = type === 'desktop' ? 'block' : 'none';
}
function hideContextMenu() { document.getElementById('context-menu').classList.add('hidden'); }

document.getElementById('ctx-open').onclick = () => { if(ctxTarget.type === 'app') openWindow(ctxTarget.data, ctxTarget.data.path); if(ctxTarget.type === 'file') openFile(ctxTarget.data); };
document.getElementById('ctx-delete').onclick = () => {
    if(ctxTarget.type === 'app' && !ctxTarget.data.preinstalled) {
        installedApps = installedApps.filter(id => id !== ctxTarget.data.id); localStorage.setItem('installedApps', JSON.stringify(installedApps));
        renderDesktop(); renderAppStore(); renderTaskbar();
    } else if (ctxTarget.type === 'file') { VFS.deleteFile(ctxTarget.data.name); }
};
document.getElementById('ctx-download').onclick = () => {
    if(ctxTarget.type === 'file') {
        const isDataURL = ctxTarget.data.content.startsWith('data:');
        let url = isDataURL ? ctxTarget.data.content : URL.createObjectURL(new Blob([ctxTarget.data.content]));
        let a = document.createElement('a'); a.href = url; a.download = ctxTarget.data.name.split('/').pop(); a.click();
    }
};
document.getElementById('ctx-personalize').onclick = () => { document.getElementById('personalize-dialog').classList.remove('hidden'); document.getElementById('wallpaper-input').focus(); };

function setWallpaper() {
    const url = document.getElementById('wallpaper-input').value;
    if (url) { document.body.style.backgroundImage = `url('${url}')`; localStorage.setItem('wallpaper', url); showNotification('Personalization', 'Wallpaper updated successfully.'); }
    document.getElementById('personalize-dialog').classList.add('hidden');
}
window.onload = initOS;
