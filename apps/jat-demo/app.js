// ==========================================================================
// JATapp — Live Collaborative Presentation Engine (Vanilla JS + LocalStorage Realtime Sync)
// ==========================================================================

// Initial default state
const DEFAULT_STATE = {
    rides: [
        {
            id: 'RIDE-101',
            company: 'Farmacorp S.A.',
            requester: 'Ing. Fabiola Torrez',
            pickup: 'Av. Las Américas 450',
            destination: 'Equipetrol Calle 8 Norte',
            initialFare: 150,
            fare: 150,
            waitTime: 0,
            elapsedTime: 2, // in minutes
            status: 'pending', // pending, assigned, ontheway, inprogress, completed
            priority: 'high',
            driver: null,
            adjustments: [],
            timeline: [
                { time: '09:15', label: 'Solicitud Recibida', desc: 'Ingreso al sistema desde Farmacorp S.A.' }
            ]
        }
    ],
    drivers: [
        { id: 'DRV-01', name: 'Carlos Méndez', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150', rating: 4.8, distance: '1.2 km', status: 'available', completed: 14, zone: 'Centro', vehicle: 'Vespa SCZ-228' },
        { id: 'DRV-02', name: 'Jorge Ribera', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150', rating: 4.9, distance: '0.8 km', status: 'available', completed: 18, zone: 'Equipetrol', vehicle: 'Honda SCZ-994' },
        { id: 'DRV-03', name: 'Pedro Gómez', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150', rating: 4.6, distance: '2.5 km', status: 'busy', completed: 9, zone: 'Norte', vehicle: 'Yamaha SCZ-441' }
    ],
    notifications: [
        { title: 'Sistema Inicializado', desc: 'Entorno de Demostración Comercial Listo.', time: '09:00', type: 'success' }
    ],
    currentStep: 1
};

// Global active app session variables
let state = {};
let activeRole = 'admin';
let activeTab = 'dashboard';

window.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    initNavigation();
    initRoleSelector();
    initDemoController();
    initHelpCenter();
    initNotificationDropdown();
    
    // Initial clock update
    updateClock();
    setInterval(updateClock, 1000);
    
    renderAll();
    
    // Listen to localstorage updates for realtime sync across parallel browser windows!
    window.addEventListener('storage', (e) => {
        if (e.key === 'jatapp_demo_state') {
            loadStateFromStorage();
            renderAll();
            showToast('Actualización Recibida', 'Sincronización colaborativa en tiempo real aplicada', 'info', false);
        }
    });

    // Auto-update timer representation (dynamic waiting timer colors)
    setInterval(updateTimerTick, 1000);
});

// Load state from local storage or set defaults
function loadStateFromStorage() {
    const val = localStorage.getItem('jatapp_demo_state');
    if (val) {
        try {
            state = JSON.parse(val);
        } catch (e) {
            state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
    } else {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        saveStateToStorage();
    }
}

function saveStateToStorage() {
    localStorage.setItem('jatapp_demo_state', JSON.stringify(state));
}

// Live Clock UI
function updateClock() {
    const el = document.getElementById('top-bar-live-time');
    if (el) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        el.innerHTML = `<i class="fa-regular fa-clock"></i> ${dateStr} • <strong>${timeStr}</strong>`;
    }
}

// Navigation Tabs
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            switchTab(target);
        });
    });
    
    document.getElementById('btn-switch-role-live').addEventListener('click', () => {
        document.getElementById('role-selector-overlay').style.display = 'flex';
        document.getElementById('app-layout').style.display = 'none';
    });
}

function switchTab(tabId) {
    activeTab = tabId;
    
    // Toggle active menu link
    document.querySelectorAll('.nav-item').forEach(link => {
        if (link.getAttribute('data-target') === tabId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Switch tabs views
    document.querySelectorAll('.module-tab').forEach(tabView => {
        tabView.classList.remove('active');
    });
    
    const targetModule = document.getElementById(`module-${tabId}`);
    if (targetModule) {
        targetModule.classList.add('active');
    }
    
    // Update headers titles
    const titles = {
        dashboard: { main: 'Dashboard Ejecutivo', sub: 'Vista panorámica y KPIs del negocio en tiempo real' },
        operations: { main: 'Centro de Operaciones', sub: 'Tablero de control de servicios y despacho en vivo' },
        billing: { main: 'Módulo de Facturación Digital', sub: 'Visualización y generación de facturas comerciales' },
        reports: { main: 'Reportes & Analytics', sub: 'Inteligencia de negocio y rendimiento operativo' },
        closing: { main: 'Propuesta de Transformación Digital', sub: 'Modelos de implementación para el despegue de MotoJAT' },
        'admin-settings': { main: 'Configuración del Sistema', sub: 'Tablas de tarifas, usuarios y parámetros de la plataforma' }
    };
    
    document.getElementById('page-title').innerText = titles[tabId]?.main || 'JATapp';
    document.getElementById('page-subtitle').innerText = titles[tabId]?.sub || '';
}

// Role Selection Logic
function initRoleSelector() {
    const roleButtons = document.querySelectorAll('.role-btn');
    roleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-role');
            selectPresentationRole(role);
        });
    });
}

function selectPresentationRole(role) {
    activeRole = role;
    document.getElementById('role-selector-overlay').style.display = 'none';
    document.getElementById('app-layout').style.display = 'grid';
    
    const activeRoleText = document.querySelector('#active-role-indicator span');
    const profileName = document.getElementById('user-display-name');
    const profileRole = document.getElementById('user-display-role');
    const profileImg = document.getElementById('sidebar-avatar');
    
    // Toggle active menu visibility based on role
    if (role === 'admin') {
        activeRoleText.innerText = 'Administrador';
        profileName.innerText = 'Fabiana Pérez';
        profileRole.innerText = 'Methodology Owner / Admin';
        profileImg.src = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200';
        switchTab('dashboard');
    } else if (role === 'operator') {
        activeRoleText.innerText = 'Operador Central';
        profileName.innerText = 'Operador Central 1';
        profileRole.innerText = 'Despachador Oficial';
        profileImg.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200';
        switchTab('operations');
    } else {
        activeRoleText.innerText = 'Motoquero (Field)';
        profileName.innerText = 'Carlos Méndez';
        profileRole.innerText = 'Motoquero JAT';
        profileImg.src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200';
        switchTab('operations');
    }
    
    showToast('Sesión Iniciada', `Rol configurado como: ${activeRoleText.innerText}`, 'success');
}

// Timer Tick
function updateTimerTick() {
    let changed = false;
    state.rides.forEach(ride => {
        if (ride.status === 'pending') {
            ride.elapsedTime += 0.05; // Simulate elapsed waiting time
            changed = true;
            
            const el = document.getElementById(`timer-badge-${ride.id}`);
            if (el) {
                const roundedTime = Math.floor(ride.elapsedTime);
                el.innerHTML = `<i class="fa-regular fa-clock"></i> Espera: ${roundedTime}m`;
                
                // Color escalation rules: Green -> Yellow -> Orange -> Red -> Flashing Red
                el.className = 'waiting-timer';
                if (ride.elapsedTime < 3) {
                    el.classList.add('timer-green');
                } else if (ride.elapsedTime < 5) {
                    el.classList.add('timer-yellow');
                } else if (ride.elapsedTime < 7) {
                    el.classList.add('timer-orange');
                } else if (ride.elapsedTime < 9) {
                    el.classList.add('timer-red');
                } else {
                    el.classList.add('timer-flash');
                }
            }
        }
    });
    
    if (changed) {
        saveStateToStorage();
    }
}

// Render Operations Kanban Board
function renderKanban() {
    const containers = {
        pending: document.getElementById('container-pending'),
        assigned: document.getElementById('container-assigned'),
        ontheway: document.getElementById('container-ontheway'),
        inprogress: document.getElementById('container-inprogress'),
        completed: document.getElementById('container-completed')
    };
    
    // Reset columns
    Object.values(containers).forEach(c => c.innerHTML = '');
    
    // Count objects
    const counts = { pending: 0, assigned: 0, ontheway: 0, inprogress: 0, completed: 0 };
    
    state.rides.forEach(ride => {
        counts[ride.status]++;
        
        const card = document.createElement('div');
        card.className = `ride-card`;
        card.innerHTML = `
            <div class="card-header">
                <span class="card-company">${ride.company}</span>
                <span class="card-priority prio-${ride.priority}"></span>
            </div>
            <div class="card-routes">
                <div><i class="fa-solid fa-location-dot text-green"></i> <b>Origen:</b> ${ride.pickup}</div>
                <div><i class="fa-solid fa-flag-checkered text-red"></i> <b>Destino:</b> ${ride.destination}</div>
            </div>
            <div class="card-footer">
                <span class="card-fare">$ ${ride.fare}</span>
                <span class="waiting-timer timer-green" id="timer-badge-${ride.id}">
                    <i class="fa-regular fa-clock"></i> Espera: ${Math.floor(ride.elapsedTime)}m
                </span>
            </div>
        `;
        
        card.addEventListener('click', () => handleRideCardClick(ride));
        containers[ride.status].appendChild(card);
    });
    
    // Update column counters
    document.getElementById('count-pending').innerText = counts.pending;
    document.getElementById('count-assigned').innerText = counts.assigned;
    document.getElementById('count-ontheway').innerText = counts.ontheway;
    document.getElementById('count-inprogress').innerText = counts.inprogress;
    document.getElementById('count-completed').innerText = counts.completed;
}

function handleRideCardClick(ride) {
    state.selectedRideId = ride.id;
    if (ride.status === 'pending') {
        openAssignModal();
    } else if (ride.status === 'completed') {
        openTicketModal(ride);
    } else {
        openMonitoringModal(ride);
    }
}

// Assignment Modal
function openAssignModal() {
    const modal = document.getElementById('modal-assign');
    modal.classList.add('active');
    
    const container = document.getElementById('drivers-assign-container');
    container.innerHTML = '';
    
    state.drivers.forEach(driver => {
        const card = document.createElement('div');
        card.className = 'driver-assign-card';
        card.innerHTML = `
            <div class="driver-assign-info-wrapper">
                <img src="${driver.avatar}" alt="Driver avatar" class="driver-list-avatar">
                <div class="driver-assign-info">
                    <h4>${driver.name} (${driver.vehicle})</h4>
                    <div class="driver-assign-meta">
                        <span><i class="fa-solid fa-star text-yellow"></i> ${driver.rating}</span>
                        <span><i class="fa-solid fa-motorcycle"></i> Zona: ${driver.zone}</span>
                        <span>Hoy: ${driver.completed}</span>
                    </div>
                </div>
            </div>
            <span class="badge badge-success">${driver.status}</span>
        `;
        
        card.addEventListener('click', () => assignDriver(driver));
        container.appendChild(card);
    });
}

function assignDriver(driver) {
    const ride = state.rides.find(r => r.id === state.selectedRideId);
    if (ride) {
        ride.status = 'assigned';
        ride.driver = driver;
        ride.timeline.push({ time: getSimulatedTime(), label: 'Conductor Asignado', desc: `Operador asignó a ${driver.name}` });
        
        // Hide Modal
        document.getElementById('modal-assign').classList.remove('active');
        saveStateToStorage();
        renderAll();
        
        showToast('Asignación Completada', `Driver ${driver.name} asignado al servicio.`, 'success');
        
        if (state.currentStep === 3) {
            executeDemoStep(4);
        }
    }
}

document.getElementById('btn-modal-assign-close').addEventListener('click', () => {
    document.getElementById('modal-assign').classList.remove('active');
});

// Ride Monitoring Modal
function openMonitoringModal(ride) {
    const modal = document.getElementById('modal-monitoring');
    modal.classList.add('active');
    
    const container = document.getElementById('monitoring-details-body');
    container.innerHTML = `
        <div class="stats-list">
            <div class="stat-row"><span>ID del Viaje</span><strong>${ride.id}</strong></div>
            <div class="stat-row"><span>Empresa</span><strong>${ride.company}</strong></div>
            <div class="stat-row"><span>Pasajero / Solicitante</span><strong>${ride.requester}</strong></div>
            <div class="stat-row"><span>Motoquero Asignado</span><strong>${ride.driver?.name || 'N/A'}</strong></div>
            <div class="stat-row"><span>Vehículo / Placa</span><strong>${ride.driver?.vehicle || 'N/A'}</strong></div>
            <div class="stat-row"><span>Estado Actual</span><span class="badge badge-info">${ride.status}</span></div>
            <div class="stat-row"><span>Origen</span><strong>${ride.pickup}</strong></div>
            <div class="stat-row"><span>Destino</span><strong>${ride.destination}</strong></div>
            <div class="stat-row"><span>Tarifa Actual</span><strong>$ ${ride.fare}</strong></div>
        </div>
        
        <div class="admin-panel" style="margin-top:20px; padding: 12px; background: rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1)">
            <h4 style="margin-bottom:10px;"><i class="fa-solid fa-pen-to-square"></i> Simular Ajuste de Destino / Tarifa (Módulo 7)</h4>
            <div class="role-selector-container" style="background:transparent; border:none; padding:0; margin-bottom:10px;">
                <label>Nuevo Destino</label>
                <input type="text" id="input-new-dest" value="Av. San Martín y 4to Anillo (Desvío)" style="width:100%; padding:8px; border-radius:6px; background:#000; border:1px solid var(--panel-border); color:#fff; outline:none; font-size:13px;">
            </div>
            <div class="role-selector-container" style="background:transparent; border:none; padding:0; margin-bottom:12px;">
                <label>Monto del Ajuste ($)</label>
                <input type="number" id="input-adjust-amount" value="50" style="width:100%; padding:8px; border-radius:6px; background:#000; border:1px solid var(--panel-border); color:#fff; outline:none; font-size:13px;">
            </div>
            <button class="btn btn-primary btn-sm" id="btn-adjust-fare">Aplicar Desvío & Ajuste</button>
        </div>
        
        <div style="margin-top:20px; display:flex; gap:12px;">
            <button class="btn btn-outline" id="btn-simulate-ontheway" ${ride.status !== 'assigned' ? 'disabled' : ''}>Marcar: En Camino</button>
            <button class="btn btn-outline" id="btn-simulate-inprogress" ${ride.status !== 'ontheway' ? 'disabled' : ''}>Iniciar Viaje</button>
            <button class="btn btn-success" id="btn-simulate-completed" ${ride.status !== 'inprogress' ? 'disabled' : ''}>Completar Viaje</button>
        </div>
    `;
    
    // Bind actions
    document.getElementById('btn-adjust-fare').addEventListener('click', () => {
        const newDest = document.getElementById('input-new-dest').value;
        const adjustAmount = parseFloat(document.getElementById('input-adjust-amount').value);
        applyFareAdjustment(ride, newDest, adjustAmount);
    });
    
    document.getElementById('btn-simulate-ontheway').addEventListener('click', () => {
        ride.status = 'ontheway';
        ride.timeline.push({ time: getSimulatedTime(), label: 'Motoquero en Camino', desc: 'Driver en tránsito al punto de partida' });
        saveStateToStorage();
        openMonitoringModal(ride);
        renderAll();
        showToast('En Camino', 'El motoquero está en camino al punto de origen.', 'warning');
        
        if (state.currentStep === 4) {
            executeDemoStep(5);
        }
    });
    
    document.getElementById('btn-simulate-inprogress').addEventListener('click', () => {
        ride.status = 'inprogress';
        ride.timeline.push({ time: getSimulatedTime(), label: 'Servicio Iniciado', desc: 'Pasajero a bordo del Motoquero' });
        saveStateToStorage();
        openMonitoringModal(ride);
        renderAll();
        showToast('Viaje Iniciado', 'El servicio está en curso.', 'warning');
    });
    
    document.getElementById('btn-simulate-completed').addEventListener('click', () => {
        ride.status = 'completed';
        ride.timeline.push({ time: getSimulatedTime(), label: 'Servicio Completado', desc: 'Arribo a destino final del cliente' });
        ride.timeline.push({ time: getSimulatedTime(), label: 'Ticket Digital Generado', desc: 'Ticket emitido en la facturación del cliente' });
        saveStateToStorage();
        modal.classList.remove('active');
        renderAll();
        openTicketModal(ride);
        showToast('Viaje Completado', 'El ticket digital ya está disponible.', 'success');
        
        if (state.currentStep === 6) {
            switchTab('billing');
        }
    });
}

function applyFareAdjustment(ride, newDest, amount) {
    ride.destination = newDest;
    ride.fare += amount;
    ride.adjustments.push({
        type: 'Desvío de Ruta',
        amount: amount,
        reason: 'El cliente solicitó parada adicional en Av. San Martín.'
    });
    ride.timeline.push({ time: getSimulatedTime(), label: 'Ruta Modificada', desc: `Desvío a: ${newDest}. Incremento de $${amount} aplicado.` });
    
    document.getElementById('modal-monitoring').classList.remove('active');
    saveStateToStorage();
    renderAll();
    showToast('Tarifa Ajustada', 'Se recalculó la tarifa final del servicio por desvío.', 'success');
    
    if (state.currentStep === 5) {
        executeDemoStep(6);
    }
}

document.getElementById('btn-modal-monitor-close').addEventListener('click', () => {
    document.getElementById('modal-monitoring').classList.remove('active');
});

// Digital Ticket Modal
function openTicketModal(ride) {
    const modal = document.getElementById('modal-ticket');
    modal.classList.add('active');
    
    const container = document.getElementById('ticket-body');
    const today = new Date().toISOString().split('T')[0];
    
    let adjustmentRows = '';
    ride.adjustments.forEach(adj => {
        adjustmentRows += `<div class="ticket-row-print"><span>+ ${adj.type}</span><span>$ ${adj.amount}</span></div>`;
    });
    
    let timelineHTML = '';
    ride.timeline.forEach(step => {
        timelineHTML += `
            <div class="timeline-step">
                <span>${step.time} - ${step.label}</span>
                <span><small>${step.desc}</small></span>
            </div>
        `;
    });
    
    container.innerHTML = `
        <div class="digital-ticket-box">
            <div class="ticket-header-print">
                <h2>MOTOJAT LOGISTICS S.R.L.</h2>
                <p>TICKET DIGITAL DE ENVÍO</p>
                <small>Nro: ${ride.id}</small>
            </div>
            <div class="ticket-row-print"><span>Fecha Emisión</span><span>${today}</span></div>
            <div class="ticket-row-print"><span>Empresa</span><span>${ride.company}</span></div>
            <div class="ticket-row-print"><span>Solicitante</span><span>${ride.requester}</span></div>
            <div class="ticket-row-print"><span>Conductor</span><span>${ride.driver?.name || 'N/A'}</span></div>
            <div class="ticket-row-print"><span>Vehículo / Placa</span><span>${ride.driver?.vehicle || 'N/A'}</span></div>
            <hr style="border:none; border-top:1px dashed #111827; margin:10px 0;">
            <div class="ticket-row-print"><span>Origen</span><span>${ride.pickup}</span></div>
            <div class="ticket-row-print"><span>Destino</span><span>${ride.destination}</span></div>
            <hr style="border:none; border-top:1px dashed #111827; margin:10px 0;">
            
            <h4>Historial del Servicio (Timeline):</h4>
            <div class="timeline-print" style="margin-bottom:16px;">
                ${timelineHTML}
            </div>
            
            <hr style="border:none; border-top:1px dashed #111827; margin:10px 0;">
            <div class="ticket-row-print"><span>Tarifa Base</span><span>$ ${ride.initialFare}</span></div>
            ${adjustmentRows}
            <div class="ticket-row-print total"><span>TARIFA FINAL</span><span>$ ${ride.fare}</span></div>
        </div>
        <div style="display:flex; justify-content:space-between;">
            <button class="btn btn-outline" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimir</button>
            <button class="btn btn-primary" id="btn-share-ticket"><i class="fa-solid fa-share-nodes"></i> Compartir</button>
        </div>
    `;
    
    document.getElementById('btn-share-ticket').addEventListener('click', () => {
        showToast('Enlace Copiado', 'Link del ticket digital enviado a la empresa del cliente.', 'success');
    });
}

document.getElementById('btn-modal-ticket-close').addEventListener('click', () => {
    document.getElementById('modal-ticket').classList.remove('active');
});

// Render Billing
function renderBilling() {
    const tbody = document.getElementById('tickets-table-body');
    tbody.innerHTML = '';
    
    state.rides.forEach(ride => {
        const tr = document.createElement('tr');
        const today = new Date().toISOString().split('T')[0];
        tr.innerHTML = `
            <td><input type="checkbox" class="ticket-select-row"></td>
            <td><strong>${ride.id}</strong></td>
            <td>${ride.company}</td>
            <td>${ride.requester}</td>
            <td>${ride.driver?.name || '<em>No asignado</em>'}</td>
            <td><small>${ride.pickup} ➔ ${ride.destination}</small></td>
            <td><strong>$ ${ride.fare}</strong></td>
            <td>${today}</td>
            <td><span class="badge ${ride.status === 'completed' ? 'badge-success' : 'badge-pending'}">${ride.status}</span></td>
            <td>
                <button class="btn btn-outline btn-sm" id="btn-view-ticket-bill-${ride.id}"><i class="fa-regular fa-eye"></i> Ver</button>
            </td>
        `;
        
        tbody.appendChild(tr);
        
        document.getElementById(`btn-view-ticket-bill-${ride.id}`).addEventListener('click', () => {
            openTicketModal(ride);
        });
    });
}

// Render Reports
function renderReports() {
    const list = document.getElementById('adjustments-report-list');
    list.innerHTML = '';
    
    let count = 0;
    state.rides.forEach(ride => {
        ride.adjustments.forEach(adj => {
            count++;
            const row = document.createElement('div');
            row.className = 'stat-row';
            row.innerHTML = `
                <span>${ride.company} (${ride.id}) - ${adj.type}</span>
                <strong class="text-orange">+$ ${adj.amount}</strong>
            `;
            list.appendChild(row);
        });
    });
    
    if (count === 0) {
        list.innerHTML = '<div class="text-muted" style="font-size:12px; text-align:center; padding:10px;">Sin ajustes reportados hoy.</div>';
    }
}

// Render Dashboard Activity Feed
function renderActivityFeed() {
    const feed = document.getElementById('dashboard-activity-feed');
    feed.innerHTML = '';
    
    if (state.notifications.length === 0) {
        feed.innerHTML = '<div class="text-muted" style="font-size:12px; text-align:center; padding:20px;">Sin actividad reciente.</div>';
        return;
    }
    
    // Sort activity events chronologically reversed
    const sorted = [...state.notifications].reverse();
    
    sorted.forEach(notif => {
        const item = document.createElement('div');
        item.className = 'feed-item';
        
        let iconClass = 'fa-info-circle';
        let colorClass = 'feed-icon-blue';
        if (notif.type === 'success') {
            iconClass = 'fa-check-circle';
            colorClass = 'feed-icon-green';
        } else if (notif.type === 'warning') {
            iconClass = 'fa-triangle-exclamation';
            colorClass = 'feed-icon-orange';
        }
        
        item.innerHTML = `
            <div class="feed-icon-box ${colorClass}"><i class="fa-solid ${iconClass}"></i></div>
            <div class="feed-details">
                <span class="feed-title">${notif.title}</span>
                <p class="feed-desc">${notif.desc}</p>
            </div>
            <span class="feed-time">${notif.time}</span>
        `;
        
        feed.appendChild(item);
    });
}

// Render Notifications Bell dropdown
function renderNotificationsDropdown() {
    const container = document.getElementById('notification-dropdown-list');
    container.innerHTML = '';
    
    const unreadEl = document.getElementById('bell-unread-count');
    const sorted = [...state.notifications].reverse();
    
    unreadEl.innerText = state.notifications.length;
    
    if (state.notifications.length === 0) {
        container.innerHTML = '<div class="empty-notif-msg">Sin notificaciones.</div>';
        unreadEl.style.display = 'none';
        return;
    } else {
        unreadEl.style.display = 'block';
    }
    
    sorted.forEach(notif => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `
            <span class="notif-title">${notif.title}</span>
            <span class="notif-desc">${notif.desc}</span>
            <span class="notif-time">${notif.time}</span>
        `;
        container.appendChild(item);
    });
}

function initNotificationDropdown() {
    const bell = document.getElementById('notification-center-bell');
    const dropdown = document.getElementById('notification-dropdown');
    
    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });
    
    document.addEventListener('click', () => {
        dropdown.classList.remove('active');
    });
    
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    document.getElementById('btn-clear-notifications-list').addEventListener('click', () => {
        state.notifications = [];
        saveStateToStorage();
        renderAll();
        showToast('Notificaciones Limpiadas', 'Historial borrado con éxito.', 'success');
    });
}

// Interactive help modals
function initHelpCenter() {
    const btn = document.getElementById('btn-help-trigger');
    const modal = document.getElementById('modal-help');
    
    btn.addEventListener('click', () => {
        const content = document.getElementById('help-modal-body-content');
        
        const explanations = {
            dashboard: `
                <h3>Dashboard Ejecutivo Corporativo</h3>
                <p style="margin-top:10px;">Esta sección brinda una visión consolidada en tiempo real de la facturación y la eficiencia de la flota.</p>
                <ul style="margin-left:20px; margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                    <li><strong>Servicios Hoy:</strong> Total de solicitudes atendidas durante el día en curso.</li>
                    <li><strong>Pedidos Pendientes:</strong> Viajes esperando operador o conductor en la zona metropolitana.</li>
                    <li><strong>Facturación Estimada:</strong> Cálculo dinámico de costos base más tarifas de reajuste.</li>
                </ul>
            `,
            operations: `
                <h3>Centro de Operaciones Kanban</h3>
                <p style="margin-top:10px;">Tablero de flujo logístico oficial donde el operador central y los conductores coordinan los servicios.</p>
                <p style="margin-top:10px;">Los temporizadores dinámicos alertan de forma automática la urgencia del pedido usando un código de colores (Verde, Amarillo, Naranja, Rojo) para evitar penalizaciones de contrato con las empresas.</p>
            `,
            billing: `
                <h3>Facturación Digital Integrada</h3>
                <p style="margin-top:10px;">Listado maestro de los Tickets Digitales emitidos al finalizar cada viaje.</p>
                <p style="margin-top:10px;">Permite realizar auditorías, exportaciones masivas y facturación agrupada por empresa cliente (ej. Farmacorp o Banco Ganadero) de forma 100% digital, eliminando el uso de papel.</p>
            `,
            reports: `
                <h3>Inteligencia de Negocio & Reportes</h3>
                <p style="margin-top:10px;">Métricas consolidadas de rendimiento operativo de la flota.</p>
                <p style="margin-top:10px;">Incluye análisis de tiempos de respuesta, tasa de servicios reajustados por desvíos y distribución semanal de despachos corporativos.</p>
            `,
            closing: `
                <h3>Modelos de Implementación Comercial</h3>
                <p style="margin-top:10px;">Resumen ejecutivo de propuestas de digitalización y licenciamiento de la plataforma JATapp.</p>
            `,
            'admin-settings': `
                <h3>Configuración & Parámetros</h3>
                <p style="margin-top:10px;">Panel de administración para definir la tabla de tarifas oficiales, perfiles de despachadores y gestión de flota.</p>
            `
        };
        
        content.innerHTML = explanations[activeTab] || explanations['dashboard'];
        modal.classList.add('active');
    });
    
    document.getElementById('btn-modal-help-close').addEventListener('click', () => {
        modal.classList.remove('active');
    });
}

// Visual updates for KPIs with bump transitions
function updateKPIs() {
    const pendingCount = state.rides.filter(r => r.status === 'pending').length;
    const completedCount = state.rides.filter(r => r.status === 'completed').length;
    const activeCount = state.rides.filter(r => ['assigned', 'ontheway', 'inprogress'].includes(r.status)).length;
    
    animateKPIChange('kpi-pending-rides', pendingCount);
    animateKPIChange('kpi-completed-rides', 38 + completedCount - 1);
    
    document.getElementById('badge-pending-count').innerText = pendingCount;
    document.getElementById('kpi-today-rides').innerText = 42 + state.rides.length - 1;
    
    // Estimate billing
    const baseBilling = 12450;
    const additional = state.rides.reduce((acc, r) => acc + (r.status === 'completed' ? r.fare : 0), 0);
    animateKPIChange('kpi-billing', `$ ${baseBilling + additional}`);
}

function animateKPIChange(elId, newVal) {
    const el = document.getElementById(elId);
    if (el && el.innerText !== String(newVal)) {
        el.innerText = newVal;
        el.classList.add('bump');
        setTimeout(() => el.classList.remove('bump'), 200);
    }
}

function renderAll() {
    renderKanban();
    renderBilling();
    renderReports();
    renderActivityFeed();
    renderNotificationsDropdown();
    updateKPIs();
}

// Guided Demo Steps
function initDemoController() {
    const toggleBtn = document.getElementById('btn-toggle-controller');
    const controller = document.querySelector('.demo-controller-floating');
    
    toggleBtn.addEventListener('click', () => {
        controller.classList.toggle('collapsed');
        const icon = toggleBtn.querySelector('i');
        if (controller.classList.contains('collapsed')) {
            icon.className = 'fa-solid fa-chevron-up';
        } else {
            icon.className = 'fa-solid fa-chevron-down';
        }
    });
    
    document.getElementById('btn-next-step').addEventListener('click', () => {
        let next = state.currentStep + 1;
        if (next > 6) next = 1;
        executeDemoStep(next);
    });
    
    for (let i = 1; i <= 6; i++) {
        document.getElementById(`step-${i}`).addEventListener('click', () => {
            executeDemoStep(i);
        });
    }

    // Peak Hour simulation
    document.getElementById('btn-sim-peakhour').addEventListener('click', () => {
        simulatePeakHourScenario();
    });

    // Emergency ride simulation
    document.getElementById('btn-sim-emergency').addEventListener('click', () => {
        simulateEmergencyScenario();
    });

    // Reset All Button
    document.getElementById('btn-reset-demo-all').addEventListener('click', () => {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        saveStateToStorage();
        executeDemoStep(1);
        showToast('Escenario Reiniciado', 'Los datos del sistema se restablecieron a su estado inicial.', 'info');
    });
    
    document.getElementById('btn-reset-demo-all').addEventListener('click', () => {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        saveStateToStorage();
        executeDemoStep(1);
    });
}

function executeDemoStep(stepNum) {
    state.currentStep = stepNum;
    
    // Update steps active/completed classes
    for (let i = 1; i <= 6; i++) {
        const btn = document.getElementById(`step-${i}`);
        btn.className = 'step-btn';
        if (i < stepNum) {
            btn.classList.add('completed');
        } else if (i === stepNum) {
            btn.classList.add('active');
        }
    }
    
    const hints = {
        1: 'Paso 1: Una empresa solicita un servicio de cadetería express.',
        2: 'Paso 2: El pedido se recibe en Operaciones. Temporizador alerta.',
        3: 'Paso 3: El operador selecciona un conductor para asignarlo.',
        4: 'Paso 4: El Motoquero acepta y se pone en camino (Simulación de Driver).',
        5: 'Paso 5: El cliente solicita desvío. Se reajusta tarifa del viaje.',
        6: 'Paso 6: Conductor finaliza viaje. Se genera Ticket y cierra historia.'
    };
    
    document.getElementById('step-hint-text').innerText = hints[stepNum];
    
    if (stepNum === 1) {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        saveStateToStorage();
        switchTab('dashboard');
        renderAll();
    } else if (stepNum === 2) {
        switchTab('operations');
        const r = state.rides[0];
        if (r) {
            r.elapsedTime = 6.4; // Excalate timer
        }
        saveStateToStorage();
        renderAll();
        showToast('Nueva Solicitud', 'Farmacorp solicitó envío express.', 'info');
    } else if (stepNum === 3) {
        switchTab('operations');
        openAssignModal();
    } else if (stepNum === 4) {
        // Simular Motoquero en camino
        const r = state.rides[0];
        if (r) {
            if (!r.driver) r.driver = state.drivers[0];
            r.status = 'ontheway';
            r.timeline.push({ time: getSimulatedTime(), label: 'Motoquero en Camino', desc: 'Carlos Méndez aceptó el servicio.' });
        }
        saveStateToStorage();
        switchTab('operations');
        renderAll();
        showToast('Servicio Aceptado', 'Carlos Méndez está en camino.', 'success');
    } else if (stepNum === 5) {
        const r = state.rides[0];
        if (r) {
            r.status = 'inprogress';
        }
        saveStateToStorage();
        switchTab('operations');
        renderAll();
        if (r) openMonitoringModal(r);
    } else if (stepNum === 6) {
        const r = state.rides[0];
        if (r) {
            r.status = 'completed';
            r.destination = 'Equipetrol Calle 8 Norte (Desvío)';
            r.fare = 200;
            if (r.adjustments.length === 0) {
                r.adjustments.push({ type: 'Desvío de Ruta', amount: 50, reason: 'Cambio de destino en Av. San Martín.' });
            }
            if (r.timeline.length < 4) {
                r.timeline.push({ time: getSimulatedTime(), label: 'Ruta Modificada', desc: 'Desvío y tarifa reajustada.' });
                r.timeline.push({ time: getSimulatedTime(), label: 'Servicio Completado', desc: 'Llegada exitosa a destino.' });
            }
        }
        saveStateToStorage();
        switchTab('closing');
        renderAll();
        if (r) openTicketModal(r);
    }
}

// Simulation peak hour helper
function simulatePeakHourScenario() {
    const companies = ['Banco Ganadero', 'Hospital Foianini', 'Laboratorio Chávez', 'Universidad Privada'];
    const routes = [
        { pickup: 'Av. Irala 412', destination: 'Equipetrol Calle 9', fare: 120 },
        { pickup: 'Hospital Foianini', destination: 'Km 5 Doble Vía La Guardia', fare: 180 },
        { pickup: 'Laboratorio Chávez Central', destination: 'Pampa de la Isla', fare: 250 }
    ];
    
    routes.forEach((route, index) => {
        const id = `RIDE-SIM-${Math.floor(100 + Math.random() * 900)}`;
        state.rides.push({
            id: id,
            company: companies[index % companies.length],
            requester: 'Encargado de Sucursal',
            pickup: route.pickup,
            destination: route.destination,
            initialFare: route.fare,
            fare: route.fare,
            waitTime: 0,
            elapsedTime: Math.random() * 8, // Random waits to test color alerts
            status: 'pending',
            priority: 'medium',
            driver: null,
            adjustments: [],
            timeline: [
                { time: getSimulatedTime(), label: 'Solicitud Recibida', desc: 'Ingresada por API integrada.' }
            ]
        });
    });
    
    saveStateToStorage();
    renderAll();
    showToast('Simulación de Hora Pico', 'Se generaron múltiples solicitudes con tiempos de espera variables.', 'warning');
}

// Simulation emergency ride
function simulateEmergencyScenario() {
    const id = `EMERGENCY-${Math.floor(100 + Math.random() * 900)}`;
    state.rides.push({
        id: id,
        company: 'Hospital Foianini Central',
        requester: 'Dr. Fernando Rojas (Urgencias)',
        pickup: 'Hospital Foianini Quirófano A',
        destination: 'Banco de Sangre SCZ (Urgente)',
        initialFare: 220,
        fare: 220,
        waitTime: 0,
        elapsedTime: 0.1,
        status: 'pending',
        priority: 'high',
        driver: null,
        adjustments: [],
        timeline: [
            { time: getSimulatedTime(), label: 'Solicitud Recibida', desc: 'Ingreso prioritario por alerta médica.' }
        ]
    });
    
    saveStateToStorage();
    renderAll();
    showToast('ALERTA DE EMERGENCIA', 'Solicitud crítica de Hospital Foianini recibida. Requiere asignación prioritaria.', 'danger');
}

// Manual Create Request
document.getElementById('btn-request-ride-manual').addEventListener('click', () => {
    const id = `RIDE-${Math.floor(100 + Math.random() * 900)}`;
    const newRide = {
        id: id,
        company: 'Banco Ganadero S.A.',
        requester: 'Lic. Andrés Mercado',
        pickup: '4to Anillo Av. Bush',
        destination: 'Parque Industrial PI-22',
        initialFare: 180,
        fare: 180,
        waitTime: 0,
        elapsedTime: 0.1,
        status: 'pending',
        priority: 'medium',
        driver: null,
        adjustments: [],
        timeline: [
            { time: getSimulatedTime(), label: 'Solicitud Recibida', desc: 'Ingreso al sistema por operador' }
        ]
    };
    
    state.rides.push(newRide);
    saveStateToStorage();
    switchTab('operations');
    renderAll();
    
    showToast('Nueva Solicitud', `Ingresada con ID ${id}`, 'info');
});

// Toast notification helper
function showToast(title, desc, type = 'info', appendToHistory = true) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-body">
            <span class="toast-title">${title}</span>
            <span class="toast-desc">${desc}</span>
        </div>
    `;
    container.appendChild(toast);
    
    if (appendToHistory) {
        state.notifications.push({
            title: title,
            desc: desc,
            time: getSimulatedTime(),
            type: type
        });
        saveStateToStorage();
        renderActivityFeed();
        renderNotificationsDropdown();
    }
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function getSimulatedTime() {
    const now = new Date();
    return now.toTimeString().split(' ')[0].substring(0, 5);
}
