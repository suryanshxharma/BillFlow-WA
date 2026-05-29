// BillFlow WA Frontend Logic

// Global state variables
let currentBusiness = null;
let invoiceItems = [];
let allInvoices = [];
let allCustomers = [];
let allProducts = [];
let paymentPollingInterval = null;
let lastKnownInvoiceStatuses = {};

// Chart.js instances
let salesTrendChart = null;
let paymentDistChart = null;
let topProductsChart = null;

// DOM elements
let tabButtons = [];
let tabContents = [];

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '⚡' : '⚠️'}</span>
        <span class="toast-text">${message}</span>
    `;
    container.appendChild(toast);
    
    // Auto-remove after 3.5 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --- API CLIENT WRAPPER WITH AUTH SUPPORT ---
const API = {
    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('billflow_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },
    async get(endpoint) {
        try {
            const res = await fetch(endpoint, {
                headers: this.getHeaders()
            });
            if (res.status === 401) {
                handleUnauthorized();
                throw new Error("Unauthorized session");
            }
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`GET ${endpoint} failed:`, err);
            return null;
        }
    },
    async post(endpoint, data) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            if (res.status === 401) {
                handleUnauthorized();
                throw new Error("Unauthorized session");
            }
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`POST ${endpoint} failed:`, err);
            showToast('Action failed. Please verify authorization and fields.', 'error');
            return null;
        }
    },
    async put(endpoint, data) {
        try {
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            if (res.status === 401) {
                handleUnauthorized();
                throw new Error("Unauthorized session");
            }
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`PUT ${endpoint} failed:`, err);
            showToast('Update failed. Please verify authorization.', 'error');
            return null;
        }
    },
    async delete(endpoint) {
        try {
            const res = await fetch(endpoint, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            if (res.status === 401) {
                handleUnauthorized();
                throw new Error("Unauthorized session");
            }
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`DELETE ${endpoint} failed:`, err);
            showToast('Failed to delete resource. Verification required.', 'error');
            return null;
        }
    }
};

// --- AUTHENTICATION & ACCESS STATE ---
function getLoggedInUser() {
    const userJson = localStorage.getItem('billflow_user');
    return userJson ? JSON.parse(userJson) : null;
}

function handleUnauthorized() {
    localStorage.removeItem('billflow_token');
    localStorage.removeItem('billflow_user');
    document.getElementById('login-overlay').style.display = 'flex';
    if (paymentPollingInterval) {
        clearInterval(paymentPollingInterval);
        paymentPollingInterval = null;
    }
}

async function checkAuthState() {
    const token = localStorage.getItem('billflow_token');
    if (!token) {
        handleUnauthorized();
        return false;
    }
    
    const profile = await API.get('/api/auth/me');
    if (!profile) {
        handleUnauthorized();
        return false;
    }
    
    localStorage.setItem('billflow_user', JSON.stringify(profile));
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';
    
    // Setup Sidebar view details defensive checks
    const nameEl = document.getElementById('nav-profile-name');
    if (nameEl) nameEl.innerText = profile.name;
    
    const picEl = document.getElementById('nav-profile-pic');
    if (picEl) picEl.innerText = profile.name.charAt(0).toUpperCase();
    
    const roleEl = document.getElementById('nav-profile-role');
    if (roleEl) roleEl.innerText = profile.role;
    
    // Apply Role UI Filter rules
    applyRoleBasedPermissions(profile.role);
    
    // Start standard dashboard loads
    await loadBusinessProfile();
    loadDashboardData();
    startPaymentPolling();
    return true;
}

function applyRoleBasedPermissions(role) {
    const campaignsBtn = document.querySelector('[data-tab="campaigns-tab"]');
    const settingsBtn = document.querySelector('[data-tab="settings-tab"]');
    const analyticsContainer = document.getElementById('dashboard-analytics-container');
    const userCard = document.getElementById('settings-user-directory-card');
    
    if (role === 'Staff') {
        // Staff view rules: Hide campaigns, full settings, and analytics
        if (campaignsBtn) campaignsBtn.style.display = 'none';
        if (settingsBtn) settingsBtn.style.display = 'none';
        if (analyticsContainer) analyticsContainer.style.display = 'none';
        if (userCard) userCard.style.display = 'none';
    } else {
        // Owner view rules: Show all features
        if (campaignsBtn) campaignsBtn.style.display = 'flex';
        if (settingsBtn) settingsBtn.style.display = 'flex';
        if (analyticsContainer) analyticsContainer.style.display = 'grid';
        if (userCard) userCard.style.display = 'block';
    }
}

function setupAuthListeners() {
    // 1. Login Form Submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        // Clear error alert on input/focus
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const hideAlert = () => {
            const errorAlert = document.getElementById('login-error-alert');
            if (errorAlert) errorAlert.style.display = 'none';
        };
        if (usernameInput) usernameInput.addEventListener('input', hideAlert);
        if (passwordInput) passwordInput.addEventListener('input', hideAlert);

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const payload = {
                username: document.getElementById('login-username').value.trim(),
                password: document.getElementById('login-password').value
            };
            
            const res = await API.post('/api/auth/login', payload);
            if (res) {
                // Clear error alert if any
                const errorAlert = document.getElementById('login-error-alert');
                if (errorAlert) errorAlert.style.display = 'none';
                
                localStorage.setItem('billflow_token', res.token);
                localStorage.setItem('billflow_user', JSON.stringify(res.user));
                showToast(`Welcome back, ${res.user.name}!`);
                
                document.getElementById('login-username').value = '';
                document.getElementById('login-password').value = '';
                
                const logged = await checkAuthState();
                if (logged) {
                    switchTab('dashboard-tab');
                }
            } else {
                // Show error alert on login overlay
                const errorAlert = document.getElementById('login-error-alert');
                const errorText = document.getElementById('login-error-text');
                if (errorAlert && errorText) {
                    errorText.innerText = 'Invalid username or password. Please try again.';
                    errorAlert.style.display = 'block';
                    
                    // Add a shake effect to the card for premium physical feedback!
                    const loginCard = errorAlert.parentElement;
                    if (loginCard) {
                        loginCard.classList.remove('shake');
                        void loginCard.offsetWidth; // Trigger reflow to restart animation
                        loginCard.classList.add('shake');
                        
                        // Clean up class after animation ends so it can shake again later
                        setTimeout(() => loginCard.classList.remove('shake'), 600);
                    }
                }
                showToast('Invalid credentials. Please try again.', 'error');
            }
        });
    }
    
    // 2. Logout Trigger
    const logoutBtn = document.getElementById('sidebar-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to log out of your session?')) {
                await API.post('/api/auth/logout');
                handleUnauthorized();
                showToast('You have been logged out.');
            }
        });
    }
}

// --- USER ADMINISTRATION SERVICES (Owner-Only) ---
async function loadUserDirectory() {
    const user = getLoggedInUser();
    if (!user || user.role !== 'Owner') return;
    
    const users = await API.get('/api/users') || [];
    const tbody = document.getElementById('users-list-tbody');
    tbody.innerHTML = '';
    
    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty">No accounts provisioned.</td></tr>`;
        return;
    }
    
    users.forEach(u => {
        const row = document.createElement('tr');
        const isSelf = u.username === user.username || u.username === 'admin';
        const deleteButton = isSelf 
            ? `<span style="font-size:0.75rem; color:var(--text-secondary)">Default / Self</span>`
            : `<button class="btn btn-sm btn-remove-row" onclick="deleteAccessUser(${u.id})">✕</button>`;
            
        row.innerHTML = `
            <td><b>${u.name}</b></td>
            <td><code style="font-family:var(--font-mono)">${u.username}</code></td>
            <td><span class="badge" style="background:${u.role === 'Owner' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)'}; color:${u.role === 'Owner' ? '#10b981' : '#818cf8'}; border: 1px solid ${u.role === 'Owner' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}; font-size:0.7rem;">${u.role}</span></td>
            <td style="text-align: right;">${deleteButton}</td>
        `;
        tbody.appendChild(row);
    });
}

function setupUserManagement() {
    const userForm = document.getElementById('add-user-form');
    if (!userForm) return;
    
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            username: document.getElementById('user-username').value.trim(),
            name: document.getElementById('user-name').value.trim(),
            password: document.getElementById('user-password').value,
            role: document.getElementById('user-role').value
        };
        
        if (payload.password.length < 6) {
            showToast('Password must be at least 6 characters.', 'error');
            return;
        }
        
        const res = await API.post('/api/users', payload);
        if (res) {
            showToast(`Account successfully created for ${res.name}`);
            document.getElementById('user-username').value = '';
            document.getElementById('user-name').value = '';
            document.getElementById('user-password').value = '';
            loadUserDirectory();
        }
    });
}

async function deleteAccessUser(id) {
    if (confirm('Are you absolutely sure you want to delete this staff access account?')) {
        const res = await API.delete(`/api/users/${id}`);
        if (res) {
            showToast('Account deleted successfully.');
            loadUserDirectory();
        }
    }
}

// --- SLEEK SALES ANALYTICS SERVICES (Owner-Only) ---
async function renderSalesTrendChart() {
    const data = await API.get('/api/analytics/sales-trend') || [];
    const chartEl = document.getElementById('chart-sales-trend');
    if (!chartEl) return;
    
    const ctx = chartEl.getContext('2d');
    const labels = data.map(d => formatDateString(d.date));
    const totals = data.map(d => d.total);
    
    if (salesTrendChart) {
        salesTrendChart.destroy();
    }
    
    salesTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Sales',
                data: totals,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#10b981',
                pointBorderColor: 'rgba(255,255,255,0.8)',
                pointRadius: 3.5,
                pointHoverRadius: 5.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    titleColor: 'white',
                    bodyColor: '#10b981',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleFont: { family: 'Plus Jakarta Sans', size: 11, weight: 'bold' },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    callbacks: {
                        label: function(context) {
                            const currency = currentBusiness ? currentBusiness.currency : '₹';
                            return ` Sales: ${currency}${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Plus Jakarta Sans', size: 9 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        font: { family: 'Plus Jakarta Sans', size: 9 },
                        callback: function(value) {
                            const currency = currentBusiness ? currentBusiness.currency : '₹';
                            return currency + value;
                        }
                    }
                }
            }
        }
    });
}

async function renderPaymentDistChart() {
    const data = await API.get('/api/analytics/payment-distribution') || [];
    const chartEl = document.getElementById('chart-payment-dist');
    if (!chartEl) return;
    
    const ctx = chartEl.getContext('2d');
    const labels = data.map(d => d.method);
    const totals = data.map(d => d.total);
    
    if (paymentDistChart) {
        paymentDistChart.destroy();
    }
    
    paymentDistChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: totals,
                backgroundColor: ['#6366f1', '#10b981', '#fbbf24'],
                borderColor: 'rgba(15,23,42,0.9)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: 'rgba(255,255,255,0.65)', font: { family: 'Plus Jakarta Sans', size: 10 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    titleFont: { family: 'Plus Jakarta Sans', size: 11 },
                    bodyFont: { family: 'JetBrains Mono', size: 12 },
                    callbacks: {
                        label: function(context) {
                            const currency = currentBusiness ? currentBusiness.currency : '₹';
                            return ` Total: ${currency}${context.parsed.toFixed(2)}`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

async function renderTopProductsChart() {
    const data = await API.get('/api/analytics/top-products') || [];
    const chartEl = document.getElementById('chart-top-products');
    if (!chartEl) return;
    
    const ctx = chartEl.getContext('2d');
    const labels = data.map(d => d.name);
    const quantities = data.map(d => d.quantity);
    
    if (topProductsChart) {
        topProductsChart.destroy();
    }
    
    topProductsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: quantities,
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderColor: '#6366f1',
                borderWidth: 1.2,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    callbacks: {
                        label: function(context) {
                            return ` Sold: ${context.parsed.x} units`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Plus Jakarta Sans', size: 8 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: 'rgba(255,255,255,0.65)', font: { family: 'Plus Jakarta Sans', size: 8 } }
                }
            }
        }
    });
}


// --- INTERACTIVE SPA ROUTER ---
function switchTab(tabId) {
    // Deactivate all
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active-tab'));
    
    // Activate target
    const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
    const targetContent = document.getElementById(tabId);
    
    if (targetBtn && targetContent) {
        targetBtn.classList.add('active');
        targetContent.classList.add('active-tab');
    }
    
    // Refresh page data depending on target tab
    if (tabId === 'dashboard-tab') {
        loadDashboardData();
    } else if (tabId === 'invoices-tab') {
        loadInvoicesRegistry();
    } else if (tabId === 'customers-tab') {
        loadCustomersRegistry();
    } else if (tabId === 'campaigns-tab') {
        loadCampaignsData();
    } else if (tabId === 'products-tab') {
        loadProductsCatalog();
    } else if (tabId === 'create-bill-tab') {
        resetPOSForm();
    } else if (tabId === 'settings-tab') {
        loadBusinessProfile();
        loadUserDirectory();
    }
}

// --- INITIAL ENGINE START ---
async function initializeApp() {
    // Dynamically query DOM elements to prevent timing issues
    tabButtons = document.querySelectorAll('.nav-item');
    tabContents = document.querySelectorAll('.tab-content');
    
    // Bind navigation clicks
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    setupAuthListeners();
    setupPOSListeners();
    setupSettingsListeners();
    setupCampaignListeners();
    setupProductListeners();
    setupUserManagement();
    
    await checkAuthState();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// --- BUSINESS PROFILE MANAGER ---
async function loadBusinessProfile() {
    const data = await API.get('/api/business');
    if (data) {
        currentBusiness = data;
        
        // Sync Sidebar Profile UI
        document.getElementById('nav-profile-name').innerText = currentBusiness.name;
        document.getElementById('nav-profile-pic').innerText = currentBusiness.name.charAt(0).toUpperCase();
        
        // Sync Settings Tab inputs
        document.getElementById('set-biz-name').value = currentBusiness.name;
        document.getElementById('set-owner-name').value = currentBusiness.owner_name || '';
        document.getElementById('set-biz-phone').value = currentBusiness.phone || '';
        document.getElementById('set-biz-email').value = currentBusiness.email || '';
        document.getElementById('set-biz-address').value = currentBusiness.address || '';
        document.getElementById('set-biz-logo').value = currentBusiness.logo_url || '';
        document.getElementById('set-currency').value = currentBusiness.currency || '₹';
        document.getElementById('set-tax-label').value = currentBusiness.tax_id_label || 'GSTIN';
        document.getElementById('set-tax-number').value = currentBusiness.tax_id_number || '';
        document.getElementById('set-wa-template').value = currentBusiness.whatsapp_template;
        
        // Render WhatsApp Preview Bubble
        updateWhatsAppTemplatePreview();
    }
}

// Save Settings Form
function setupSettingsListeners() {
    const settingsForm = document.getElementById('settings-form');
    const waTemplateInput = document.getElementById('set-wa-template');
    
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            name: document.getElementById('set-biz-name').value,
            owner_name: document.getElementById('set-owner-name').value,
            phone: document.getElementById('set-biz-phone').value,
            email: document.getElementById('set-biz-email').value,
            address: document.getElementById('set-biz-address').value,
            logo_url: document.getElementById('set-biz-logo').value,
            currency: document.getElementById('set-currency').value || '₹',
            tax_id_label: document.getElementById('set-tax-label').value || 'GSTIN',
            tax_id_number: document.getElementById('set-tax-number').value,
            upi_id: document.getElementById('set-upi-id').value,
            whatsapp_template: waTemplateInput.value
        };
        
        const res = await API.put('/api/business', payload);
        if (res) {
            currentBusiness = res;
            showToast('Store configuration successfully saved!');
            loadBusinessProfile();
        }
    });

    waTemplateInput.addEventListener('input', updateWhatsAppTemplatePreview);
    
    // Fetch UPI ID separately to populate in input field
    API.get('/api/business').then(biz => {
        if (biz && biz.upi_id) {
            document.getElementById('set-upi-id').value = biz.upi_id;
        }
    });
}

// Generate Live WhatsApp Text Mockup
function updateWhatsAppTemplatePreview() {
    const template = document.getElementById('set-wa-template').value;
    const previewContainer = document.getElementById('set-wa-text-preview');
    
    if (!template || !currentBusiness) return;
    
    // Replace mockup values
    let previewText = template
        .replace(/{customer_name}/g, 'Rahul Sharma')
        .replace(/{business_name}/g, currentBusiness.name)
        .replace(/{invoice_number}/g, 'BF-20260525-0001')
        .replace(/{currency}/g, currentBusiness.currency)
        .replace(/{total_amount}/g, '1,450.00')
        .replace(/{invoice_url}/g, `${window.location.origin}/receipt/f8941094-81d7-4148-8eb1-140b9ad43202`);
    
    // Convert bold *word* to <b>word</b> for aesthetic render in browser chat
    previewText = previewText.replace(/\*(.*?)\*/g, '<b>$1</b>');
    // Convert newlines to HTML breaks
    previewText = previewText.replace(/\n/g, '<br>');
    
    previewContainer.innerHTML = previewText;
}


// --- DASHBOARD LOADER ---
async function loadDashboardData() {
    const invoices = await API.get('/api/invoices') || [];
    const customers = await API.get('/api/customers') || [];
    
    allInvoices = invoices;
    allCustomers = customers;
    
    // Seed lastKnownInvoiceStatuses on first load
    const isFirstLoad = Object.keys(lastKnownInvoiceStatuses).length === 0;
    invoices.forEach(inv => {
        if (isFirstLoad) {
            lastKnownInvoiceStatuses[inv.invoice_number] = inv.payment_status;
        }
    });
    
    // 1. Calculate Metrics
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    let salesToday = 0.0;
    let pendingCount = 0;
    
    invoices.forEach(inv => {
        // SQLite stores date as YYYY-MM-DD string, match it
        if (inv.date === todayStr && inv.payment_status === 'Paid') {
            salesToday += inv.grand_total;
        }
        if (inv.payment_status === 'Unpaid') {
            pendingCount++;
        }
    });
    
    const currency = currentBusiness ? currentBusiness.currency : '₹';
    document.getElementById('stat-sales').innerText = `${currency}${salesToday.toFixed(2)}`;
    document.getElementById('stat-invoices').innerText = invoices.length;
    document.getElementById('stat-customers').innerText = customers.length;
    document.getElementById('stat-pending').innerText = pendingCount;
    
    // Render sales analytics charts for Owners
    const user = getLoggedInUser();
    if (user && user.role === 'Owner') {
        renderSalesTrendChart();
        renderPaymentDistChart();
        renderTopProductsChart();
    }
    
    // 2. Populate Recent Invoices List
    const tbody = document.getElementById('recent-invoices-tbody');
    tbody.innerHTML = '';
    
    const recent = invoices.slice(0, 5);
    
    if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No invoices generated yet. Click "Create Invoice" to begin!</td></tr>`;
        return;
    }
    
    recent.forEach(inv => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><b>${inv.invoice_number}</b></td>
            <td>${inv.customer.name}</td>
            <td>${formatDateString(inv.date)}</td>
            <td><b>${currency}${inv.grand_total.toFixed(2)}</b></td>
            <td><span class="badge badge-${inv.payment_status.toLowerCase()}">${inv.payment_status}</span></td>
            <td>
                <div class="search-actions">
                    <button class="btn btn-sm btn-secondary" onclick="openHostedReceipt('${inv.invoice_hash}')">👁️ View</button>
                    <button class="btn btn-sm btn-outline" onclick="triggerWhatsAppRedirect(${inv.id})">💬 Send WA</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}


// --- CREATOR (POS) SYSTEM ---
function resetPOSForm() {
    document.getElementById('pos-cust-name').value = '';
    document.getElementById('pos-cust-phone').value = '';
    document.getElementById('pos-cust-email').value = '';
    document.getElementById('pos-cust-address').value = '';
    document.getElementById('pos-notes').value = '';
    
    invoiceItems = [];
    document.getElementById('pos-items-rows').innerHTML = '';
    
    // Add default single empty item row
    addPOSItemRow();
    
    // Refresh visual receipt preview
    updatePOSReceiptPreview();
}

function addPOSItemRow() {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    const item = {
        id: id,
        name: '',
        quantity: 1,
        rate: 0.0,
        tax_rate: 18.0, // Standard default tax rate (GST)
        discount_rate: 0.0
    };
    
    invoiceItems.push(item);
    
    const rowsContainer = document.getElementById('pos-items-rows');
    const rowEl = document.createElement('div');
    rowEl.className = 'pos-item-row';
    rowEl.id = `row-${id}`;
    
    rowEl.innerHTML = `
        <div class="autocomplete-container">
            <input type="text" placeholder="Product or Service Name" class="input-name" required autocomplete="off">
            <span class="stock-indicator" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem; display: none;"></span>
            <div class="suggestions-dropdown" style="display: none;"></div>
        </div>
        <input type="number" style="flex: 0.8; text-align: center;" value="1" min="1" step="any" class="input-qty">
        <input type="number" style="flex: 1.2;" placeholder="0.00" min="0" step="any" class="input-rate">
        <input type="number" style="flex: 0.9;" value="18" min="0" max="100" step="any" class="input-tax">
        <input type="number" style="flex: 0.9;" value="0" min="0" max="100" step="any" class="input-disc">
        <div style="flex: 1.2;" class="pos-item-total">₹0.00</div>
        <button type="button" style="flex: 0.4;" class="btn-remove-row">✕</button>
    `;
    
    rowsContainer.appendChild(rowEl);
    
    // Bind listeners to row inputs
    const inputs = {
        name: rowEl.querySelector('.input-name'),
        qty: rowEl.querySelector('.input-qty'),
        rate: rowEl.querySelector('.input-rate'),
        tax: rowEl.querySelector('.input-tax'),
        disc: rowEl.querySelector('.input-disc'),
        total: rowEl.querySelector('.pos-item-total'),
        remove: rowEl.querySelector('.btn-remove-row')
    };
    
    const suggestionsBox = rowEl.querySelector('.suggestions-dropdown');
    const stockIndicator = rowEl.querySelector('.stock-indicator');
    
    const calculateRow = () => {
        item.quantity = parseFloat(inputs.qty.value) || 0;
        item.rate = parseFloat(inputs.rate.value) || 0;
        item.tax_rate = parseFloat(inputs.tax.value) || 0;
        item.discount_rate = parseFloat(inputs.disc.value) || 0;
        
        // Item financial math:
        const base = item.rate * item.quantity;
        const discount = base * (item.discount_rate / 100);
        const discounted = base - discount;
        const tax = discounted * (item.tax_rate / 100);
        const rowTotal = discounted + tax;
        
        const currency = currentBusiness ? currentBusiness.currency : '₹';
        inputs.total.innerText = `${currency}${rowTotal.toFixed(2)}`;
        
        updatePOSReceiptPreview();
    };
    
    inputs.name.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        item.name = e.target.value;
        updatePOSReceiptPreview();
        
        if (query.length < 2) {
            suggestionsBox.style.display = 'none';
            return;
        }
        
        const matches = await API.get(`/api/products/search?q=${encodeURIComponent(query)}`);
        if (matches && matches.length > 0) {
            suggestionsBox.innerHTML = '';
            matches.forEach(prod => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `
                    <div class="suggestion-name">${prod.name}</div>
                    <div class="suggestion-phone">Rate: ${currentBusiness ? currentBusiness.currency : '₹'}${prod.rate.toFixed(2)} | Stock: ${prod.stock}</div>
                `;
                div.addEventListener('click', () => {
                    inputs.name.value = prod.name;
                    item.name = prod.name;
                    
                    inputs.rate.value = prod.rate;
                    item.rate = prod.rate;
                    
                    inputs.tax.value = prod.tax_rate;
                    item.tax_rate = prod.tax_rate;
                    
                    // Show stock indicator
                    stockIndicator.style.display = 'block';
                    if (prod.stock === 0) {
                        stockIndicator.innerText = `Out of stock!`;
                        stockIndicator.style.color = '#ef4444';
                    } else if (prod.stock < 5) {
                        stockIndicator.innerText = `Low stock: ${prod.stock} left`;
                        stockIndicator.style.color = '#f59e0b';
                    } else {
                        stockIndicator.innerText = `In stock: ${prod.stock}`;
                        stockIndicator.style.color = '#10b981';
                    }
                    
                    suggestionsBox.style.display = 'none';
                    calculateRow();
                });
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    });
    
    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (e.target !== inputs.name) {
            suggestionsBox.style.display = 'none';
        }
    });
    
    inputs.qty.addEventListener('input', calculateRow);
    inputs.rate.addEventListener('input', calculateRow);
    inputs.tax.addEventListener('input', calculateRow);
    inputs.disc.addEventListener('input', calculateRow);
    
    inputs.remove.addEventListener('click', () => {
        invoiceItems = invoiceItems.filter(x => x.id !== id);
        rowEl.remove();
        updatePOSReceiptPreview();
    });
    
    updatePOSReceiptPreview();
}

// Autocomplete customer selection setup
function setupPOSListeners() {
    document.getElementById('add-item-btn').addEventListener('click', addPOSItemRow);
    
    const custNameInput = document.getElementById('pos-cust-name');
    const custPhoneInput = document.getElementById('pos-cust-phone');
    const custEmailInput = document.getElementById('pos-cust-email');
    const custAddressInput = document.getElementById('pos-cust-address');
    
    const suggestionsBox = document.getElementById('customer-suggestions');
    
    custNameInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        updatePOSReceiptPreview();
        
        if (query.length < 2) {
            suggestionsBox.style.display = 'none';
            return;
        }
        
        const matches = await API.get(`/api/customers/search?q=${encodeURIComponent(query)}`);
        if (matches && matches.length > 0) {
            suggestionsBox.innerHTML = '';
            matches.forEach(cust => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `
                    <div class="suggestion-name">${cust.name}</div>
                    <div class="suggestion-phone">${cust.phone}</div>
                `;
                div.addEventListener('click', () => {
                    custNameInput.value = cust.name;
                    custPhoneInput.value = cust.phone;
                    custEmailInput.value = cust.email || '';
                    custAddressInput.value = cust.address || '';
                    suggestionsBox.style.display = 'none';
                    updatePOSReceiptPreview();
                });
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    });
    
    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (e.target !== custNameInput) {
            suggestionsBox.style.display = 'none';
        }
    });
    
    custPhoneInput.addEventListener('input', updatePOSReceiptPreview);
    
    // Save buttons
    document.getElementById('btn-save-send').addEventListener('click', () => submitInvoice(true));
    document.getElementById('btn-save-only').addEventListener('click', () => submitInvoice(false));
}

// Calculate total bill sums and update receipt mockup
function updatePOSReceiptPreview() {
    if (!currentBusiness) return;
    
    const custName = document.getElementById('pos-cust-name').value || '-';
    const custPhone = document.getElementById('pos-cust-phone').value || '-';
    
    // Header mock
    document.getElementById('r-preview-biz-name').innerText = currentBusiness.name;
    document.getElementById('r-preview-biz-address').innerText = currentBusiness.address || '';
    
    const logoSpot = document.getElementById('r-preview-logo');
    if (currentBusiness.logo_url) {
        logoSpot.innerHTML = `<img src="${currentBusiness.logo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">`;
    } else {
        logoSpot.innerText = currentBusiness.name.charAt(0).toUpperCase();
    }
    
    // Date & Client details
    document.getElementById('r-preview-cust-name').innerText = custName;
    document.getElementById('r-preview-cust-phone').innerText = custPhone;
    document.getElementById('r-preview-date').innerText = formatDateString(new Date().toISOString().split('T')[0]);
    
    // Calculate items
    let subtotal = 0.0;
    let discountTotal = 0.0;
    let taxTotal = 0.0;
    
    const itemsTbody = document.getElementById('r-preview-items-body');
    itemsTbody.innerHTML = '';
    
    let activeItemsCount = 0;
    
    invoiceItems.forEach(item => {
        if (!item.name) return; // Skip unnamed items in preview
        
        activeItemsCount++;
        
        const itemBase = item.rate * item.quantity;
        const itemDisc = itemBase * (item.discount_rate / 100);
        const itemDiscounted = itemBase - itemDisc;
        const itemTax = itemDiscounted * (item.tax_rate / 100);
        const itemTotal = itemDiscounted + itemTax;
        
        subtotal += itemBase;
        discountTotal += itemDisc;
        taxTotal += itemTax;
        
        const row = document.createElement('div');
        row.className = 'r-item-row';
        row.innerHTML = `
            <div>${item.name}</div>
            <div style="text-align: center;">${item.quantity}</div>
            <div style="text-align: right;">${currentBusiness.currency}${itemTotal.toFixed(2)}</div>
            <div class="r-item-meta">
                ${currentBusiness.currency}${item.rate.toFixed(2)}
                ${item.discount_rate > 0 ? ` (-${item.discount_rate}% off)` : ''}
                ${item.tax_rate > 0 ? ` (+${item.tax_rate}% tax)` : ''}
            </div>
        `;
        itemsTbody.appendChild(row);
    });
    
    if (activeItemsCount === 0) {
        itemsTbody.innerHTML = `<div class="r-item-empty">No items added yet</div>`;
    }
    
    const grandTotal = subtotal - discountTotal + taxTotal;
    
    // Set totals
    const cur = currentBusiness.currency;
    document.getElementById('r-preview-subtotal').innerText = `${cur}${subtotal.toFixed(2)}`;
    document.getElementById('r-preview-discount').innerText = `-${cur}${discountTotal.toFixed(2)}`;
    document.getElementById('r-preview-tax').innerText = `+${cur}${taxTotal.toFixed(2)}`;
    document.getElementById('r-preview-grand').innerText = `${cur}${grandTotal.toFixed(2)}`;
}

// Submit Invoice creation payload to API
async function submitInvoice(triggerWA = true) {
    const custName = document.getElementById('pos-cust-name').value.trim();
    const custPhone = document.getElementById('pos-cust-phone').value.trim();
    const custEmail = document.getElementById('pos-cust-email').value.trim();
    const custAddress = document.getElementById('pos-cust-address').value.trim();
    const notes = document.getElementById('pos-notes').value.trim();
    const paymentMethod = document.getElementById('pos-payment-method').value;
    
    if (!custName || !custPhone) {
        showToast('Customer Name and WhatsApp Number are required!', 'error');
        return;
    }
    
    // Filter out invalid items
    const validItems = invoiceItems.filter(item => item.name && item.rate >= 0 && item.quantity > 0);
    if (validItems.length === 0) {
        showToast('Please add at least one valid item!', 'error');
        return;
    }
    
    const payload = {
        customer_name: custName,
        customer_phone: custPhone,
        customer_email: custEmail || null,
        customer_address: custAddress || null,
        items: validItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            rate: item.rate,
            tax_rate: item.tax_rate,
            discount_rate: item.discount_rate
        })),
        payment_method: paymentMethod,
        notes: notes || null
    };
    
    showToast('Saving invoice in registry...', 'success');
    
    const response = await API.post('/api/invoices', payload);
    if (response) {
        showToast(`Invoice ${response.invoice_number} created successfully!`);
        
        if (triggerWA) {
            // Initiate WhatsApp redirection
            executeWhatsAppRedirect(response);
        } else {
            // Local mode: open print prompt immediately
            openHostedReceipt(response.invoice_hash);
        }
        
        // Reset form & reload dashboard overview
        resetPOSForm();
        switchTab('dashboard-tab');
    }
}

// Build text message and open WhatsApp Web/App
function executeWhatsAppRedirect(invoice) {
    if (!currentBusiness) return;
    
    const customer = invoice.customer;
    const invoiceUrl = `${window.location.origin}/receipt/${invoice.invoice_hash}`;
    
    // Dynamic text replacements
    let message = currentBusiness.whatsapp_template
        .replace(/{customer_name}/g, customer.name)
        .replace(/{business_name}/g, currentBusiness.name)
        .replace(/{invoice_number}/g, invoice.invoice_number)
        .replace(/{currency}/g, currentBusiness.currency)
        .replace(/{total_amount}/g, invoice.grand_total.toFixed(2))
        .replace(/{invoice_url}/g, invoiceUrl);
        
    const cleanPhone = customer.phone.replace(/\+/g, '').replace(/ /g, '');
    const encodedMsg = encodeURIComponent(message);
    
    // Standard Universal WhatsApp Link format
    const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
    
    showToast('Redirecting to WhatsApp...', 'success');
    window.open(waLink, '_blank');
}

// Fetch invoice detail first, then trigger redirect
async function triggerWhatsAppRedirect(invoiceId) {
    const inv = allInvoices.find(x => x.id === invoiceId);
    if (inv) {
        executeWhatsAppRedirect(inv);
    } else {
        showToast('Failed to locate invoice.', 'error');
    }
}

// Helper: open hosted receipt page in new tab
function openHostedReceipt(hash) {
    window.open(`/receipt/${hash}`, '_blank');
}


// --- INVOICE REGISTRY ---
async function loadInvoicesRegistry() {
    const invoices = await API.get('/api/invoices') || [];
    allInvoices = invoices;
    
    const tbody = document.getElementById('invoices-list-tbody');
    tbody.innerHTML = '';
    
    if (invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No invoices found in registry.</td></tr>`;
        return;
    }
    
    const currency = currentBusiness ? currentBusiness.currency : '₹';
    
    invoices.forEach(inv => {
        const row = document.createElement('tr');
        const user = getLoggedInUser();
        const deleteButton = (user && user.role === 'Owner') 
            ? `<button class="btn btn-sm btn-remove-row" onclick="deleteInvoiceRegistry(${inv.id})" style="padding: 0 0.5rem; font-size:1.1rem;">✕</button>`
            : '';
            
        row.innerHTML = `
            <td><b>${inv.invoice_number}</b></td>
            <td>
                <div><b>${inv.customer.name}</b></div>
                <div style="font-size:0.75rem;color:var(--text-secondary);font-family:var(--font-mono)">${inv.customer.phone}</div>
            </td>
            <td>${formatDateString(inv.date)}</td>
            <td>${inv.payment_method}</td>
            <td><b>${currency}${inv.grand_total.toFixed(2)}</b></td>
            <td>
                <select class="status-selector" onchange="updatePaymentStatus(${inv.id}, this.value)" style="padding: 0.25rem 0.5rem; font-size:0.75rem;">
                    <option value="Unpaid" ${inv.payment_status === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
                    <option value="Paid" ${inv.payment_status === 'Paid' ? 'selected' : ''}>Paid</option>
                    <option value="Cancelled" ${inv.payment_status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </td>
            <td>
                <div class="search-actions">
                    <button class="btn btn-sm btn-secondary" onclick="openHostedReceipt('${inv.invoice_hash}')">👁️ View</button>
                    <button class="btn btn-sm btn-outline" onclick="triggerWhatsAppRedirect(${inv.id})">💬 Share</button>
                    ${deleteButton}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function updatePaymentStatus(id, newStatus) {
    const res = await API.put(`/api/invoices/${id}/status`, { status: newStatus });
    if (res) {
        showToast(`Payment status updated to ${newStatus}`);
        if (newStatus === 'Paid') {
            playCashRegisterSound();
        }
        loadDashboardData();
        loadProductsCatalog(); // Ensure stock count is refreshed in the catalog
    }
}

async function deleteInvoiceRegistry(id) {
    if (confirm('Are you absolutely sure you want to delete this invoice? This action is permanent.')) {
        const res = await API.delete(`/api/invoices/${id}`);
        if (res) {
            showToast('Invoice deleted.');
            loadInvoicesRegistry();
            loadDashboardData();
            loadProductsCatalog(); // Ensure stock count is refreshed in the catalog
        }
    }
}


// --- CUSTOMER REGISTRY ---
async function loadCustomersRegistry() {
    const customers = await API.get('/api/customers') || [];
    allCustomers = customers;
    
    const tbody = document.getElementById('customers-list-tbody');
    tbody.innerHTML = '';
    
    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No customers cataloged yet.</td></tr>`;
        return;
    }
    
    customers.forEach(cust => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><b>${cust.name}</b></td>
            <td style="font-family:var(--font-mono)">${cust.phone}</td>
            <td>${cust.email || '-'}</td>
            <td>${cust.address || '-'}</td>
            <td>${formatDateString(cust.created_at.split('T')[0])}</td>
        `;
        tbody.appendChild(row);
    });
}


// --- UTILITY FORMATTERS ---
function formatDateString(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    
    // YYYY-MM-DD -> DD-MMM-YYYY
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = parseInt(parts[2]);
    const monthIndex = parseInt(parts[1]) - 1;
    const year = parts[0];
    
    return `${day} ${months[monthIndex]} ${year}`;
}

// --- CAMPAIGNS (MASS MESSAGING) ENGINE ---

// Global state for campaigns
let activeCampaign = null;
let campaignQueue = [];
let campaignQueueIndex = 0;
let campaignQueueState = 'idle'; // 'idle', 'sending', 'paused'

// Load campaigns screen details
async function loadCampaignsData() {
    // 1. Fetch customers to count targets
    const customers = await API.get('/api/customers') || [];
    allCustomers = customers;
    
    // Sync targets option counts
    const targetAllSpan = document.getElementById('camp-target-all-count');
    if (targetAllSpan) {
        targetAllSpan.innerText = customers.length;
    }
    
    // 2. Fetch past campaigns history
    const campaigns = await API.get('/api/campaigns') || [];
    
    const tbody = document.getElementById('campaigns-list-tbody');
    tbody.innerHTML = '';
    
    if (campaigns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No campaigns launched yet.</td></tr>`;
        return;
    }
    
    campaigns.forEach(camp => {
        const row = document.createElement('tr');
        
        // Truncate message preview
        let preview = camp.message_template.substring(0, 50);
        if (camp.message_template.length > 50) preview += '...';
        
        row.innerHTML = `
            <td><b>${camp.title}</b></td>
            <td><code>${preview}</code></td>
            <td>${formatDateString(camp.created_at.split('T')[0])}</td>
            <td style="text-align: center;"><b class="text-secondary">${camp.sent_count}</b></td>
            <td style="text-align: center;"><b class="text-secondary">${camp.total_count}</b></td>
            <td><span class="badge ${camp.status === 'Completed' ? 'badge-paid' : 'badge-unpaid'}">${camp.status}</span></td>
            <td>
                <div class="search-actions">
                    <button class="btn btn-sm btn-remove-row" onclick="deleteCampaignRegistry(${camp.id})" style="padding: 0 0.5rem; font-size:1.1rem;">✕</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function deleteCampaignRegistry(id) {
    if (confirm('Are you absolutely sure you want to delete this campaign log? This action is permanent.')) {
        const res = await API.delete(`/api/campaigns/${id}`);
        if (res) {
            showToast('Campaign log deleted.');
            loadCampaignsData();
        }
    }
}

// Update WhatsApp campaign text preview bubble
function updateCampaignTextPreview() {
    const template = document.getElementById('camp-message').value;
    const previewContainer = document.getElementById('camp-wa-text-preview');
    
    if (!template || !currentBusiness) return;
    
    // Replace mockup placeholders
    let previewText = template
        .replace(/{customer_name}/g, 'John Doe')
        .replace(/{business_name}/g, currentBusiness.name);
        
    // Convert bold *word* to <b>word</b>
    previewText = previewText.replace(/\*(.*?)\*/g, '<b>$1</b>');
    // Convert newlines to HTML breaks
    previewText = previewText.replace(/\n/g, '<br>');
    
    previewContainer.innerHTML = previewText;
}

// Setup Event Listeners for Campaign Inbound UI
function setupCampaignListeners() {
    const campMessageInput = document.getElementById('camp-message');
    const campaignForm = document.getElementById('campaign-form');
    
    if (campMessageInput) {
        campMessageInput.addEventListener('input', updateCampaignTextPreview);
    }
    
    if (campaignForm) {
        campaignForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('camp-title').value.trim();
            const messageTemplate = campMessageInput.value;
            
            if (!title || !messageTemplate) {
                showToast('Campaign Title and Message Template are required!', 'error');
                return;
            }
            
            if (allCustomers.length === 0) {
                showToast('Your customer directory is empty! Please add customers before broadcasting.', 'error');
                return;
            }
            
            // Build queue
            campaignQueue = [...allCustomers];
            campaignQueueIndex = 0;
            
            // Create Campaign record in DB
            showToast('Initializing broadcast campaign...', 'success');
            const res = await API.post('/api/campaigns', {
                title: title,
                message_template: messageTemplate,
                total_count: campaignQueue.length
            });
            
            if (res) {
                activeCampaign = res;
                // Swap views to Active Queue dispatcher
                startRedirectQueueRunner();
            }
        });
    }
    
    // Queue Dispatcher handlers
    const dispatchBtn = document.getElementById('camp-queue-dispatch-btn');
    const pauseBtn = document.getElementById('camp-queue-pause-btn');
    const cancelBtn = document.getElementById('camp-queue-cancel-btn');
    
    if (dispatchBtn) {
        dispatchBtn.addEventListener('click', dispatchNextCampaignMessage);
    }
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (campaignQueueState === 'sending') {
                campaignQueueState = 'paused';
                pauseBtn.innerText = 'Resume';
                pauseBtn.className = 'btn btn-primary w-100';
                dispatchBtn.disabled = true;
                showToast('Campaign queue paused.');
            } else {
                campaignQueueState = 'sending';
                pauseBtn.innerText = 'Pause';
                pauseBtn.className = 'btn btn-secondary w-100';
                dispatchBtn.disabled = false;
                showToast('Campaign queue active.');
            }
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            if (confirm('Cancel campaign dispatcher? Past sent logs are preserved.')) {
                // Update DB state
                await API.put(`/api/campaigns/${activeCampaign.id}/progress`, {
                    sent_count: campaignQueueIndex,
                    status: 'Cancelled'
                });
                
                // Terminate Queue
                campaignQueueState = 'idle';
                activeCampaign = null;
                campaignQueue = [];
                campaignQueueIndex = 0;
                
                // Swap views back
                document.getElementById('camp-queue-mode').style.display = 'none';
                document.getElementById('camp-preview-mode').style.display = 'block';
                
                // Reset form inputs
                document.getElementById('camp-title').value = '';
                document.getElementById('camp-message').value = '';
                
                showToast('Campaign cancelled.', 'error');
                loadCampaignsData();
            }
        });
    }
}

// Swap preview element for Queue Dispatcher UI panel
function startRedirectQueueRunner() {
    campaignQueueState = 'sending';
    
    // Setup labels
    document.getElementById('camp-queue-sent').innerText = '0';
    document.getElementById('camp-queue-total').innerText = campaignQueue.length;
    document.getElementById('camp-queue-progress-bar').style.width = '0%';
    
    // Hide chat bubble, show dispatcher
    document.getElementById('camp-preview-mode').style.display = 'none';
    document.getElementById('camp-queue-mode').style.display = 'block';
    
    updateQueueNextLabel();
}

function updateQueueNextLabel() {
    const nextCust = campaignQueue[campaignQueueIndex];
    if (nextCust) {
        document.getElementById('camp-queue-next-name').innerText = nextCust.name;
        document.getElementById('camp-queue-next-phone').innerText = nextCust.phone;
    }
}

// Compose next direct redirection message and open wa.me link
async function dispatchNextCampaignMessage() {
    if (campaignQueueState !== 'sending' || !activeCampaign) return;
    
    const customer = campaignQueue[campaignQueueIndex];
    if (!customer) return;
    
    // Format text placeholders
    const rawTemplate = activeCampaign.message_template;
    const formatted = rawTemplate
        .replace(/{customer_name}/g, customer.name)
        .replace(/{business_name}/g, currentBusiness ? currentBusiness.name : 'Alpha Retailers');
        
    const cleanPhone = customer.phone.replace(/\+/g, '').replace(/ /g, '');
    const encodedMsg = encodeURIComponent(formatted);
    const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
    
    // Open redirection in new popup/tab
    window.open(waLink, '_blank');
    
    // Progress pointers
    campaignQueueIndex++;
    
    // Update labels and progress bar
    document.getElementById('camp-queue-sent').innerText = campaignQueueIndex;
    const progressPercent = Math.round((campaignQueueIndex / campaignQueue.length) * 100);
    document.getElementById('camp-queue-progress-bar').style.width = `${progressPercent}%`;
    
    // Update progress in database
    await API.put(`/api/campaigns/${activeCampaign.id}/progress`, {
        sent_count: campaignQueueIndex,
        status: campaignQueueIndex === campaignQueue.length ? 'Completed' : 'Sending'
    });
    
    if (campaignQueueIndex < campaignQueue.length) {
        updateQueueNextLabel();
    } else {
        // Queue completed!
        showToast('Campaign successfully sent to all recipients!');
        campaignQueueState = 'idle';
        activeCampaign = null;
        campaignQueue = [];
        campaignQueueIndex = 0;
        
        // Swaps back to normal preview
        setTimeout(() => {
            document.getElementById('camp-queue-mode').style.display = 'none';
            document.getElementById('camp-preview-mode').style.display = 'block';
            
            // Clean forms
            document.getElementById('camp-title').value = '';
            document.getElementById('camp-message').value = '';
            
            loadCampaignsData();
        }, 1500);
    }
}

// --- WEB AUDIO API CASH-REGISTER CHIME ---
function playCashRegisterSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Sound 1: Crisp double high chime ("Cha-Ching")
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain1.gain.setValueAtTime(0.15, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.35);
        
        // Sound 2: Slightly delayed higher frequency tone for harmonic cash register ring
        setTimeout(() => {
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1318.51, ctx.currentTime); // E6 note
            gain2.gain.setValueAtTime(0.2, ctx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start();
            osc2.stop(ctx.currentTime + 0.65);
        }, 120);
    } catch (e) {
        console.error("Web Audio chime failed to play:", e);
    }
}

// --- BACKGROUND PAYMENT POLLING ---
function startPaymentPolling() {
    if (paymentPollingInterval) clearInterval(paymentPollingInterval);
    
    paymentPollingInterval = setInterval(async () => {
        const invoices = await API.get('/api/invoices');
        if (!invoices) return;
        
        let changed = false;
        invoices.forEach(inv => {
            const prev = lastKnownInvoiceStatuses[inv.invoice_number];
            if (prev === 'Unpaid' && inv.payment_status === 'Paid') {
                playCashRegisterSound();
                showToast(`Payment Confirmed: Received ${currentBusiness ? currentBusiness.currency : '₹'}${inv.grand_total.toFixed(2)} from ${inv.customer.name}! 💰`, 'success');
                changed = true;
            }
            lastKnownInvoiceStatuses[inv.invoice_number] = inv.payment_status;
        });
        
        if (changed) {
            const activeTab = document.querySelector('.nav-item.active');
            if (activeTab) {
                const tabId = activeTab.dataset.tab;
                if (tabId === 'dashboard-tab') {
                    loadDashboardData();
                } else if (tabId === 'invoices-tab') {
                    loadInvoicesRegistry();
                }
            }
        }
    }, 5000);
}

// --- PRODUCTS CATALOG CRUD ---
function setupProductListeners() {
    const productForm = document.getElementById('product-form');
    const clearBtn = document.getElementById('prod-clear-btn');
    
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const prodId = document.getElementById('prod-id').value;
            const name = document.getElementById('prod-name').value.trim();
            const sku = document.getElementById('prod-sku').value.trim();
            const rate = parseFloat(document.getElementById('prod-rate').value) || 0;
            const tax_rate = parseFloat(document.getElementById('prod-tax').value) || 0;
            const stock = parseInt(document.getElementById('prod-stock').value) || 0;
            
            const payload = {
                name: name,
                sku: sku || null,
                rate: rate,
                tax_rate: tax_rate,
                stock: stock
            };
            
            let res = null;
            if (prodId) {
                res = await API.put(`/api/products/${prodId}`, payload);
                if (res) showToast('Product updated successfully!');
            } else {
                res = await API.post('/api/products', payload);
                if (res) showToast('Product added to catalog!');
            }
            
            if (res) {
                clearProductForm();
                loadProductsCatalog();
            }
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearProductForm);
    }
}

function clearProductForm() {
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-sku').value = '';
    document.getElementById('prod-rate').value = '';
    document.getElementById('prod-tax').value = '18';
    document.getElementById('prod-stock').value = '10';
    
    document.getElementById('prod-form-title').innerHTML = `<span class="icon">🛍️</span> Add Product Entry`;
    document.getElementById('prod-submit-btn').innerText = 'Save Product';
    document.getElementById('prod-clear-btn').style.display = 'none';
}

async function loadProductsCatalog() {
    const products = await API.get('/api/products') || [];
    allProducts = products;
    
    const tbody = document.getElementById('products-list-tbody');
    tbody.innerHTML = '';
    
    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No products in catalog.</td></tr>`;
        return;
    }
    
    products.forEach(prod => {
        const row = document.createElement('tr');
        
        let stockBadge = '';
        if (prod.stock === 0) {
            stockBadge = `<span class="badge badge-cancelled" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);">Out of Stock</span>`;
        } else if (prod.stock < 5) {
            stockBadge = `<span class="badge badge-unpaid" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);">Low Stock (${prod.stock})</span>`;
        } else {
            stockBadge = `<span class="badge badge-paid" style="background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);">${prod.stock} In Stock</span>`;
        }
        
        const currency = currentBusiness ? currentBusiness.currency : '₹';
        const user = getLoggedInUser();
        const deleteButton = (user && user.role === 'Owner') 
            ? `<button class="btn btn-sm btn-remove-row" onclick="deleteProductCatalog(${prod.id})" style="padding: 0 0.5rem; font-size:1.1rem;">✕</button>`
            : '';
            
        row.innerHTML = `
            <td><code style="font-family:var(--font-mono)">${prod.sku || '-'}</code></td>
            <td><b>${prod.name}</b></td>
            <td><b>${currency}${prod.rate.toFixed(2)}</b></td>
            <td>${prod.tax_rate}%</td>
            <td style="text-align: center;">${stockBadge}</td>
            <td>
                <div class="search-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editProduct(${prod.id})">✏️ Edit</button>
                    ${deleteButton}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editProduct(id) {
    const prod = allProducts.find(x => x.id === id);
    if (!prod) return;
    
    document.getElementById('prod-id').value = prod.id;
    document.getElementById('prod-name').value = prod.name;
    document.getElementById('prod-sku').value = prod.sku || '';
    document.getElementById('prod-rate').value = prod.rate;
    document.getElementById('prod-tax').value = prod.tax_rate;
    document.getElementById('prod-stock').value = prod.stock;
    
    document.getElementById('prod-form-title').innerHTML = `<span class="icon">🛍️</span> Edit Product Details`;
    document.getElementById('prod-submit-btn').innerText = 'Update Product';
    document.getElementById('prod-clear-btn').style.display = 'block';
}

async function deleteProductCatalog(id) {
    if (confirm('Are you sure you want to delete this product from the catalog?')) {
        const res = await API.delete(`/api/products/${id}`);
        if (res) {
            showToast('Product deleted from catalog.');
            loadProductsCatalog();
        }
    }
}
