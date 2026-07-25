// ==========================================================================
// JATapp — Live Collaborative Presentation Engine (Vanilla JS + LocalStorage Realtime Sync)
// ==========================================================================

const statusLabels = {
    pending: 'Pendiente',
    assigned: 'Asignado',
    ontheway: 'En Camino',
    completed: 'Completado'
};

// Initial default state
const DEFAULT_STATE = {
    rides: [
        {
            id: 'RIDE-101',
            company: 'Farmacorp S.A.',
            requester: 'Ing. Fabiola Torrez',
            pickup: 'Av. Las Américas 450',
            destination: 'Equipetrol Calle 8 Norte',
            initialFare: 35,
            fare: 35,
            waitTime: 0,
            elapsedTime: 2, // in minutes
            status: 'pending', // pending, assigned, ontheway, completed
            priority: 'high',
            driver: null,
            adjustments: [],
            paymentMethod: null,
            observations: '',
            timeline: [
                { time: '09:15', label: 'Solicitud Recibida', desc: 'Ingreso al sistema desde Farmacorp S.A.' }
            ]
        }
    ],
    balances: {
        Efectivo: 350,
        QR: 480,
        Ticket: 410
    },
    drivers: [
        { id: 'DRV-01', movil: '1', name: 'Carlos Méndez', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150', rating: 4.8, distance: '1.2 km', status: 'available', completed: 14, zone: 'Centro', vehicle: 'Vespa SCZ-228' },
        { id: 'DRV-02', movil: '2', name: 'Jorge Ribera', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150', rating: 4.9, distance: '0.8 km', status: 'available', completed: 18, zone: 'Equipetrol', vehicle: 'Honda SCZ-994' },
        { id: 'DRV-03', movil: '3', name: 'Pedro Gómez', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150', rating: 4.6, distance: '2.5 km', status: 'busy', completed: 9, zone: 'Norte', vehicle: 'Yamaha SCZ-441' },
        { id: 'DRV-04', movil: '4', name: 'Mario Justiniano', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150', rating: 4.7, distance: '1.9 km', status: 'available', completed: 11, zone: 'Sur', vehicle: 'Suzuki SCZ-112' },
        { id: 'DRV-05', movil: '5', name: 'Juan Perez', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150', rating: 4.8, distance: '0.5 km', status: 'available', completed: 10, zone: 'Centro', vehicle: 'Honda Navi ZZZ-456' },
        { id: 'DRV-06', movil: '6', name: 'Roberto Siles', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=150', rating: 4.5, distance: '1.4 km', status: 'available', completed: 12, zone: 'Equipetrol', vehicle: 'Taurus SCZ-671' },
        { id: 'DRV-07', movil: '7', name: 'Lucas Rojas', avatar: 'https://images.unsplash.com/photo-1500048993953-d23a436266cf?auto=format&fit=crop&q=80&w=150', rating: 4.6, distance: '2.1 km', status: 'available', completed: 15, zone: 'Norte', vehicle: 'KTM SCZ-892' },
        { id: 'DRV-08', movil: '8', name: 'Jose Mamani', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=150', rating: 4.4, distance: '2.7 km', status: 'available', completed: 7, zone: 'Sur', vehicle: 'Pegasus SCZ-340' },
        { id: 'DRV-09', movil: '9', name: 'Daniel Vargas', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=150', rating: 4.7, distance: '0.9 km', status: 'available', completed: 16, zone: 'Oeste', vehicle: 'Kawasaki SCZ-721' },
        { id: 'DRV-10', movil: '10', name: 'Walter Ortiz', avatar: 'https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?auto=format&fit=crop&q=80&w=150', rating: 4.8, distance: '1.5 km', status: 'available', completed: 19, zone: 'Centro', vehicle: 'Honda SCZ-105' },
        { id: 'DRV-11', movil: '11', name: 'Fernando Torrico', avatar: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=150', rating: 4.6, distance: '1.8 km', status: 'available', completed: 13, zone: 'Equipetrol', vehicle: 'Yamaha SCZ-552' },
        { id: 'DRV-12', movil: '12', name: 'Oscar Paz', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=150', rating: 4.7, distance: '2.0 km', status: 'available', completed: 14, zone: 'Norte', vehicle: 'Vespa SCZ-991' },
        { id: 'DRV-13', movil: '13', name: 'Miguel Suarez', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150', rating: 4.5, distance: '2.8 km', status: 'available', completed: 10, zone: 'Sur', vehicle: 'Suzuki SCZ-382' },
        { id: 'DRV-14', movil: '14', name: 'Ricardo Vaca', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150', rating: 4.4, distance: '3.0 km', status: 'available', completed: 8, zone: 'Oeste', vehicle: 'TVS SCZ-492' },
        { id: 'DRV-15', movil: '15', name: 'Alberto Roca', avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=150', rating: 4.6, distance: '1.6 km', status: 'available', completed: 11, zone: 'Centro', vehicle: 'Ducati SCZ-804' }
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
    initReportsNavigation();
    initDriverWalletFilters();
    initDragAndDrop();
    
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
            // If they are on an old state or missing drivers, force reset!
            if (!state.drivers || state.drivers.length < 15 || !state.drivers[0].movil || state.drivers[0].movil === '15') {
                state = JSON.parse(JSON.stringify(DEFAULT_STATE));
                saveStateToStorage();
            }
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
        'admin-settings': { main: 'Configuración del Sistema', sub: 'Tablas de tarifas, usuarios y parámetros de la plataforma' },
        'driver-balance': { main: 'Mi Balance & Historial', sub: 'Control de cobros personales, comisiones e historial de viajes' }
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
    
    // Hide/Show sidebar links based on role permission matrix
    const navs = {
        dashboard: document.getElementById('nav-dashboard'),
        operations: document.getElementById('nav-operations'),
        billing: document.getElementById('nav-billing'),
        reports: document.getElementById('nav-reports'),
        closing: document.getElementById('nav-closing'),
        settings: document.getElementById('nav-settings'),
        driverBalance: document.getElementById('nav-driver-balance')
    };
    
    // Reset all displays to flex
    Object.entries(navs).forEach(([key, nav]) => {
        if (nav) {
            nav.style.display = (key === 'driverBalance') ? 'none' : 'flex';
        }
    });
    
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
        
        // Hide Owner-only tabs
        if (navs.dashboard) navs.dashboard.style.display = 'none';
        if (navs.reports) navs.reports.style.display = 'none';
        if (navs.closing) navs.closing.style.display = 'none';
        
        switchTab('operations');
    } else {
        activeRoleText.innerText = 'Motoquero (Field)';
        profileName.innerText = 'Carlos Méndez';
        profileRole.innerText = 'Motoquero JAT';
        profileImg.src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200';
        
        // Hide everything except Operations and Driver Balance tab
        if (navs.dashboard) navs.dashboard.style.display = 'none';
        if (navs.billing) navs.billing.style.display = 'none';
        if (navs.reports) navs.reports.style.display = 'none';
        if (navs.closing) navs.closing.style.display = 'none';
        if (navs.settings) navs.settings.style.display = 'none';
        
        if (navs.driverBalance) navs.driverBalance.style.display = 'flex';
        
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
        completed: document.getElementById('container-completed')
    };
    
    // Reset columns
    Object.values(containers).forEach(c => {
        if (c) c.innerHTML = '';
    });
    
    // Count objects
    const counts = { pending: 0, assigned: 0, ontheway: 0, completed: 0 };
    
    state.rides.forEach(ride => {
        // Fallback for old status
        if (ride.status === 'inprogress') {
            ride.status = 'ontheway';
        }
        
        counts[ride.status]++;
        
        const card = document.createElement('div');
        card.className = `ride-card`;
        card.setAttribute('draggable', 'true');
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
                <span class="card-fare">Bs. ${ride.fare}</span>
                <span class="waiting-timer timer-green" id="timer-badge-${ride.id}">
                    <i class="fa-regular fa-clock"></i> Espera: ${Math.floor(ride.elapsedTime)}m
                </span>
            </div>
        `;
        
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', ride.id);
            card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
        
        card.addEventListener('click', () => handleRideCardClick(ride));
        if (containers[ride.status]) {
            containers[ride.status].appendChild(card);
        }
    });
    
    // Update column counters
    if (document.getElementById('count-pending')) document.getElementById('count-pending').innerText = counts.pending;
    if (document.getElementById('count-assigned')) document.getElementById('count-assigned').innerText = counts.assigned;
    if (document.getElementById('count-ontheway')) document.getElementById('count-ontheway').innerText = counts.ontheway;
    if (document.getElementById('count-completed')) document.getElementById('count-completed').innerText = counts.completed;
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
    
    // Populate the current fare for the selected ride
    const ride = state.rides.find(r => r.id === state.selectedRideId);
    if (ride) {
        document.getElementById('input-assign-fare').value = ride.fare;
    }
    
    const searchInput = document.getElementById('input-assign-movil-search');
    searchInput.value = '';
    
    const renderFilteredDrivers = (filterText = '') => {
        const container = document.getElementById('drivers-assign-container');
        container.innerHTML = '';
        
        const filtered = state.drivers.filter(d => {
            if (!filterText) return true;
            return d.movil.includes(filterText) || d.name.toLowerCase().includes(filterText.toLowerCase());
        });
        
        filtered.forEach(driver => {
            const card = document.createElement('div');
            card.className = 'driver-assign-card';
            card.innerHTML = `
                <div class="driver-assign-info-wrapper">
                    <img src="${driver.avatar}" alt="Driver avatar" class="driver-list-avatar">
                    <div class="driver-assign-info">
                        <h4>Móvil ${driver.movil} — ${driver.name}</h4>
                        <div class="driver-assign-meta">
                            <span><i class="fa-solid fa-star text-yellow"></i> ${driver.rating}</span>
                            <span><i class="fa-solid fa-motorcycle"></i> ${driver.vehicle}</span>
                            <span>Zona: ${driver.zone}</span>
                            <span>Hoy: ${driver.completed}</span>
                        </div>
                    </div>
                </div>
                <span class="badge ${driver.status === 'available' ? 'badge-success' : 'badge-danger'}">${driver.status}</span>
            `;
            
            card.addEventListener('click', () => assignDriver(driver));
            container.appendChild(card);
        });
        
        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-muted" style="text-align:center; padding:20px; font-size:13px;">No se encontraron conductores con ese número de móvil o nombre.</div>';
        }
    };
    
    // Rebind event listeners to search input
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    
    newSearchInput.addEventListener('input', (e) => {
        renderFilteredDrivers(e.target.value.trim());
    });
    
    newSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                // Find exact match by movil number
                let match = state.drivers.find(d => d.movil === query);
                if (!match) {
                    // Create dynamic driver on the fly with custom details for demo realism!
                    match = {
                        id: `DRV-GEN-${query}`,
                        movil: query,
                        name: `Juan Perez`,
                        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
                        rating: 4.8,
                        distance: '0.5 km',
                        status: 'available',
                        completed: 10,
                        zone: 'Centro',
                        vehicle: 'Honda Navi ZZZ-456'
                    };
                    state.drivers.push(match);
                }
                assignDriver(match);
            }
        }
    });
    
    renderFilteredDrivers();
    setTimeout(() => newSearchInput.focus(), 100);
}

function assignDriver(driver) {
    const ride = state.rides.find(r => r.id === state.selectedRideId);
    if (ride) {
        // Read potentially adjusted fare before assigning
        const adjustedFare = parseFloat(document.getElementById('input-assign-fare').value) || ride.fare;
        if (adjustedFare !== ride.fare) {
            ride.timeline.push({ time: getSimulatedTime(), label: 'Tarifa Modificada', desc: `Monto ajustado de Bs. ${ride.fare} a Bs. ${adjustedFare} por operador.` });
        }
        ride.fare = adjustedFare;
        ride.initialFare = adjustedFare;
        
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
    
    // Calculate simulated delay tracking for presentation
    let delayText = '';
    if (ride.status === 'assigned') {
        delayText = ' <small class="text-orange" style="display:block; margin-top:4px; font-weight:500;"><i class="fa-solid fa-clock"></i> Esperando recogida...</small>';
    } else if (ride.status === 'ontheway') {
        delayText = ' <small class="text-green" style="display:block; margin-top:4px; font-weight:500;"><i class="fa-solid fa-hourglass-half"></i> En tránsito al destino</small>';
    }
    
    container.innerHTML = `
        <div class="stats-list">
            <div class="stat-row"><span>ID del Viaje</span><strong>${ride.id}</strong></div>
            <div class="stat-row"><span>Empresa</span><strong>${ride.company}</strong></div>
            <div class="stat-row"><span>Pasajero / Solicitante</span><strong>${ride.requester}</strong></div>
            <div class="stat-row"><span>Motoquero Asignado</span><strong>${ride.driver?.name || 'N/A'}</strong></div>
            <div class="stat-row"><span>Vehículo / Placa</span><strong>${ride.driver?.vehicle || 'N/A'}</strong></div>
            <div class="stat-row"><span>Estado Actual</span><div><span class="badge badge-info">${statusLabels[ride.status] || ride.status}</span>${delayText}</div></div>
            <div class="stat-row"><span>Origen</span><strong>${ride.pickup}</strong></div>
            <div class="stat-row"><span>Destino</span><strong>${ride.destination}</strong></div>
            <div class="stat-row"><span>Tarifa Actual</span><strong>Bs. ${ride.fare}</strong></div>
        </div>
        
        <div class="admin-panel" style="margin-top:20px; padding: 12px; background: rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1)">
            <h4 style="margin-bottom:10px;"><i class="fa-solid fa-pen-to-square"></i> Simular Ajuste de Destino / Tarifa (Módulo 7)</h4>
            <div class="role-selector-container" style="background:transparent; border:none; padding:0; margin-bottom:10px;">
                <label>Nuevo Destino</label>
                <input type="text" id="input-new-dest" value="Av. San Martín y 4to Anillo (Desvío)" style="width:100%; padding:8px; border-radius:6px; background:#000; border:1px solid var(--panel-border); color:#fff; outline:none; font-size:13px;">
            </div>
            <div class="role-selector-container" style="background:transparent; border:none; padding:0; margin-bottom:12px;">
                <label>Monto del Ajuste (Bs.)</label>
                <input type="number" id="input-adjust-amount" value="15" style="width:100%; padding:8px; border-radius:6px; background:#000; border:1px solid var(--panel-border); color:#fff; outline:none; font-size:13px;">
            </div>
            <button class="btn btn-primary btn-sm" id="btn-adjust-fare">Aplicar Desvío & Ajuste</button>
        </div>
        
        <div style="margin-top:20px; display:flex; gap:12px;">
            ${ride.status === 'assigned' ? `<button class="btn btn-primary" id="btn-simulate-ontheway">Iniciar Entrega</button>` : ''}
            ${ride.status === 'ontheway' ? `<button class="btn btn-success" id="btn-simulate-completed">Completar Viaje</button>` : ''}
        </div>
    `;
    
    // Bind actions
    document.getElementById('btn-adjust-fare').addEventListener('click', () => {
        const newDest = document.getElementById('input-new-dest').value;
        const adjustAmount = parseFloat(document.getElementById('input-adjust-amount').value);
        applyFareAdjustment(ride, newDest, adjustAmount);
    });
    
    if (ride.status === 'assigned') {
        document.getElementById('btn-simulate-ontheway').addEventListener('click', () => {
            ride.status = 'ontheway';
            ride.timeline.push({ time: getSimulatedTime(), label: 'Motoquero en Camino', desc: 'Paquete/pasajero recogido. En tránsito al destino.' });
            saveStateToStorage();
            openMonitoringModal(ride);
            renderAll();
            showToast('Entrega Iniciada', 'El conductor está en camino al destino con el paquete.', 'warning');
            
            if (state.currentStep === 4) {
                executeDemoStep(5);
            }
        });
    }
    
    if (ride.status === 'ontheway') {
        document.getElementById('btn-simulate-completed').addEventListener('click', () => {
            openCompleteRideModal(ride);
        });
    }
}

function openCompleteRideModal(ride) {
    document.getElementById('modal-monitoring').classList.remove('active');
    
    const modal = document.getElementById('modal-complete-ride');
    modal.classList.add('active');
    
    document.getElementById('complete-ride-fare-label').innerText = `Bs. ${ride.fare}`;
    document.getElementById('complete-ride-observations').value = '';
    
    // Clear and rebind cancel button
    const cancelBtn = document.getElementById('btn-complete-ride-cancel');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        openMonitoringModal(ride);
    });
    
    // Rebind header close close button
    const closeBtn = document.getElementById('btn-modal-complete-close');
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        openMonitoringModal(ride);
    });
    
    // Clear and rebind confirm button
    const confirmBtn = document.getElementById('btn-complete-ride-confirm');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => {
        const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
        const observations = document.getElementById('complete-ride-observations').value;
        
        ride.status = 'completed';
        ride.paymentMethod = paymentMethod;
        ride.observations = observations;
        
        ride.timeline.push({ time: getSimulatedTime(), label: 'Servicio Completado', desc: `Entregado con éxito. Pago: ${paymentMethod}. Obs: ${observations || 'Ninguna'}` });
        ride.timeline.push({ time: getSimulatedTime(), label: 'Ticket Digital Generado', desc: 'Ticket emitido en la facturación del cliente' });
        
        // Update driver balances in real time for presentation!
        updateDriverBalance(paymentMethod, ride.fare);
        
        modal.classList.remove('active');
        saveStateToStorage();
        renderAll();
        openTicketModal(ride);
        showToast('Viaje Completado', `Entrega realizada con éxito. Pago por ${paymentMethod}.`, 'success');
        
        if (state.currentStep === 6) {
            switchTab('billing');
        }
    });
}

function updateDriverBalance(method, amount) {
    if (!state.balances) {
        state.balances = { Efectivo: 350, QR: 480, Ticket: 410 };
    }
    state.balances[method] = (state.balances[method] || 0) + amount;
}

function applyFareAdjustment(ride, newDest, amount) {
    ride.destination = newDest;
    ride.fare += amount;
    ride.adjustments.push({
        type: 'Desvío de Ruta',
        amount: amount,
        reason: 'El cliente solicitó parada adicional en Av. San Martín.'
    });
    ride.timeline.push({ time: getSimulatedTime(), label: 'Ruta Modificada', desc: `Desvío a: ${newDest}. Incremento de Bs. ${amount} aplicado. (Demora: +5 min)` });
    
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
        adjustmentRows += `<div class="ticket-row-print"><span>+ ${adj.type}</span><span>Bs. ${adj.amount}</span></div>`;
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
                <h2>MotoJat</h2>
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
            <div class="ticket-row-print"><span>Tarifa Base</span><span>Bs. ${ride.initialFare}</span></div>
            ${adjustmentRows}
            <div class="ticket-row-print total"><span>TARIFA FINAL</span><span>Bs. ${ride.fare}</span></div>
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
            <td><strong>Bs. ${ride.fare}</strong></td>
            <td>${today}</td>
            <td><span class="badge ${ride.status === 'completed' ? 'badge-success' : 'badge-pending'}">${statusLabels[ride.status] || ride.status}</span></td>
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

// Hook reports dropdowns and tabs
function initReportsNavigation() {
    const btnCompany = document.getElementById('btn-tab-report-company');
    const btnDriver = document.getElementById('btn-tab-report-driver');
    const secCompany = document.getElementById('report-company-section');
    const secDriver = document.getElementById('report-driver-section');
    
    if (btnCompany && btnDriver) {
        btnCompany.addEventListener('click', () => {
            btnCompany.className = 'btn btn-primary btn-sm';
            btnDriver.className = 'btn btn-outline btn-sm';
            secCompany.style.display = 'block';
            secDriver.style.display = 'none';
        });
        btnDriver.addEventListener('click', () => {
            btnDriver.className = 'btn btn-primary btn-sm';
            btnCompany.className = 'btn btn-outline btn-sm';
            secCompany.style.display = 'none';
            secDriver.style.display = 'block';
            populateDriverReportDropdown();
            renderDriverReport();
        });
    }
    
    const selectCompany = document.getElementById('select-report-company');
    if (selectCompany) {
        selectCompany.addEventListener('change', renderCompanyReport);
    }
    
    const selectDriver = document.getElementById('select-report-driver');
    if (selectDriver) {
        selectDriver.addEventListener('change', renderDriverReport);
    }

    const inputCommission = document.getElementById('input-report-commission');
    if (inputCommission) {
        inputCommission.addEventListener('input', () => {
            let val = parseFloat(inputCommission.value);
            if (isNaN(val) || val < 0) val = 0;
            if (val > 100) val = 100;
            renderDriverReport();
        });
    }

    const btnPay = document.getElementById('btn-report-pay-driver');
    if (btnPay) {
        btnPay.addEventListener('click', () => {
            const selectEl = document.getElementById('select-report-driver');
            const driverName = selectEl.options[selectEl.selectedIndex]?.text || 'Conductor';
            
            const commInput = document.getElementById('input-report-commission');
            const commPct = parseFloat(commInput.value) || 0;
            const driverRides = state.rides.filter(r => r.status === 'completed' && r.driver && r.driver.id === selectEl.value);
            const ticketRides = driverRides.filter(r => r.paymentMethod === 'Ticket');
            
            if (ticketRides.length === 0) {
                showToast('Liquidación Vacía', 'Este conductor no registra viajes completados por Ticket para pagar.', 'warning');
                return;
            }

            showToast('Pago Registrado', `Se procesó la liquidación de ${ticketRides.length} tickets para ${driverName} aplicando un ${commPct}% de comisión central.`, 'success');
        });
    }
}

function populateDriverReportDropdown() {
    const select = document.getElementById('select-report-driver');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';
    state.drivers.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.innerText = `Móvil ${d.movil} — ${d.name}`;
        select.appendChild(opt);
    });
    if (currentVal && state.drivers.some(d => d.id === currentVal)) {
        select.value = currentVal;
    }
}

function renderCompanyReport() {
    const selectEl = document.getElementById('select-report-company');
    if (!selectEl) return;
    const company = selectEl.value;
    const tbody = document.getElementById('report-company-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const completedRides = state.rides.filter(r => r.status === 'completed' && r.company === company);
    
    let totalFare = 0;
    completedRides.forEach(r => {
        totalFare += r.fare;
        const tr = document.createElement('tr');
        const today = new Date().toISOString().split('T')[0];
        tr.innerHTML = `
            <td><strong>${r.id}</strong></td>
            <td>${today}</td>
            <td>${r.requester}</td>
            <td><small>${r.pickup} ➔ ${r.destination}</small></td>
            <td><span class="badge badge-info">${r.paymentMethod || 'Ticket'}</span></td>
            <td><strong>Bs. ${r.fare}</strong></td>
            <td>
                <button class="btn btn-outline btn-sm" id="btn-report-view-ticket-${r.id}"><i class="fa-regular fa-eye"></i> Ver</button>
            </td>
        `;
        tbody.appendChild(tr);
        
        document.getElementById(`btn-report-view-ticket-${r.id}`).addEventListener('click', () => {
            openTicketModal(r);
        });
    });
    
    document.getElementById('report-company-total-rides').innerText = completedRides.length;
    document.getElementById('report-company-total-amount').innerText = `Bs. ${totalFare}`;
    
    if (completedRides.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No se registraron consumos para esta empresa en el periodo actual.</td></tr>`;
    }
}

function renderDriverReport() {
    const selectEl = document.getElementById('select-report-driver');
    if (!selectEl || !selectEl.value) return;
    const driverId = selectEl.value;
    const ridesList = document.getElementById('report-driver-rides-list');
    if (!ridesList) return;
    ridesList.innerHTML = '';
    
    const driver = state.drivers.find(d => d.id === driverId);
    if (!driver) return;
    
    const driverRides = state.rides.filter(r => r.status === 'completed' && r.driver && r.driver.id === driverId);
    
    let totalCollected = 0;
    
    let cash = 0;
    let cashCount = 0;
    
    let qr = 0;
    let qrCount = 0;
    
    let ticket = 0;
    let ticketCount = 0;
    
    driverRides.forEach(r => {
        totalCollected += r.fare;
        if (r.paymentMethod === 'Efectivo') {
            cash += r.fare;
            cashCount++;
        } else if (r.paymentMethod === 'QR') {
            qr += r.fare;
            qrCount++;
        } else if (r.paymentMethod === 'Ticket') {
            ticket += r.fare;
            ticketCount++;
        }
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justify = 'space-between';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        row.innerHTML = `
            <span>${r.id} (${r.company})</span>
            <strong>Bs. ${r.fare} <small class="text-muted">(${r.paymentMethod || 'Ticket'})</small></strong>
        `;
        ridesList.appendChild(row);
    });
    
    const commInput = document.getElementById('input-report-commission');
    const commissionPercent = commInput ? (parseFloat(commInput.value) || 0) : 20;
    const driverPercent = 100 - commissionPercent;
    
    const driverShare = Math.round(totalCollected * (driverPercent / 100));
    const commissionAmount = totalCollected - driverShare;
    const settleAmount = driverShare - cash;
    
    document.getElementById('report-driver-total-rides').innerText = driverRides.length;
    document.getElementById('report-driver-total-collected').innerText = `Bs. ${totalCollected}`;
    document.getElementById('report-driver-share').innerText = `Bs. ${driverShare}`;
    document.getElementById('lbl-report-driver-share').innerText = `Ganancia Chofer (${driverPercent}%)`;
    
    document.getElementById('report-driver-bal-cash').innerText = `Bs. ${cash} (${cashCount} viajes)`;
    document.getElementById('report-driver-bal-qr').innerText = `Bs. ${qr} (${qrCount} viajes)`;
    document.getElementById('report-driver-bal-ticket').innerText = `Bs. ${ticket} (${ticketCount} viajes)`;
    document.getElementById('report-driver-commission-amount').innerText = `Bs. ${commissionAmount}`;
    
    const labelEl = document.getElementById('report-driver-settle-label');
    const amountEl = document.getElementById('report-driver-settle-amount');
    
    if (settleAmount >= 0) {
        labelEl.innerText = 'Monto Neto a Transferir al Motoquero:';
        amountEl.innerText = `Bs. ${settleAmount}`;
        amountEl.className = 'text-green';
    } else {
        labelEl.innerText = 'Monto Neto a Rendir por el Motoquero:';
        amountEl.innerText = `Bs. ${Math.abs(settleAmount)}`;
        amountEl.className = 'text-orange';
    }
    
    if (driverRides.length === 0) {
        ridesList.innerHTML = '<div class="text-muted" style="text-align:center; padding:20px;">Este conductor no registra viajes completados.</div>';
    }
}

// Render Reports
function renderReports() {
    renderCompanyReport();
    populateDriverReportDropdown();
    renderDriverReport();
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
    const activeCount = state.rides.filter(r => ['assigned', 'ontheway'].includes(r.status)).length;
    
    animateKPIChange('kpi-pending-rides', pendingCount);
    animateKPIChange('kpi-completed-rides', 38 + completedCount - 1);
    
    document.getElementById('badge-pending-count').innerText = pendingCount;
    document.getElementById('kpi-today-rides').innerText = 42 + state.rides.length - 1;
    
    // Estimate billing
    const baseBilling = 1240;
    const additional = state.rides.reduce((acc, r) => acc + (r.status === 'completed' ? r.fare : 0), 0);
    animateKPIChange('kpi-billing', `Bs. ${baseBilling + additional}`);
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
    renderDriverWallet();
    renderActivityFeed();
    renderNotificationsDropdown();
    updateKPIs();
    updateBalances();
}

function updateBalances() {
    if (!state.balances) {
        state.balances = { Efectivo: 350, QR: 480, Ticket: 410 };
    }
    const cashEl = document.getElementById('balance-cash');
    const qrEl = document.getElementById('balance-qr');
    const ticketEl = document.getElementById('balance-ticket');
    
    if (cashEl) cashEl.innerText = `Bs. ${state.balances.Efectivo}`;
    if (qrEl) qrEl.innerText = `Bs. ${state.balances.QR}`;
    if (ticketEl) ticketEl.innerText = `Bs. ${state.balances.Ticket}`;
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
        4: 'Paso 4: El Motoquero acepta y se dirige al punto de origen (Estado Asignado).',
        5: 'Paso 5: Conductor recoge el paquete/pasajero e inicia entrega (Estado En Camino).',
        6: 'Paso 6: Conductor finaliza el viaje, registra método de pago y genera Ticket.'
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
        // Simular Motoquero Asignado
        const r = state.rides[0];
        if (r) {
            if (!r.driver) r.driver = state.drivers[0];
            r.status = 'assigned';
            r.timeline.push({ time: getSimulatedTime(), label: 'Conductor Asignado', desc: 'Carlos Méndez aceptó y se dirige al punto de origen.' });
        }
        saveStateToStorage();
        switchTab('operations');
        renderAll();
        showToast('Servicio Asignado', 'Carlos Méndez se dirige al punto de recogida.', 'success');
    } else if (stepNum === 5) {
        const r = state.rides[0];
        if (r) {
            r.status = 'ontheway';
            if (r.timeline.length < 3) {
                r.timeline.push({ time: getSimulatedTime(), label: 'Motoquero en Camino', desc: 'Paquete recogido. En tránsito al destino. (Demora recogida: +3 min)' });
            }
        }
        saveStateToStorage();
        switchTab('operations');
        renderAll();
        if (r) openMonitoringModal(r);
    } else if (stepNum === 6) {
        const r = state.rides[0];
        if (r) {
            r.status = 'completed';
            r.paymentMethod = 'Efectivo';
            r.fare = r.fare || 35;
            if (r.timeline.length < 4) {
                r.timeline.push({ time: getSimulatedTime(), label: 'Servicio Completado', desc: 'Entregado con éxito. Pago: Efectivo. Obs: Ninguna. (Demora: +12 min)' });
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
        { pickup: 'Av. Irala 412', destination: 'Equipetrol Calle 9', fare: 25 },
        { pickup: 'Hospital Foianini', destination: 'Km 5 Doble Vía La Guardia', fare: 35 },
        { pickup: 'Laboratorio Chávez Central', destination: 'Pampa de la Isla', fare: 45 }
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
        initialFare: 55,
        fare: 55,
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

// Manual Create Request Modal Opening
document.getElementById('btn-request-ride-manual').addEventListener('click', () => {
    const modal = document.getElementById('modal-new-ride');
    modal.classList.add('active');
    
    document.getElementById('input-new-ride-requester').value = 'Lic. Andrés Mercado';
    document.getElementById('input-new-ride-pickup').value = '4to Anillo Av. Bush';
    document.getElementById('input-new-ride-destination').value = 'Parque Industrial PI-22';
    document.getElementById('input-new-ride-fare').value = '30';
});

// Close triggers
document.getElementById('btn-modal-new-ride-close').addEventListener('click', () => {
    document.getElementById('modal-new-ride').classList.remove('active');
});

document.getElementById('btn-new-ride-cancel').addEventListener('click', () => {
    document.getElementById('modal-new-ride').classList.remove('active');
});

// Create Request trigger
document.getElementById('btn-new-ride-create').addEventListener('click', () => {
    const company = document.getElementById('input-new-ride-company').value;
    const requester = document.getElementById('input-new-ride-requester').value;
    const pickup = document.getElementById('input-new-ride-pickup').value;
    const destination = document.getElementById('input-new-ride-destination').value;
    const fare = parseFloat(document.getElementById('input-new-ride-fare').value) || 30;
    const priority = document.getElementById('input-new-ride-priority').value;
    
    const id = `RIDE-${Math.floor(100 + Math.random() * 900)}`;
    const newRide = {
        id: id,
        company: company,
        requester: requester,
        pickup: pickup,
        destination: destination,
        initialFare: fare,
        fare: fare,
        waitTime: 0,
        elapsedTime: 0.1,
        status: 'pending',
        priority: priority,
        driver: null,
        adjustments: [],
        paymentMethod: null,
        observations: '',
        timeline: [
            { time: getSimulatedTime(), label: 'Solicitud Recibida', desc: `Ingreso al sistema por operador. Tarifa inicial: Bs. ${fare}` }
        ]
    };
    
    state.rides.push(newRide);
    document.getElementById('modal-new-ride').classList.remove('active');
    saveStateToStorage();
    switchTab('operations');
    renderAll();
    
    showToast('Nueva Solicitud', `Ingresada con ID ${id} por Bs. ${fare}`, 'info');
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

let driverActivePeriod = 'month'; // 'day', 'week', 'month'

function initDriverWalletFilters() {
    const btnDay = document.getElementById('btn-driver-filter-day');
    const btnWeek = document.getElementById('btn-driver-filter-week');
    const btnMonth = document.getElementById('btn-driver-filter-month');
    
    if (btnDay && btnWeek && btnMonth) {
        btnDay.addEventListener('click', () => {
            btnDay.className = 'btn btn-primary btn-sm';
            btnWeek.className = 'btn btn-outline btn-sm';
            btnMonth.className = 'btn btn-outline btn-sm';
            driverActivePeriod = 'day';
            renderDriverWallet();
        });
        btnWeek.addEventListener('click', () => {
            btnWeek.className = 'btn btn-outline btn-sm';
            btnDay.className = 'btn btn-outline btn-sm';
            btnMonth.className = 'btn btn-outline btn-sm';
            btnWeek.className = 'btn btn-primary btn-sm';
            driverActivePeriod = 'week';
            renderDriverWallet();
        });
        btnMonth.addEventListener('click', () => {
            btnMonth.className = 'btn btn-primary btn-sm';
            btnDay.className = 'btn btn-outline btn-sm';
            btnWeek.className = 'btn btn-outline btn-sm';
            driverActivePeriod = 'month';
            renderDriverWallet();
        });
    }
}

function renderDriverWallet() {
    const ridesList = document.getElementById('driver-wallet-rides-list');
    if (!ridesList) return;
    ridesList.innerHTML = '';
    
    // Carlos Méndez (Móvil 1) is DRV-01
    const driverId = 'DRV-01';
    
    let driverRides = state.rides.filter(r => r.status === 'completed' && r.driver && r.driver.id === driverId);
    
    // Filter by simulated period
    if (driverActivePeriod === 'day') {
        driverRides = driverRides.slice(0, 1);
    } else if (driverActivePeriod === 'week') {
        driverRides = driverRides.slice(0, 2);
    }
    
    let totalCollected = 0;
    let cash = 0;
    let qr = 0;
    let ticket = 0;
    
    driverRides.forEach(r => {
        totalCollected += r.fare;
        if (r.paymentMethod === 'Efectivo') cash += r.fare;
        else if (r.paymentMethod === 'QR') qr += r.fare;
        else if (r.paymentMethod === 'Ticket') ticket += r.fare;
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justify = 'space-between';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        row.innerHTML = `
            <span><strong>Viaje ${r.id}</strong> — ${r.company}</span>
            <strong>Bs. ${r.fare} <small class="text-muted">(${r.paymentMethod || 'Ticket'})</small></strong>
        `;
        ridesList.appendChild(row);
    });
    
    const driverShare = Math.round(totalCollected * 0.80);
    const settleAmount = driverShare - cash;
    
    document.getElementById('driver-wallet-rides-count').innerText = driverRides.length;
    document.getElementById('driver-wallet-gross-collected').innerText = `Bs. ${totalCollected}`;
    document.getElementById('driver-wallet-net-earned').innerText = `Bs. ${driverShare}`;
    
    document.getElementById('driver-wallet-cash').innerText = `Bs. ${cash}`;
    document.getElementById('driver-wallet-qr').innerText = `Bs. ${qr}`;
    document.getElementById('driver-wallet-ticket').innerText = `Bs. ${ticket}`;
    
    const labelEl = document.getElementById('driver-wallet-settle-label');
    const amountEl = document.getElementById('driver-wallet-settle-amount');
    
    if (settleAmount >= 0) {
        labelEl.innerText = 'Saldo a Cobrar de Central:';
        amountEl.innerText = `Bs. ${settleAmount}`;
        amountEl.className = 'text-green';
    } else {
        labelEl.innerText = 'Saldo a Rendir a Central:';
        amountEl.innerText = `Bs. ${Math.abs(settleAmount)}`;
        amountEl.className = 'text-orange';
    }
    
    if (driverRides.length === 0) {
        ridesList.innerHTML = '<div class="text-muted" style="text-align:center; padding:20px;">No registras carreras en este periodo.</div>';
    }
}

function initDragAndDrop() {
    const containers = {
        pending: document.getElementById('container-pending'),
        assigned: document.getElementById('container-assigned'),
        ontheway: document.getElementById('container-ontheway'),
        completed: document.getElementById('container-completed')
    };
    
    Object.entries(containers).forEach(([status, container]) => {
        if (!container) return;
        
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
        });
        
        container.addEventListener('dragleave', () => {
            container.classList.remove('drag-over');
        });
        
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            
            const rideId = e.dataTransfer.getData('text/plain');
            const ride = state.rides.find(r => r.id === rideId);
            if (!ride) return;
            
            handleRideStatusTransition(ride, status);
        });
    });
}

function handleRideStatusTransition(ride, targetStatus) {
    if (ride.status === targetStatus) return;
    
    if (targetStatus === 'pending') {
        ride.status = 'pending';
        ride.driver = null;
        ride.timeline.push({ time: getSimulatedTime(), label: 'Servicio Reiniciado', desc: 'Operador restableció el viaje a Pendiente.' });
        saveStateToStorage();
        renderAll();
        showToast('Viaje Restablecido', `El servicio ${ride.id} volvió a Pendiente.`, 'info');
    } else if (targetStatus === 'assigned') {
        state.selectedRideId = ride.id;
        openAssignModal();
    } else if (targetStatus === 'ontheway') {
        if (!ride.driver) {
            state.selectedRideId = ride.id;
            openAssignModal();
            showToast('Asignación Requerida', 'Asigne un conductor antes de iniciar el viaje.', 'warning');
            return;
        }
        ride.status = 'ontheway';
        ride.timeline.push({ time: getSimulatedTime(), label: 'Motoquero en Camino', desc: `${ride.driver.name} inició el traslado.` });
        saveStateToStorage();
        renderAll();
        showToast('En Camino', `Servicio ${ride.id} ahora está en camino.`, 'success');
        if (state.currentStep === 4) {
            executeDemoStep(5);
        }
    } else if (targetStatus === 'completed') {
        if (!ride.driver) {
            showToast('Acción Inválida', 'No se puede completar un viaje que no tiene conductor asignado.', 'danger');
            return;
        }
        openCompleteRideModal(ride);
    }
}
