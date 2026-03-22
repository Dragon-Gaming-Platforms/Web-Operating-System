let topZ = 100;
let installedApps = JSON.parse(localStorage.getItem('installedApps') || '[]');
let appRegistry = [];

let openWindows = []; 
const pinnedApps = ['file-explorer']; 

document.addEventListener('contextmenu', e => { e.preventDefault(); hideContextMenu(); });
document.addEventListener('click', hideContextMenu);

async function initOS() {
    await VFS.init();
    
    // Check if we have dynamically fetched apps saved, otherwise fallback to apps.json
    const savedRegistry = localStorage.getItem('dynamicAppRegistry');
    if (savedRegistry) {
        appRegistry = JSON.parse(savedRegistry);
    } else {
        try {
            const res = await fetch('apps.json');
            appRegistry = await res.json();
        } catch(e) {
            console.error("Missing apps.json fallback.");
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

    // Auto-detect GitHub username and repository from the URL
    let user = '', repo = '';
    const host = window.location.hostname;
    
    if (host.includes('github.io')) {
        user = host.split('.')[0];
        const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
        repo = pathParts.length > 0 ? pathParts[0] : host; 
    } else {
        // If testing locally or on a custom domain, ask the user
        let repoInfo = prompt("Cannot auto-detect GitHub repository.\nPlease enter it as 'username/repo':", localStorage.getItem('gh_repo_cache') || "");
        if (!repoInfo || !repoInfo.includes('/')) {
            resetBtn();
            return;
        }
        [user, repo] = repoInfo.split('/');
        localStorage.setItem('gh_repo_cache', repoInfo);
    }

    try {
        let newRegistry = [];
        
        // 1. Fetch preinstalled apps folder
        const preRes = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/apps/preinstalled`);
        if (preRes.ok) {
            const files = await preRes.json();
            for(let file of files) {
                if(file.name.endsWith('.html')) {
                    let baseName = file.name.replace('.html', '');
                    // Format name: "file-explorer" -> "File Explorer"
                    let title = baseName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    newRegistry.push({
                        id: baseName,
                        name: title,
                        path: file.path,
                        category: "System",
                        preinstalled: true,
                        icon: title === "File Explorer" ? "📂" : null // Force icon for file explorer
                    });
                }
            }
        }

        // 2. Fetch store apps folder
        const storeRes = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/apps/store`);
        if (storeRes.ok) {
            const files = await storeRes.json();
            for(let file of files) {
                if(file.name.endsWith('.html')) {
                    let baseName = file.name.replace('.html', '');
                    let title = baseName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    
                    // Smart Categorization based on keywords in title
                    let category = "App Store";
                    const lowerName = baseName.toLowerCase();
                    if(lowerName.includes('edit') || lowerName.includes('calc')) category = "Productivity";
                    if(lowerName.includes('game') || lowerName.includes('play')) category = "Entertainment";
                    if(lowerName.includes('git') || lowerName.includes('dev') || lowerName.includes('import')) category = "Developer Tools";

                    newRegistry.push({
                        id: baseName,
                        name: title,
                        path: file.path,
                        category: category,
                        preinstalled: false
                    });
                }
            }
        }

        if (newRegistry.length > 0) {
            localStorage.setItem('dynamicAppRegistry', JSON.stringify(newRegistry));
            appRegistry = newRegistry;
            renderDesktop();
            renderAppStore();
            renderTaskbar();
            btn.innerHTML = `✅ Found ${newRegistry.length} Apps!`;
            setTimeout(() => resetBtn(), 3000);
        } else {
            alert("No HTML apps found. Make sure they are uploaded directly inside the /apps/store/ or /apps/preinstalled/ folders!");
            resetBtn();
        }

    } catch(e) {
        console.error(e);
        alert("Failed to connect to GitHub. Your repository might be set to Private, or you hit the API limit.");
        resetBtn();
    }

    function resetBtn() {
        btn.innerHTML = originalText;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    }
}

// ==========================================
// ICON GENERATOR (Supports emoji, png, jpg)
// ==========================================
function getAppIconHTML(app, isSmall = false) {
    const fallbackClass = isSmall ? 'icon-placeholder-small' : 'icon-placeholder';
    
    if (app.icon) {
        if (app.icon.length <= 2) {
            return `<div class="${fallbackClass}" style="background: transparent; font-size: ${isSmall ? '18px' : '36px'}; box-shadow: none;">${app.icon}</div>`;
        } 
        return `<img src="${app.icon}" class="${fallbackClass}" style="background: transparent; box-shadow: none; object-fit: contain;">`;
    }
    
    const pathParts = app.path.split('/');
    const fileName = pathParts.pop(); 
    const folderPath = pathParts.join('/'); 
    const baseName = fileName.replace('.html', ''); 
    
    const pngPath = `${folderPath}/icons/${baseName}.png`;
    const jpgPath = `${folderPath}/icons/${baseName}.jpg`;
    const letter = app.name.charAt(0);
    
    return `<img src="${pngPath}" class="${fallbackClass}" style="background: transparent; box-shadow: none; object-fit: contain;" 
        onerror="this.onerror=null; this.src='${jpgPath}'; this.onerror=function(){ 
            const d = document.createElement('div'); 
            d.className='${fallbackClass}'; 
            d.innerText='${letter}'; 
            this.parentNode.replaceChild(d, this); 
        }">`;
}

function renderTaskbar() {
    const taskbar = document.getElementById('taskbar-icons');
    taskbar.innerHTML = ''; 
    
    const startBtn = document.createElement('div');
    startBtn.className = 'taskbar-icon start-btn';
    startBtn.id = 'start-btn';
    startBtn.innerHTML = `<img class="start-icon" src="https://upload.wikimedia.org/wikipedia/commons/e/e6/Windows_11_logo.svg" alt="Start">`;
    startBtn.onclick = (e) => {
        e.stopPropagation();
        document.getElementById('start-menu').classList.toggle('hidden');
    };
    taskbar.appendChild(startBtn);

    const activeAppIds = [...new Set(openWindows.filter(w => w.appId !== null).map(w => w.appId))];
    const appsToShow = [...new Set([...pinnedApps, ...activeAppIds])];

    appsToShow.forEach(appId => {
        const app = appRegistry.find(a => a.id === appId);
        if(!app) return;

        const isOpen = activeAppIds.includes(appId);
        const isActive = openWindows.length > 0 && openWindows[openWindows.length - 1].appId === appId;

        const btn = document.createElement('div');
        btn.className = `taskbar-icon ${isOpen ? 'is-open active-app' : ''} ${isActive ? 'is-active' : ''}`;
        
        btn.innerHTML = getAppIconHTML(app, true);
        
        btn.onclick = () => {
            if (isOpen) {
                const appWins = openWindows.filter(w => w.appId === appId);
                const targetWin = appWins[appWins.length - 1].winElement;
                bringToFront(targetWin);
            } else {
                openWindow(app, app.path);
            }
        };
        taskbar.appendChild(btn);
    });
}

function bringToFront(win) {
    topZ++;
    win.style.zIndex = topZ;
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

    appRegistry.forEach(app => {
        if(app.preinstalled || installedApps.includes(app.id)) {
            const icon = document.createElement('div');
            icon.className = 'desktop-icon';
            icon.innerHTML = `${getAppIconHTML(app, false)}<span>${app.name}</span>`;
            icon.onclick = () => openWindow(app, app.path);
            icon.oncontextmenu = (e) => showContextMenu(e, 'app', app);
            desktop.appendChild(icon);
        }
    });

    VFS.getFiles().then(files => {
        files.forEach(file => {
            const icon = document.createElement('div');
            icon.className = 'desktop-icon';
            let ext = file.name.split('.').pop();
            icon.innerHTML = `<div class="icon-placeholder" style="background:#555">${ext.toUpperCase()}</div><span>${file.name}</span>`;
            icon.onclick = () => openFile(file);
            icon.oncontextmenu = (e) => showContextMenu(e, 'file', file);
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
            
            btn.onclick = () => {
                if(!installedApps.includes(app.id)) {
                    if(confirm(`Install ${app.name}?`)) {
                        installedApps.push(app.id);
                        localStorage.setItem('installedApps', JSON.stringify(installedApps));
                        renderDesktop();
                        renderAppStore();
                    }
                } else {
                    alert('App is already installed.');
                }
            };
            grid.appendChild(btn);
        });
        section.appendChild(grid);
        store.appendChild(section);
    });
}

function openWindow(appOrTitle, url, contentHTML = null, fallbackAppId = null) {
    const title = typeof appOrTitle === 'string' ? appOrTitle : appOrTitle.name;
    const appId = typeof appOrTitle === 'string' ? fallbackAppId : appOrTitle.id;
    const headerIconHTML = typeof appOrTitle === 'string' ? '' : getAppIconHTML(appOrTitle, true);

    const win = document.createElement('div');
    win.className = 'window';
    win.style.width = '800px';
    win.style.height = '550px';
    win.style.left = '150px';
    win.style.top = '80px';
    topZ++;
    win.style.zIndex = topZ;

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
    let isDown = false, startX, startY, winX, winY;

    header.addEventListener('mousedown', e => {
        if(e.target.closest('.window-controls')) return; 
        isDown = true;
        bringToFront(win);
        startX = e.clientX; startY = e.clientY;
        winX = win.offsetLeft; winY = win.offsetTop;
        document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'block');
    });

    window.addEventListener('mousemove', e => {
        if(!isDown) return;
        win.style.left = (winX + e.clientX - startX) + 'px';
        win.style.top = (winY + e.clientY - startY) + 'px';
    });

    window.addEventListener('mouseup', () => {
        isDown = false;
        document.querySelectorAll('.drag-shield').forEach(s => s.style.display = 'none');
    });

    win.addEventListener('mousedown', () => bringToFront(win));

    win.querySelector('.close').onclick = () => {
        win.remove();
        openWindows = openWindows.filter(w => w.winElement !== win);
        renderTaskbar(); 
    };
    
    win.querySelector('.minimize').onclick = () => {
        win.style.zIndex = 1; 
        renderTaskbar();
    };

    win.querySelector('.box').onclick = () => {
        if(win.style.width === '100%') {
            win.style.width = '800px'; win.style.height = '550px';
            win.style.left = '150px'; win.style.top = '80px';
        } else {
            win.style.width = '100%'; win.style.height = 'calc(100% - 52px)';
            win.style.left = '0'; win.style.top = '0';
        }
    };
}

function openFile(file) {
    if(file.name.endsWith('.html')) {
        openWindow(file.name, null, `<iframe srcdoc="${file.content.replace(/"/g, '&quot;')}"></iframe>`);
    } else if(file.name.endsWith('.txt')) {
        openWindow(file.name, null, `<textarea style="width:100%;height:100%;resize:none;padding:15px;box-sizing:border-box;background:#1e1e1e;color:#fff;border:none;outline:none;" readonly>${file.content}</textarea>`);
    } else if(file.name.endsWith('.png') || file.name.endsWith('.jpg')) {
        openWindow(file.name, null, `<div style="background:#111;height:100%;display:flex;align-items:center;justify-content:center;"><img src="${file.content}" style="max-width:100%;max-height:100%;"></div>`);
    } else {
        alert('Filetype not supported');
    }
}

let ctxTarget = null;
function showContextMenu(e, type, data) {
    e.preventDefault();
    e.stopPropagation();
    ctxTarget = { type, data };
    const menu = document.getElementById('context-menu');
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.remove('hidden');

    const delBtn = document.getElementById('ctx-delete');
    if(type === 'app' && data.preinstalled) {
        delBtn.style.display = 'none'; 
    } else {
        delBtn.style.display = 'block';
    }
}

function hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
}

document.getElementById('ctx-open').onclick = () => {
    if(ctxTarget.type === 'app') openWindow(ctxTarget.data, ctxTarget.data.path);
    if(ctxTarget.type === 'file') openFile(ctxTarget.data);
};

document.getElementById('ctx-delete').onclick = () => {
    if(ctxTarget.type === 'app' && !ctxTarget.data.preinstalled) {
        installedApps = installedApps.filter(id => id !== ctxTarget.data.id);
        localStorage.setItem('installedApps', JSON.stringify(installedApps));
        renderDesktop();
        renderAppStore();
    } else if (ctxTarget.type === 'file') {
        VFS.deleteFile(ctxTarget.data.name);
    }
};

window.onload = initOS;
