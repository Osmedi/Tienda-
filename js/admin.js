import { auth, db, logout, handleFirestoreError, OperationType } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const ADMIN_EMAIL = 'lopezosmedi456@gmail.com';

// Initialize Lucide icons
const initIcons = () => {
    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
};
document.addEventListener('DOMContentLoaded', initIcons);

let currentUser = null;
let allProducts = [];
let allOrders = [];
let allUsers = [];

// Charts
let salesChartInstance = null;
let statusChartInstance = null;

// Elements
const pageLoader = document.getElementById('page-loader');
const adminName = document.getElementById('admin-name');
const adminEmail = document.getElementById('admin-email');
const toastContainer = document.getElementById('toast-container');

// Tabs
const sidebarLinks = document.querySelectorAll('.sidebar-link');
const tabContents = document.querySelectorAll('.tab-content');

sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
        sidebarLinks.forEach(l => l.classList.remove('active', 'font-bold', 'bg-zinc-50'));
        link.classList.add('active', 'font-bold', 'bg-zinc-50');

        tabContents.forEach(tab => tab.classList.remove('active'));
        const targetId = link.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// Toast System
const showToast = (message) => {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'bg-zinc-900 text-white px-6 py-3 rounded-lg shadow-xl text-sm font-medium';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Auth Elements
const loginOverlay = document.getElementById('admin-login-overlay');
const loginForm = document.getElementById('admin-login-form');
const loginBtn = document.getElementById('login-submit-btn');

// Auth Guard
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Check if user is admin
        getDoc(doc(db, 'user_profiles', user.uid)).then(async (docSnap) => {
            const role = docSnap.exists() ? docSnap.data().role : null;
            
            // Allow if strictly the master admin, or if they have the admin role, 
            // OR if they are a newly created user from Firebase console (no profile yet).
            if (role === 'admin' || user.email === ADMIN_EMAIL || !docSnap.exists()) {
                
                // If it's a new console user, save their profile as admin automatically
                if (!docSnap.exists() || role !== 'admin') {
                    await setDoc(doc(db, 'user_profiles', user.uid), {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName || 'Admin Autorizado',
                        role: 'admin',
                        lastLogin: serverTimestamp()
                    }, { merge: true });
                }

                loginOverlay.classList.add('hidden');
                pageLoader.classList.add('hidden');
                
                currentUser = user;
                adminName.textContent = user.displayName || 'Admin';
                adminEmail.textContent = user.email;

                initIcons();
                loadDashboardData();
            } else {
                showToast('Acceso denegado. Perfil no autorizado.');
                await logout();
                pageLoader.classList.add('hidden');
                loginOverlay.classList.remove('hidden');
            }
        }).catch(async (error) => {
            console.error("Error al obtener perfil:", error);
            showToast('Error de permisos en Base de Datos.');
            await logout();
            pageLoader.classList.add('hidden');
            loginOverlay.classList.remove('hidden');
        });
    } else {
        // Not logged in
        pageLoader.classList.add('hidden');
        loginOverlay.classList.remove('hidden');
    }
});

// Admin Login Form Handler
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pwd = document.getElementById('login-password').value;
        
        loginBtn.disabled = true;
        loginBtn.textContent = 'Verificando...';

        try {
            await signInWithEmailAndPassword(auth, email, pwd);
            showToast('Inicio de sesión exitoso');
            // onAuthStateChanged takes over
        } catch(err) {
            showToast('Credenciales inválidas');
            console.error(err);
            loginBtn.disabled = false;
            loginBtn.textContent = 'Iniciar Sesión';
        }
    });
}

document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
    logout().then(() => window.location.reload());
});

// Dashboard Data Loading
const loadDashboardData = () => {
    // Listen Products
    onSnapshot(collection(db, 'products'), (snapshot) => {
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('dash-products').textContent = allProducts.length;
        renderProductsTable();
    });

    // Listen Orders
    onSnapshot(collection(db, 'orders'), (snapshot) => {
        allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('dash-orders').textContent = allOrders.length;
        
        const revenue = allOrders.filter(o => o.status === 'Entregado').reduce((sum, order) => sum + (order.total || 0), 0);
        document.getElementById('dash-revenue').textContent = `$${revenue.toFixed(2)}`;
        
        renderOrdersTable();
        renderCharts();
    });

    // Listen Users
    onSnapshot(collection(db, 'user_profiles'), (snapshot) => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('dash-users').textContent = allUsers.length;
        renderUsersTable();
    });

    // Load Settings
    getDoc(doc(db, 'settings', 'site_config')).then(snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.primaryColor) {
                document.getElementById('cfg-color-1').value = data.primaryColor;
                document.getElementById('cfg-color-1-text').value = data.primaryColor;
            }
            if (data.brands) document.getElementById('cfg-brands').value = data.brands.join(', ');
            if (data.hero) {
                const imgVal = data.hero.image || '';
                const subVal = data.hero.subtitle || '';
                const titVal = data.hero.title || '';
                document.getElementById('cfg-hero-image').value = imgVal;
                document.getElementById('cfg-hero-subtitle').value = subVal;
                document.getElementById('cfg-hero-title').value = titVal;
                
                // Update new preview
                if (imgVal) document.getElementById('preview-hero-img').src = imgVal;
                document.getElementById('preview-hero-subtitle').textContent = subVal;
                document.getElementById('preview-hero-title').innerHTML = titVal.replace('\\n', '<br />');
            }
            if (data.offerEndTime) document.getElementById('cfg-offer-end').value = data.offerEndTime;
            document.getElementById('cfg-shipping-cost').value = data.shippingCost || '0.00';
            document.getElementById('cfg-shipping-threshold').value = data.shippingFreeThreshold || '0.00';
        }
    });
};

/* =========================================
   CHARTS (ANALYTICS)
   ========================================= */
const renderCharts = () => {
    // 1. Prepare Data for Sales Chart (Last 7 days revenue)
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toLocaleDateString();
    }).reverse();

    const salesData = new Array(7).fill(0);
    allOrders.forEach(o => {
        if (o.status !== 'Cancelado' && o.createdAt) {
            const dateStr = new Date(o.createdAt.toDate()).toLocaleDateString();
            const idx = last7Days.indexOf(dateStr);
            if (idx !== -1) {
                salesData[idx] += (o.total || 0);
            }
        }
    });

    const salesCtx = document.getElementById('salesChart');
    if (salesCtx) {
        if (salesChartInstance) salesChartInstance.destroy();
        salesChartInstance = new Chart(salesCtx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [{
                    label: 'Ventas ($)',
                    data: salesData,
                    borderColor: '#ba0036',
                    backgroundColor: 'rgba(186, 0, 54, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 2. Prepare Data for Status Chart
    const statusCounts = { 'Pendiente': 0, 'Procesando': 0, 'Enviado': 0, 'Entregado': 0, 'Cancelado': 0 };
    allOrders.forEach(o => {
        if (statusCounts[o.status] !== undefined) statusCounts[o.status]++;
    });

    const statusCtx = document.getElementById('statusChart');
    if (statusCtx) {
        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
};

/* =========================================
   PRODUCTS
   ========================================= */
const productsTbody = document.getElementById('products-tbody');
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('admin-product-form');
const offerCheckbox = document.getElementById('ap-isOffer');
const offerFields = document.getElementById('offer-fields');

offerCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) offerFields.classList.remove('hidden');
    else offerFields.classList.add('hidden');
});

document.getElementById('new-product-btn').addEventListener('click', () => {
    productForm.reset();
    document.getElementById('ap-id').value = '';
    document.getElementById('ap-sizes').value = '';
    document.getElementById('product-modal-title').textContent = 'Añadir Producto';
    offerFields.classList.add('hidden');
    productModal.classList.remove('hidden');
});

document.querySelectorAll('.close-product-modal').forEach(btn => {
    btn.addEventListener('click', () => productModal.classList.add('hidden'));
});

// Remove trailing function bindings for dynamic elements by using event delegation
productsTbody.addEventListener('click', async (e) => {
    const btnDel = e.target.closest('.delete-product-btn');
    const btnEdit = e.target.closest('.edit-product-btn');

    if (btnDel) {
        const id = btnDel.dataset.id;
        if (confirm('¿Eliminar producto de forma permanente?')) {
            await deleteDoc(doc(db, 'products', id));
            showToast('Producto eliminado');
        }
    }

    if (btnEdit) {
        const id = btnEdit.dataset.id;
        const p = allProducts.find(x => x.id === id);
        if (p) {
            document.getElementById('ap-id').value = p.id;
            document.getElementById('ap-name').value = p.name;
            document.getElementById('ap-price').value = p.price;
            document.getElementById('ap-category').value = p.category;
            document.getElementById('ap-stock').value = p.stock || 0;
            document.getElementById('ap-sizes').value = p.sizes ? p.sizes.join(', ') : '';
            document.getElementById('ap-image').value = p.image;
            document.getElementById('ap-desc').value = p.description || '';
            document.getElementById('ap-isNew').checked = p.isNew || false;
            
            if (p.isOffer) {
                document.getElementById('ap-isOffer').checked = true;
                offerFields.classList.remove('hidden');
                document.getElementById('ap-oldPrice').value = p.oldPrice || '';
            } else {
                document.getElementById('ap-isOffer').checked = false;
                offerFields.classList.add('hidden');
                document.getElementById('ap-oldPrice').value = '';
            }

            document.getElementById('product-modal-title').textContent = 'Editar Producto';
            productModal.classList.remove('hidden');
        }
    }
});

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('ap-id').value;
    const name = document.getElementById('ap-name').value;
    const price = parseFloat(document.getElementById('ap-price').value);
    const category = document.getElementById('ap-category').value;
    const stock = parseInt(document.getElementById('ap-stock').value) || 0;
    const image = document.getElementById('ap-image').value;
    const desc = document.getElementById('ap-desc').value;
    const isNew = document.getElementById('ap-isNew').checked;
    const isOffer = document.getElementById('ap-isOffer').checked;
    const oldPrice = parseFloat(document.getElementById('ap-oldPrice').value) || null;
    const sizesStr = document.getElementById('ap-sizes').value;
    const sizes = sizesStr ? sizesStr.split(',').map(s=>s.trim()).filter(Boolean) : null;

    const id = isEdit || name.toLowerCase().replace(/\s+/g, '-');
    const payload = {
        id, name, price, category, stock, image, description: desc, isNew, isOffer, 
        updatedAt: serverTimestamp()
    };
    if (sizes && sizes.length > 0) payload.sizes = sizes;
    else payload.sizes = null; // Clear if emptied

    if (isOffer && oldPrice) payload.oldPrice = oldPrice;
    if (!isEdit) payload.createdAt = serverTimestamp();

    try {
        await setDoc(doc(db, 'products', id), payload, { merge: true });
        showToast(isEdit ? 'Producto actualizado' : 'Producto añadido');
        productModal.classList.add('hidden');
    } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'products');
    }
});

const renderProductsTable = () => {
    if (allProducts.length === 0) {
        productsTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-zinc-400">No hay productos.</td></tr>`;
        return;
    }
    productsTbody.innerHTML = allProducts.map(p => `
        <tr class="hover:bg-zinc-50 transition-colors">
            <td class="py-3 px-4 flex items-center gap-3">
                <img src="${p.image}" class="w-10 h-10 object-cover rounded shadow-sm" alt="img">
                <span class="font-medium text-sm">${p.name}</span>
            </td>
            <td class="py-3 px-4 font-bold">$${(p.price||0).toFixed(2)}</td>
            <td class="py-3 px-4 font-medium text-sm text-zinc-600">${p.category}</td>
            <td class="py-3 px-4">
                <div class="flex gap-1">
                    ${p.isNew ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] uppercase font-bold rounded">Nuevo</span>' : ''}
                    ${p.isOffer ? '<span class="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] uppercase font-bold rounded">Oferta</span>' : ''}
                    ${p.stock < 5 ? `<span class="px-2 py-0.5 bg-orange-100 text-orange-800 text-[10px] uppercase font-bold rounded">Stock: ${p.stock}</span>` : `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold rounded">Stock: ${p.stock}</span>`}
                </div>
            </td>
            <td class="py-3 px-4 text-right">
                <button class="edit-product-btn p-1.5 text-zinc-400 hover:text-blue-600 rounded bg-white hover:bg-blue-50 shadow-sm border border-zinc-200 transition-colors mr-2 cursor-pointer" data-id="${p.id}">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button class="delete-product-btn p-1.5 text-zinc-400 hover:text-red-600 rounded bg-white hover:bg-red-50 shadow-sm border border-zinc-200 transition-colors cursor-pointer" data-id="${p.id}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');
    initIcons();
};

/* =========================================
   ORDERS
   ========================================= */
const ordersTbody = document.getElementById('orders-tbody');

ordersTbody.addEventListener('change', async (e) => {
    if (e.target.classList.contains('status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        try {
            const currentOrder = allOrders.find(o => o.id === id);
            
            if (newStatus === 'Entregado' && !currentOrder.stockDeducted) {
                 // Deduct Stock
                 for (const item of (currentOrder.items || [])) {
                     const productRef = doc(db, 'products', item.productId);
                     const prodDoc = await getDoc(productRef);
                     if (prodDoc.exists()) {
                         const currentStock = prodDoc.data().stock || 0;
                         const newStock = Math.max(0, currentStock - (item.quantity || 1));
                         await updateDoc(productRef, { stock: newStock });
                     }
                 }
                 await updateDoc(doc(db, 'orders', id), { status: newStatus, stockDeducted: true });
            } else {
                 await updateDoc(doc(db, 'orders', id), { status: newStatus });
            }
            
            showToast(`Estado actualizado: ${newStatus}`);
        } catch(err) {
            handleFirestoreError(err, OperationType.UPDATE, `orders/${id}`);
        }
    }
});

const renderOrdersTable = () => {
    if (allOrders.length === 0) {
        ordersTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-zinc-400">No hay pedidos registrados.</td></tr>`;
        return;
    }
    // Sort descending by date
    const sorted = [...allOrders].sort((a,b) => (b.createdAt?.toMillis()||0) - (a.createdAt?.toMillis()||0));
    
    ordersTbody.innerHTML = sorted.map(o => {
        const dateStr = o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString() : 'Desconocido';
        return `
        <tr class="hover:bg-zinc-50 transition-colors">
            <td class="py-3 px-4 text-sm font-medium text-zinc-600">
                <div class="font-mono text-xs mb-1 text-black">${o.id}</div>
                ${dateStr}
            </td>
            <td class="py-3 px-4">
                <div class="font-bold text-sm">${o.userName}</div>
                <div class="text-xs text-zinc-500">${o.userEmail}</div>
            </td>
            <td class="py-3 px-4 font-bold text-lg">$${(o.total||0).toFixed(2)}</td>
            <td class="py-3 px-4">
                <select class="status-select text-xs font-bold uppercase border-none rounded bg-zinc-100 px-2 py-1 outline-none cursor-pointer" data-id="${o.id}">
                    <option value="Pendiente" ${o.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="Procesando" ${o.status === 'Procesando' ? 'selected' : ''}>Procesando</option>
                    <option value="Enviado" ${o.status === 'Enviado' ? 'selected' : ''}>Enviado</option>
                    <option value="Entregado" ${o.status === 'Entregado' ? 'selected' : ''}>Entregado</option>
                    <option value="Cancelado" ${o.status === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
            </td>
            <td class="py-3 px-4 text-right">
                <button class="p-1.5 text-zinc-400 hover:text-black rounded bg-white shadow-sm border border-zinc-200 transition-colors cursor-pointer" onclick="window.viewOrderDetails('${o.id}')">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `}).join('');
    initIcons();
};

window.viewOrderDetails = (orderId) => {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;

    const modal = document.getElementById('order-modal');
    const content = document.getElementById('order-modal-content');

    const dateStr = order.createdAt ? new Date(order.createdAt.toDate()).toLocaleString() : 'Desconocido';
    const itemsHtml = (order.items || []).map(item => `
        <div class="flex items-center gap-4 border-b border-zinc-100 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
            <img src="${item.image}" class="w-12 h-16 object-cover rounded shadow-sm">
            <div class="flex-1">
                <p class="font-bold text-sm text-zinc-900">${item.name}</p>
                <p class="text-xs text-zinc-500">Cantidad: ${item.quantity || 1} x $${(item.price || 0).toFixed(2)}</p>
            </div>
            <div class="font-bold text-sm">
                $${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
            </div>
        </div>
    `).join('');

    content.innerHTML = `
        <div class="grid grid-cols-2 gap-4 text-sm mb-2 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
            <div>
                <p class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Cliente</p>
                <p class="font-bold text-zinc-900">${order.userName}</p>
                <p class="text-zinc-600 text-xs">${order.userEmail}</p>
            </div>
            <div>
                <p class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Fecha / ID</p>
                <p class="font-mono text-xs text-zinc-900">${order.id}</p>
                <p class="text-zinc-600 text-xs mt-1">${dateStr}</p>
            </div>
            <div class="col-span-2 md:col-span-1 mt-2">
                <p class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Entrega</p>
                <p class="font-bold text-zinc-900">${order.deliveryType || 'No especificado'}</p>
                ${order.logistics ? `<p class="text-zinc-600 mt-1">Empresa: ${order.logistics}</p>` : ''}
            </div>
            <div class="col-span-2 md:col-span-1 mt-2">
                <p class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Dirección / Pago</p>
                <p class="text-zinc-600 break-words leading-tight bg-white p-2 text-xs rounded border border-zinc-200">${order.address || 'N/A'}</p>
                <p class="font-bold mt-2 text-emerald-600 bg-emerald-50 inline-block px-2 py-1 rounded text-xs border border-emerald-100">Método: ${order.paymentMethod || 'N/A'}</p>
            </div>
        </div>
        
        <div>
            <h4 class="font-bold text-lg mb-4 text-zinc-900">Artículos</h4>
            <div class="max-h-48 overflow-y-auto pr-2">
                ${itemsHtml}
            </div>
        </div>

        <div class="flex justify-between items-center bg-zinc-900 text-white p-6 rounded-xl mt-2 shadow-lg">
            <span class="font-bold text-lg uppercase tracking-widest">Total Pedido</span>
            <span class="font-black text-3xl">$${(order.total || 0).toFixed(2)}</span>
        </div>
    `;

    modal.classList.remove('hidden');
};

document.addEventListener('click', (e) => {
    if (e.target.closest('.close-order-modal')) {
        document.getElementById('order-modal').classList.add('hidden');
    }
});

/* =========================================
   USERS
   ========================================= */
const usersTbody = document.getElementById('users-tbody');

const renderUsersTable = () => {
    if (allUsers.length === 0) {
        usersTbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-zinc-400">No hay usuarios.</td></tr>`;
        return;
    }
    usersTbody.innerHTML = allUsers.map(u => {
        const lastLogin = u.lastLogin ? new Date(u.lastLogin.toDate()).toLocaleString() : 'Desconocido';
        const roleIcon = u.role === 'admin' ? '<i data-lucide="shield-check" class="w-4 h-4 text-rose-600 inline mr-1"></i>' : '<i data-lucide="user" class="w-4 h-4 text-zinc-400 inline mr-1"></i>';
        return `
        <tr class="hover:bg-zinc-50 transition-colors">
            <td class="py-3 px-4 flex items-center gap-3">
                ${u.photoURL ? `<img src="${u.photoURL}" class="w-8 h-8 rounded-full border border-zinc-200">` : `<div class="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center"><i data-lucide="user" class="w-4 h-4 text-zinc-500"></i></div>`}
                <span class="font-bold text-sm">${u.displayName}</span>
            </td>
            <td class="py-3 px-4 text-sm text-zinc-600">${u.email}</td>
            <td class="py-3 px-4 text-xs font-bold uppercase">${roleIcon} ${u.role === 'admin' ? 'Admin' : 'Estándar'}</td>
            <td class="py-3 px-4 text-xs text-zinc-500">${lastLogin}</td>
        </tr>
    `}).join('');
    initIcons();
};

/* =========================================
   SETTINGS
   ========================================= */
document.getElementById('cfg-color-1').addEventListener('input', (e) => {
    document.getElementById('cfg-color-1-text').value = e.target.value;
});
document.getElementById('cfg-color-1-text').addEventListener('input', (e) => {
    document.getElementById('cfg-color-1').value = e.target.value;
});

// Live Preview of Banner
document.getElementById('cfg-hero-image').addEventListener('input', (e) => {
    if (e.target.value) document.getElementById('preview-hero-img').src = e.target.value;
});
document.getElementById('cfg-hero-subtitle').addEventListener('input', (e) => {
    document.getElementById('preview-hero-subtitle').textContent = e.target.value;
});
document.getElementById('cfg-hero-title').addEventListener('input', (e) => {
    document.getElementById('preview-hero-title').innerHTML = e.target.value.replace('\\n', '<br />');
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const primaryColor = document.getElementById('cfg-color-1-text').value;
    const brandsRaw = document.getElementById('cfg-brands').value;
    const brands = brandsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const heroImage = document.getElementById('cfg-hero-image').value;
    const heroSubtitle = document.getElementById('cfg-hero-subtitle').value;
    const heroTitle = document.getElementById('cfg-hero-title').value;
    const offerEndTime = document.getElementById('cfg-offer-end').value;
    const shippingCost = parseFloat(document.getElementById('cfg-shipping-cost').value) || 0;
    const shippingFreeThreshold = parseFloat(document.getElementById('cfg-shipping-threshold').value) || 0;

    const payload = {
        primaryColor,
        brands,
        offerEndTime,
        shippingCost,
        shippingFreeThreshold,
        hero: {
            image: heroImage,
            subtitle: heroSubtitle,
            title: heroTitle
        },
        updatedAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, 'settings', 'site_config'), payload, { merge: true });
        showToast('Configuraciones guardadas y activas en web.');
    } catch(err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings');
    }
});
