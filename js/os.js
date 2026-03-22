let topZ = 100;
let installedApps = JSON.parse(localStorage.getItem('installedApps') || '[]');
let appRegistry = [];
let openWindows = []; 
const pinnedApps = ['file-explorer']; 

document.addEventListener('contextmenu', e => { e.preventDefault(); hideContextMenu(); });
document.addEventListener('click', (e) => {
    hideContextMenu();
    // Deselect desktop icons if clicking empty space
    if(e.target.id === 'desktop') {
        document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected'));
    }
});

async function initOS() {
    // 1. Boot Sequence & Wallpaper
    const savedWallpaper = localStorage.getItem('wallpaper');
    if (savedWallpaper) document.body.style.backgroundImage = `url('${savedWallpaper}')`;
    
    setTimeout(() => {
        document.getElementById('boot-screen').classList.add('hidden');
    }, 1500);

    await VFS.init();
    
    const savedRegistry = localStorage.getItem('dynamicAppRegistry');
    if (savedRegistry) {
        appRegistry = JSON.parse(savedRegistry);
    } else {
        try {
            const res = await fetch('apps.json');
            appRegistry = await res.json();
        } catch(e) {
            appRegistry = [];
        }
    }

    renderDesktop();
    renderAppStore();
    renderTaskbar(); 
    
    setInterval(() => {
        const d = new Date();
        document.getElementById('clock-time').innerText = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        document.getElementById('clock-date').innerText = d.toLocaleDateString();
    }, 1000);

    document.body.addEventListener('click', (e) => {
        if(!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) {
            document.getElementById('start-menu').classList.add('hidden');
        }
    });

    window.addEventListener('vfs-updated', renderDesktop);
}

// ==========================================
// DYNAMIC GITHUB APP SCANNER
// ==========================================
async function updateAppList() {
    const btn = document.getElementById('update-store-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `⏳ Scanning...`;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';

    let user = '', repo = '';
    const host = window.location.hostname;
    
    if (host.includes('github.io')) {
        user = host.split('.')[0];
        const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
        repo = pathParts.length > 0 ? pathParts[0] : host; 
    } else {
        let repoInfo = prompt("Enter 'username/repo':", localStorage.getItem('gh_repo_cache') || "");
        if (!repoInfo || !repoInfo.includes('/')) { resetBtn(); return; }
        [user, repo] = repoInfo.split('/');
        localStorage.setItem('gh_repo_cache', repoInfo);
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
                        newRegistry.push({
                            id: baseName, name: title, path: file.path, category: defaultCategory,
                            preinstalled: isPreinstalled, icon: title === "File Explorer" ? "📂" : null 
                        });
                    }
                }
            }
        };

        await fetchFolder('preinstalled', true, 'System');
        await fetchFolder('store', false, 'App Store');

        if (newRegistry.length > 0) {
            localStorage.setItem('dynamicAppRegistry', JSON.stringify(newRegistry));
            appRegistry = newRegistry;
            renderDesktop(); renderAppStore(); renderTaskbar();
            btn.innerHTML = `✅ Found ${newRegistry.length} Apps!`;
            setTimeout(() => resetBtn(), 3000);
        } else {
            alert("No HTML apps found."); resetBtn();
        }
    } catch(e) { console.error(e); alert("Failed to connect to GitHub."); resetBtn(); }

    function resetBtn() { btn.innerHTML = originalText; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
}

function getAppIconHTML(app, isSmall = false) {
    const fallbackClass = isSmall ? 'icon-placeholder-small' : 'icon-placeholder';
    if (app.icon) {
        if (app.icon.length <= 2) return `<div class="${fallbackClass}" style="background: transparent; font-size: ${isSmall ? '18px' : '36px'}; box-shadow: none;">${app.icon}</div>`;
        return `<img src="${app.icon}" class="${fallbackClass}" style="background: transparent; box-shadow: none; object-fit: contain;">`;
    }
    const pathParts = app.path.split('/'); const baseName = pathParts.pop().replace('.html', ''); 
    const folderPath = pathParts.join('/'); 
    return `<img src="${folderPath}/icons/${baseName}.png" class="${fallbackClass}" style="background:transparent; box-shadow:none; object-fit:contain;" onerror="this.onerror=null; this.src='${folderPath}/icons/${baseName}.jpg'; this.onerror=function(){ const d = document.createElement('div'); d.className='${fallbackClass}'; d.innerText='${app.name.charAt(0)}'; this.parentNode.replaceChild(d, this); }">`;
}

function renderTaskbar() {
    const taskbar = document.getElementById('taskbar-icons');
    taskbar.innerHTML = ''; 
    
    const startBtn = document.createElement('div');
    startBtn.className = 'taskbar-icon start-btn';
    startBtn.id = 'start-btn';
    startBtn.innerHTML = `<img class="start-icon" src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Windows_11_logo.svg">`;
    startBtn.onclick = (e) => { e.stopPropagation(); document.getElementById('start-menu').classList.toggle('hidden'); };
    taskbar.appendChild(startBtn);

    const activeAppIds = [...new Set(openWindows.filter(w => w.appId !== null).map(w => w.appId))];
    const appsToShow = [...new Set([...pinnedApps, ...activeAppIds])];

    appsToShow.forEach(appId => {
        const app = appRegistry.find(a => a.id === appId);
        if(!app) return;

        const isOpen = activeAppIds.includes(appId);
        // It's active if it's the top window AND it's not currently minimized (display:none)
        const appWins = openWindows.filter(w => w.appId === appId);
        const topAppWin = appWins.length > 0 ? appWins[appWins.length - 1].winElement : null;
        const isActive = topAppWin && topAppWin === openWindows[openWindows.length - 1].winElement && topAppWin.style.display !== 'none';

        const btn = document.createElement('div');
        btn.className = `taskbar-icon ${isOpen ? 'is-open active-app' : ''} ${isActive ? 'is-active' : ''}`;
        btn.innerHTML = getAppIconHTML(app, true);
        
        btn.onclick = () => {
            if (isOpen) {
                if (isActive) {
                    topAppWin.style.display = 'none'; // Minimize
                    renderTaskbar();
                } else {
                    topAppWin.style.display = 'flex'; // Restore
                    bringToFront(topAppWin);
                }
            } else {
                openWindow(app, app.path);
            }
        };
        taskbar.appendChild(btn);
    });
}

function bringToFront(win) {
    if(win.style.display === 'none') win.style.display = 'flex';
    topZ++; win.style.zIndex = topZ;
    const index = openWindows.findIndex(w => w.winElement === win);
    if(index !== -1) {
        const obj = openWindows.splice(index, 1)[0];
        openWindows.push(obj);
    }
    renderTaskbar();
}

function renderDesktop() {
    const desktop = document.getElementById('desktop');
    desktop.innerHTML = '';
    desktop.oncontextmenu = (e) => showContextMenu(e, 'desktop', null);

    appRegistry.forEach(app => {
        if(app.preinstalled || installedApps.includes(app.id)) {
            const icon = document.createElement('div');
            icon.className = 'desktop-icon';
            icon.innerHTML = `${getAppIconHTML(app, false)}<span>${app.name}</span>`;
            
            // Double Click Logic
            icon.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected')); icon.classList.add('selected'); };
            icon.ondblclick = () => openWindow(app, app.path);
            icon.oncontextmenu = (e) => { e.stopPropagation(); showContextMenu(e, 'app', app); document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected')); icon.classList.add('selected'); };
            
            desktop.appendChild(icon);
        }
    });

    VFS.getFiles().then(files => {
        // Only show root files on desktop
        const rootFiles = files.filter(f => !f.name.includes('/'));
        rootFiles.forEach(file => {
            if(file.type === 'folder') return; // Hide VFS folders from desktop grid to keep it clean
            const icon = document.createElement('div');
            icon.className = 'desktop-icon';
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
        const section = document.createElement('div');
        section.innerHTML = `<div class="category-header">${cat}</div>`;
        const grid = document.createElement('div');
        grid.className = 'app-grid';
        
        appRegistry.filter(a => a.category === cat).forEach(app => {
            if(app.preinstalled) return; 
            const btn = document.createElement('div');
            btn.className = 'desktop-icon';
            btn.innerHTML = `${getAppIconHTML(app, false)}<span>${app.name}</span>`;
            // App store stays single click
            btn.onclick = () => {
                if(!installedApps.includes(app.id)) {
                    if(confirm(`Install ${app.name}?`)) {
                        installedApps.push(app.id);
                        localStorage.setItem('installedApps', JSON.stringify(installedApps));
                        renderDesktop(); renderAppStore(); renderTaskbar();
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

    const win = document.createElement('div');
    win.className = 'window';
    win.style.width = '800px'; win.style.height = '550px';
    win.style.left = '150px'; win.style.top = '80px';
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
        
        // Restore window if dragged away from maximized/snapped state
        if (win.dataset.snapped) {
            win.style.width = win.dataset.oldWidth;
            win.style.height = win.dataset.oldHeight;
            win.dataset.snapped = "";
            winX = startX - (parseInt(win.style.width) / 2); // Center on mouse
            win.style.left = winX + 'px';
        } else {
            winX = win.offsetLeft; 
        }
        winY = win.offsetTop;
        document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'block');
    });

    window.addEventListener('mousemove', e => {
        if(!isDown) return;
        win.style.left = (winX + e.clientX - startX) + 'px';
        win.style.top = (winY + e.clientY - startY) + 'px';

        // Aero Snap Detect
        if (e.clientY < 10) { 
            snapMode = 'top'; snapPreview.style.top = '0'; snapPreview.style.left = '0'; snapPreview.style.width = '100%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden');
        } else if (e.clientX < 10) { 
            snapMode = 'left'; snapPreview.style.top = '0'; snapPreview.style.left = '0'; snapPreview.style.width = '50%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden');
        } else if (e.clientX > window.innerWidth - 10) { 
            snapMode = 'right'; snapPreview.style.top = '0'; snapPreview.style.left = '50%'; snapPreview.style.width = '50%'; snapPreview.style.height = 'calc(100% - 52px)'; snapPreview.classList.remove('hidden');
        } else { 
            snapMode = ''; snapPreview.classList.add('hidden'); 
        }
    });

    window.addEventListener('mouseup', () => {
        if(isDown && snapMode !== '') {
            win.dataset.oldWidth = win.style.width;
            win.dataset.oldHeight = win.style.height;
            win.dataset.snapped = "true";
            win.style.top = '0';
            win.style.height = 'calc(100% - 52px)';
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
        if(win.style.width === '100%') {
            win.style.width = win.dataset.oldWidth || '800px'; win.style.height = win.dataset.oldHeight || '550px';
            win.style.left = '150px'; win.style.top = '80px'; win.dataset.snapped = "";
        } else {
            win.dataset.oldWidth = win.style.width; win.dataset.oldHeight = win.style.height;
            win.style.width = '100%'; win.style.height = 'calc(100% - 52px)';
            win.style.left = '0'; win.style.top = '0'; win.dataset.snapped = "true";
        }
    };
}

function openFile(file) {
    if(file.name.endsWith('.html')) openWindow(file.name.split('/').pop(), null, `<iframe srcdoc="${file.content.replace(/"/g, '&quot;')}"></iframe>`);
    else if(file.name.endsWith('.txt')) openWindow(file.name.split('/').pop(), null, `<textarea style="width:100%;height:100%;resize:none;padding:15px;box-sizing:border-box;background:#1e1e1e;color:#fff;border:none;outline:none;" readonly>${file.content}</textarea>`);
    else if(file.name.endsWith('.png') || file.name.endsWith('.jpg')) openWindow(file.name.split('/').pop(), null, `<div style="background:#111;height:100%;display:flex;align-items:center;justify-content:center;"><img src="${file.content}" style="max-width:100%;max-height:100%;"></div>`);
    else alert('Filetype not supported');
}

// Global Export & Context Menus
let ctxTarget = null;
function showContextMenu(e, type, data) {
    e.preventDefault(); e.stopPropagation();
    ctxTarget = { type, data };
    const menu = document.getElementById('context-menu');
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    menu.classList.remove('hidden');

    document.getElementById('ctx-open').style.display = type === 'desktop' ? 'none' : 'block';
    document.getElementById('ctx-delete').style.display = (type === 'desktop' || (type === 'app' && data.preinstalled)) ? 'none' : 'block';
    document.getElementById('ctx-download').style.display = type === 'file' ? 'block' : 'none';
    document.getElementById('ctx-personalize').style.display = type === 'desktop' ? 'block' : 'none';
}

function hideContextMenu() { document.getElementById('context-menu').classList.add('hidden'); }

document.getElementById('ctx-open').onclick = () => {
    if(ctxTarget.type === 'app') openWindow(ctxTarget.data, ctxTarget.data.path);
    if(ctxTarget.type === 'file') openFile(ctxTarget.data);
};

document.getElementById('ctx-delete').onclick = () => {
    if(ctxTarget.type === 'app' && !ctxTarget.data.preinstalled) {
        installedApps = installedApps.filter(id => id !== ctxTarget.data.id);
        localStorage.setItem('installedApps', JSON.stringify(installedApps));
        renderDesktop(); renderAppStore(); renderTaskbar();
    } else if (ctxTarget.type === 'file') {
        VFS.deleteFile(ctxTarget.data.name);
    }
};

document.getElementById('ctx-download').onclick = () => {
    if(ctxTarget.type === 'file') {
        const isDataURL = ctxTarget.data.content.startsWith('data:');
        let url = isDataURL ? ctxTarget.data.content : URL.createObjectURL(new Blob([ctxTarget.data.content]));
        let a = document.createElement('a');
        a.href = url; a.download = ctxTarget.data.name.split('/').pop(); a.click();
    }
};

document.getElementById('ctx-personalize').onclick = () => {
    document.getElementById('personalize-dialog').classList.remove('hidden');
    document.getElementById('wallpaper-input').focus();
};

function setWallpaper() {
    const url = document.getElementById('wallpaper-input').value;
    if (url) {
        document.body.style.backgroundImage = `url('${url}')`;
        localStorage.setItem('wallpaper', url);
    }
    document.getElementById('personalize-dialog').classList.add('hidden');
}

window.onload = initOS;
