import { auth, db, logout, getRedirectResult, handleFirestoreError, OperationType } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot, serverTimestamp, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';
// Storage logic migrated to Cloudinary

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

/* =========================================
   CLOUDINARY CONFIG (REEMPLAZA ESTOS DATOS)
   ========================================= */
const CLOUDINARY_CLOUD_NAME = 'ddhqgmnee';
const CLOUDINARY_UPLOAD_PRESET = 'tienda1_preset';

const uploadImage = async (file) => {
    if (!file) return null;

    if (CLOUDINARY_CLOUD_NAME === 'TU_CLOUD_NAME') {
        alert("¡Configuración incompleta!\nPara subir imágenes, primero debes configurar tu 'Cloud Name' y 'Upload Preset' en el archivo js/admin.js.");
        throw new Error("Cloudinary not configured");
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error.message || "Error al subir a Cloudinary");
    }

    const data = await response.json();
    return data.secure_url;
};

// Generic Preview Logic
const setupFilePreview = (fileInputId, containerId, previewBoxId, urlInputId) => {
    const input = document.getElementById(fileInputId);
    if (!input) return;

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
                const container = document.getElementById(containerId);
                const box = document.getElementById(previewBoxId);
                const urlInput = document.getElementById(urlInputId);

                if (container) container.classList.remove('hidden');
                if (urlInput) urlInput.placeholder = "Archivo seleccionado para subir";

                if (box) {
                    if (file.type.startsWith('video/')) {
                        box.innerHTML = `<video src="${re.target.result}" class="w-full h-full object-cover" muted loop autoplay></video>`;
                    } else {
                        box.innerHTML = `<img src="${re.target.result}" class="w-full h-full object-cover">`;
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    };
};

// Initialize Previews
setupFilePreview('ap-image-file-1', 'ap-preview-container-1', 'ap-preview-1', 'ap-image-1');
setupFilePreview('ap-image-file-2', 'ap-preview-container-2', 'ap-preview-2', 'ap-image-2');
setupFilePreview('ap-image-file-3', 'ap-preview-container-3', 'ap-preview-3', 'ap-image-3');

setupFilePreview('cfg-hero-file', 'cfg-hero-preview-container', 'cfg-hero-preview-box', 'cfg-hero-image');
setupFilePreview('cfg-file-mujer', null, null, 'cfg-cover-mujer');
setupFilePreview('cfg-file-hombre', null, null, 'cfg-cover-hombre');
setupFilePreview('cfg-file-ninos', null, null, 'cfg-cover-ninos');
setupFilePreview('cfg-file-accesorios', null, null, 'cfg-cover-accesorios');

const removePreview = (idx) => {
    const input = document.getElementById(`ap-image-file-${idx}`);
    if (input) input.value = '';
    document.getElementById(`ap-preview-container-${idx}`)?.classList.add('hidden');
    const urlInput = document.getElementById(`ap-image-${idx}`);
    if (urlInput) urlInput.placeholder = `URL ${idx}`;
};

document.getElementById('remove-ap-img-1')?.addEventListener('click', () => removePreview(1));
document.getElementById('remove-ap-img-2')?.addEventListener('click', () => removePreview(2));
document.getElementById('remove-ap-img-3')?.addEventListener('click', () => removePreview(3));

document.getElementById('remove-cfg-hero')?.addEventListener('click', () => {
    const input = document.getElementById('cfg-hero-file');
    if (input) input.value = '';
    document.getElementById('cfg-hero-preview-container')?.classList.add('hidden');
    const urlInput = document.getElementById('cfg-hero-image');
    if (urlInput) urlInput.placeholder = "O pega el link aquí...";
});

// Auth Elements
const loginOverlay = document.getElementById('admin-login-overlay');
const loginForm = document.getElementById('admin-login-form');
const loginBtn = document.getElementById('login-submit-btn');

// Handle Redirect Result
if (typeof getRedirectResult === 'function') {
    getRedirectResult(auth).catch(err => console.error("Error redirect:", err));
}

// Auth Guard
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, 'user_profiles', user.uid));
            const role = docSnap.exists() ? docSnap.data().role : null;
            const isMasterAdmin = user.email === ADMIN_EMAIL;

            if (role === 'admin' || isMasterAdmin) {
                // Authorized
                loginOverlay.classList.add('hidden');
                pageLoader.classList.add('hidden');

                currentUser = user;
                adminName.textContent = user.displayName || 'Admin Autorizado';
                adminEmail.textContent = user.email;

                // Sync profile if it's the master admin and doesn't have the role yet
                if (isMasterAdmin && role !== 'admin') {
                    await setDoc(doc(db, 'user_profiles', user.uid), {
                        role: 'admin',
                        email: user.email,
                        lastLogin: serverTimestamp()
                    }, { merge: true });
                }

                initIcons();
                loadDashboardData();
            } else {
                // Not an admin
                showToast('Acceso denegado: Tu cuenta no tiene permisos de administrador.');
                await logout();
                window.location.href = 'index.html'; // Redirect to home
            }
        } catch (error) {
            console.error("Auth Guard Error:", error);
            showToast('Error de seguridad. Contacte al soporte.');
            await logout();
        }
    } else {
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
        } catch (err) {
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
        if (typeof renderPosProducts === 'function') renderPosProducts();
    });

    // Listen Coupons
    onSnapshot(collection(db, 'coupons'), (snapshot) => {
        allCoupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCoupons();
    });

    // Listen Orders
    onSnapshot(collection(db, 'orders'), (snapshot) => {
        allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('dash-orders').textContent = allOrders.length;

        const revenue = allOrders.filter(o => o.status === 'Entregado').reduce((sum, order) => sum + (order.total || 0), 0);
        document.getElementById('dash-revenue').textContent = `$${revenue.toFixed(2)}`;

        // Calculate Recurrent Clients
        const emailsCount = {};
        let recurrentes = 0;
        let totalUnique = 0;
        allOrders.forEach(o => {
            if (o.userEmail && o.status !== 'Cancelado') {
                emailsCount[o.userEmail] = (emailsCount[o.userEmail] || 0) + 1;
            }
        });
        Object.values(emailsCount).forEach(count => {
            totalUnique++;
            if (count > 1) recurrentes++;
        });
        const recurPct = totalUnique > 0 ? Math.round((recurrentes / totalUnique) * 100) : 0;
        const recurEl = document.getElementById('dash-recurrentes');
        if (recurEl) recurEl.textContent = `${recurPct}% Recurrentes`;

        renderOrdersTable();
        renderCharts();

        // Re-render users table to update purchase counts now that orders are updated
        if (allUsers.length > 0) renderUsersTable();
    });

    // Listen Users
    onSnapshot(collection(db, 'user_profiles'), (snapshot) => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        document.getElementById('dash-users').textContent = allUsers.length;
        renderUsersTable();
    });

    // Load Settings (Reactive)
    onSnapshot(doc(db, 'settings', 'site_config'), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();

            // Helper to update input only if not focused
            const updateInput = (id, value) => {
                const el = document.getElementById(id);
                if (el && document.activeElement !== el) el.value = value || '';
            };

            updateInput('cfg-store-name', data.storeName);
            updateInput('cfg-store-desc', data.storeDescription);

            if (data.categories) {
                const categoriesStr = data.categories.join(', ');
                updateInput('cfg-categories', categoriesStr);

                // Populate Product Form Category Dropdown
                const apCategory = document.getElementById('ap-category');
                if (apCategory) {
                    const currentVal = apCategory.value;
                    apCategory.innerHTML = data.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                    if (data.categories.includes(currentVal)) apCategory.value = currentVal;
                }

                // Populate Product Filter Buttons
                const productFilters = document.getElementById('product-filters');
                if (productFilters) {
                    const todosBtn = `<button class="product-filter-btn px-4 py-2 rounded-lg text-sm font-bold transition-colors ${currentProductFilter === 'Todos' ? 'bg-zinc-900 text-white shadow-md border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 shadow-sm'}" data-filter="Todos">Todos</button>`;
                    const dynamicBtns = data.categories.map(cat => `<button class="product-filter-btn px-4 py-2 rounded-lg text-sm font-bold transition-colors ${currentProductFilter === cat ? 'bg-zinc-900 text-white shadow-md border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 shadow-sm'}" data-filter="${cat}">${cat}</button>`).join('');
                    const extraBtns = `
                        <button class="product-filter-btn px-4 py-2 rounded-lg text-sm font-bold transition-colors ${currentProductFilter === 'Agotados' ? 'bg-zinc-900 text-white shadow-md border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 shadow-sm'}" data-filter="Agotados">Agotados</button>
                        <button class="product-filter-btn px-4 py-2 rounded-lg text-sm font-bold transition-colors ${currentProductFilter === 'Destacados' ? 'bg-zinc-900 text-white shadow-md border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 shadow-sm'}" data-filter="Destacados">Destacados</button>
                    `;
                    productFilters.innerHTML = todosBtn + dynamicBtns + extraBtns;
                }
            }

            // Footer Builder (Only update if container is empty or we are not in the builder tab/active)
            if (data.footer) {
                const builder = document.getElementById('footer-builder');
                if (builder && builder.children.length === 0) {
                    renderFooterBuilder(data.footer);
                }
            }

            if (data.primaryColor) {
                updateInput('cfg-color-1', data.primaryColor);
                updateInput('cfg-color-1-text', data.primaryColor);
            }
            if (data.brands) {
                updateInput('cfg-brands', data.brands.join(', '));
                const apBrand = document.getElementById('ap-brand');
                if (apBrand) {
                    const currentVal = apBrand.value;
                    apBrand.innerHTML = '<option value="">Ninguna</option>' + data.brands.map(b => `<option value="${b}">${b}</option>`).join('');
                    apBrand.value = currentVal;
                }
            }
            if (data.hero) {
                updateInput('cfg-hero-image', data.hero.image);
                updateInput('cfg-hero-subtitle', data.hero.subtitle);
                updateInput('cfg-hero-title', data.hero.title);

                if (data.hero.image) document.getElementById('preview-hero-img').src = data.hero.image;
                document.getElementById('preview-hero-subtitle').textContent = data.hero.subtitle || '';
                document.getElementById('preview-hero-title').innerHTML = (data.hero.title || '').replace('\\n', '<br />');
            }
            updateInput('cfg-offer-end', data.offerEndTime);
            updateInput('cfg-whatsapp', data.whatsapp);
            updateInput('cfg-shipping-cost', data.shippingCost || '0.00');
            updateInput('cfg-shipping-threshold', data.shippingFreeThreshold || '0.00');

            if (data.covers) {
                updateInput('cfg-cover-mujer', data.covers.mujer);
                updateInput('cfg-cover-hombre', data.covers.hombre);
                updateInput('cfg-cover-ninos', data.covers.ninos);
                updateInput('cfg-cover-accesorios', data.covers.accesorios);
            }
        }
    }, (err) => console.error("Settings snapshot error:", err));
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
    if (document.getElementById('ap-brand')) document.getElementById('ap-brand').value = '';
    document.getElementById('ap-sizes').value = '';

    // Reset all image fields
    [1, 2, 3].forEach(idx => {
        const fileInp = document.getElementById(`ap-image-file-${idx}`);
        if (fileInp) fileInp.value = '';
        const preview = document.getElementById(`ap-preview-container-${idx}`);
        if (preview) preview.classList.add('hidden');
    });

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
            if (document.getElementById('ap-brand')) document.getElementById('ap-brand').value = p.brand || '';
            document.getElementById('ap-stock').value = p.stock || 0;
            document.getElementById('ap-sizes').value = p.sizes ? p.sizes.join(', ') : '';

            // Load Images
            document.getElementById('ap-image-1').value = p.image || '';
            document.getElementById('ap-image-2').value = (p.extraImages && p.extraImages[0]) || '';
            document.getElementById('ap-image-3').value = (p.extraImages && p.extraImages[1]) || '';

            document.getElementById('ap-desc').value = p.description || '';
            document.getElementById('ap-isTrending').checked = p.isTrending || false;
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
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Guardando...';
        initIcons();
    }

    const isEdit = document.getElementById('ap-id').value;
    const name = document.getElementById('ap-name').value;
    const price = parseFloat(document.getElementById('ap-price').value);
    const category = document.getElementById('ap-category').value;
    const brand = document.getElementById('ap-brand') ? document.getElementById('ap-brand').value : '';
    const stock = parseInt(document.getElementById('ap-stock').value) || 0;
    const desc = document.getElementById('ap-desc').value;
    const isTrending = document.getElementById('ap-isTrending').checked;
    const isNew = document.getElementById('ap-isNew').checked;
    const isOffer = document.getElementById('ap-isOffer').checked;
    const oldPrice = parseFloat(document.getElementById('ap-oldPrice').value) || null;
    const sizesStr = document.getElementById('ap-sizes').value;
    const sizes = sizesStr ? sizesStr.split(',').map(s => s.trim()).filter(Boolean) : null;

    // Handle Triple Image Upload
    let images = [
        document.getElementById('ap-image-1').value,
        document.getElementById('ap-image-2').value,
        document.getElementById('ap-image-3').value
    ];

    const fileInputs = [
        document.getElementById('ap-image-file-1'),
        document.getElementById('ap-image-file-2'),
        document.getElementById('ap-image-file-3')
    ];

    for (let i = 0; i < 3; i++) {
        const file = fileInputs[i]?.files[0];
        if (file) {
            try {
                images[i] = await uploadImage(file);
            } catch (err) {
                console.error(`Upload error image ${i + 1}:`, err);
                showToast(`Error al subir imagen ${i + 1}`);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Guardar';
                    initIcons();
                }
                return;
            }
        }
    }

    const mainImage = images[0] || '';
    const extraImages = images.slice(1).filter(Boolean);

    const id = isEdit || name.toLowerCase().replace(/\s+/g, '-');
    const payload = {
        id, name, price, category, brand, stock,
        image: mainImage,
        extraImages: extraImages,
        description: desc, isTrending, isNew, isOffer,
        updatedAt: serverTimestamp()
    };
    if (sizes && sizes.length > 0) payload.sizes = sizes;
    else payload.sizes = null;

    if (isOffer && oldPrice) payload.oldPrice = oldPrice;
    if (!isEdit) payload.createdAt = serverTimestamp();

    try {
        await setDoc(doc(db, 'products', id), payload, { merge: true });
        showToast(isEdit ? 'Producto actualizado' : 'Producto añadido');
        productModal.classList.add('hidden');
    } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'products');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Guardar';
            initIcons();
        }
    }
});

let currentProductFilter = 'Todos'; // default

document.getElementById('product-filters')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('product-filter-btn')) {
        document.querySelectorAll('.product-filter-btn').forEach(btn => {
            btn.classList.remove('bg-zinc-900', 'text-white', 'border-zinc-900');
            btn.classList.add('bg-white', 'text-zinc-600', 'border-zinc-200');
        });
        e.target.classList.add('bg-zinc-900', 'text-white', 'border-zinc-900');
        e.target.classList.remove('bg-white', 'text-zinc-600', 'border-zinc-200');

        currentProductFilter = e.target.dataset.filter;
        renderProductsTable();
    }
});

const renderProductsTable = () => {
    // 1. Calculate Metrics
    const totalCount = allProducts.length;
    const agotadosCount = allProducts.filter(p => !p.stock || p.stock <= 0).length;
    const promosCount = allProducts.filter(p => p.isTrending || p.isOffer || p.isNew).length;

    const mTotal = document.getElementById('metric-prod-total');
    const mAgotados = document.getElementById('metric-prod-agotados');
    const mPromos = document.getElementById('metric-prod-promos');

    if (mTotal) mTotal.textContent = totalCount;
    if (mAgotados) mAgotados.textContent = agotadosCount;
    if (mPromos) mPromos.textContent = promosCount;

    // 2. Filter Products
    let filtered = allProducts;
    if (currentProductFilter === 'Agotados') {
        filtered = filtered.filter(p => !p.stock || p.stock <= 0);
    } else if (currentProductFilter === 'Destacados') {
        filtered = filtered.filter(p => p.isTrending || p.isOffer || p.isNew);
    } else if (currentProductFilter !== 'Todos') {
        filtered = filtered.filter(p => p.category === currentProductFilter);
    }

    if (filtered.length === 0) {
        productsTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-zinc-400">No hay productos en esta categoría.</td></tr>`;
        return;
    }

    productsTbody.innerHTML = filtered.map(p => {
        const isOOS = !p.stock || p.stock <= 0;
        let rowClass = 'hover:bg-zinc-50 transition-colors border-l-4 border-l-transparent';
        if (isOOS) {
            rowClass = 'bg-rose-50/30 hover:bg-rose-50/60 transition-colors border-l-4 border-l-rose-400 opacity-70';
        }

        return `
        <tr class="${rowClass}">
            <td class="py-3 px-4 flex items-center gap-3">
                <img src="${p.image}" class="w-10 h-10 object-cover rounded shadow-sm" alt="img">
                <span class="font-medium text-sm ${isOOS ? 'text-rose-900 line-through decoration-rose-300' : 'text-zinc-900'}">${p.name}</span>
            </td>
            <td class="py-3 px-4 font-bold">$${(p.price || 0).toFixed(2)}</td>
            <td class="py-3 px-4 font-medium text-sm text-zinc-600">${p.category}</td>
            <td class="py-3 px-4">
                <div class="flex gap-1 flex-wrap">
                    ${p.isNew ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] uppercase font-bold rounded shadow-sm">Nuevo</span>' : ''}
                    ${p.isTrending ? '<span class="px-2 py-0.5 bg-violet-100 text-violet-800 text-[10px] uppercase font-bold rounded shadow-sm">Tendencia</span>' : ''}
                    ${p.isOffer ? '<span class="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] uppercase font-bold rounded shadow-sm">Oferta</span>' : ''}
                    ${isOOS ? `<span class="px-2 py-0.5 bg-rose-600 text-white text-[10px] uppercase font-bold rounded shadow-sm">Agotado</span>` : (p.stock < 5 ? `<span class="px-2 py-0.5 bg-orange-100 text-orange-800 text-[10px] uppercase font-bold rounded shadow-sm">Stock: ${p.stock}</span>` : `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold rounded shadow-sm">Stock: ${p.stock}</span>`)}
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
    `}).join('');
    initIcons();
};

/* =========================================
   ORDERS
   ========================================= */
const ordersTbody = document.getElementById('orders-tbody');
let currentOrderFilter = 'Pendiente';

document.getElementById('order-filters')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('order-filter-btn')) {
        document.querySelectorAll('.order-filter-btn').forEach(btn => {
            btn.classList.remove('bg-zinc-900', 'text-white', 'border-zinc-900');
            btn.classList.add('bg-white', 'text-zinc-600', 'border-zinc-200');
        });
        e.target.classList.add('bg-zinc-900', 'text-white', 'border-zinc-900');
        e.target.classList.remove('bg-white', 'text-zinc-600', 'border-zinc-200');

        currentOrderFilter = e.target.dataset.filter;
        renderOrdersTable();
    }
});

ordersTbody.addEventListener('change', async (e) => {
    if (e.target.classList.contains('status-select')) {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        const selectEl = e.target;
        selectEl.disabled = true;

        try {
            const currentOrder = allOrders.find(o => o.id === id);
            const oldStatus = currentOrder.status;

            if (newStatus === 'Cancelado' && oldStatus !== 'Cancelado' && currentOrder.stockDeducted !== false) {
                // Restore stock
                for (const item of (currentOrder.items || [])) {
                    if (!item.productId) continue;
                    const productRef = doc(db, 'products', item.productId);
                    await updateDoc(productRef, { stock: increment(item.quantity || 1) });
                }
                await updateDoc(doc(db, 'orders', id), { status: newStatus, stockDeducted: false });
                showToast(`Estado ${newStatus}: Inventario Restaurado`);
            }
            else if (oldStatus === 'Cancelado' && newStatus !== 'Cancelado' && currentOrder.stockDeducted === false) {
                // Deduct stock again
                for (const item of (currentOrder.items || [])) {
                    if (!item.productId) continue;
                    const productRef = doc(db, 'products', item.productId);
                    await updateDoc(productRef, { stock: increment(-(item.quantity || 1)) });
                }
                await updateDoc(doc(db, 'orders', id), { status: newStatus, stockDeducted: true });
                showToast(`Estado ${newStatus}: Inventario Descontado`);
            }
            else {
                // Normal status change
                await updateDoc(doc(db, 'orders', id), { status: newStatus });
                showToast(`Estado actualizado: ${newStatus}`);
            }
        } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `orders/${id}`);
            selectEl.value = allOrders.find(o => o.id === id)?.status || 'Pendiente';
        } finally {
            selectEl.disabled = false;
        }
    }
});

const renderOrdersTable = () => {
    // 1. Calculate Metrics (from allOrders)
    const pendientes = allOrders.filter(o => o.status === 'Pendiente').length;
    const enviados = allOrders.filter(o => o.status === 'Enviado').length;
    const ingresos = allOrders.filter(o => o.status === 'Entregado').reduce((sum, o) => sum + (o.total || 0), 0);

    const mP = document.getElementById('metric-pendientes');
    const mE = document.getElementById('metric-enviados');
    const mI = document.getElementById('metric-ingresos');
    if (mP) mP.textContent = pendientes;
    if (mE) mE.textContent = enviados;
    if (mI) mI.textContent = `$${ingresos.toFixed(2)}`;

    // 2. Filter Orders
    let filtered = allOrders;
    if (currentOrderFilter !== 'Todos') {
        filtered = filtered.filter(o => o.status === currentOrderFilter);
    }

    if (filtered.length === 0) {
        ordersTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-zinc-400">No hay pedidos registrados para este filtro.</td></tr>`;
        return;
    }
    // Sort descending by date
    const sorted = [...filtered].sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

    ordersTbody.innerHTML = sorted.map(o => {
        const dateStr = o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString() : 'Desconocido';

        let rowClass = 'hover:bg-zinc-50 transition-colors border-l-4 border-l-transparent';
        let selectBg = 'bg-zinc-100';

        if (o.status === 'Pendiente') {
            rowClass = 'bg-orange-50/30 hover:bg-orange-50/60 transition-colors border-l-4 border-l-orange-400';
            selectBg = 'bg-orange-100 text-orange-900 border-none';
        } else if (o.status === 'Cancelado') {
            rowClass = 'bg-red-50/30 hover:bg-red-50/60 transition-colors border-l-4 border-l-red-400 opacity-60';
        } else if (o.status === 'Entregado') {
            selectBg = 'bg-emerald-100 text-emerald-900 border-none';
        }

        return `
        <tr class="${rowClass}">
            <td class="py-3 px-4 text-sm font-medium text-zinc-600">
                <div class="font-mono text-xs mb-1 text-black">${o.id}</div>
                ${dateStr}
            </td>
            <td class="py-3 px-4">
                <div class="font-bold text-sm">${o.userName}</div>
                <div class="text-xs text-zinc-500">${o.userEmail}</div>
            </td>
            <td class="py-3 px-4 text-sm font-bold">$${(o.total || 0).toFixed(2)}</td>
            <td class="py-3 px-4">
                <select class="status-select text-xs font-bold uppercase rounded ${selectBg} px-2 py-1 outline-none cursor-pointer" data-id="${o.id}">
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

    const printBtn = document.getElementById('print-order-btn');
    if (printBtn) {
        printBtn.onclick = () => printInvoice(orderId);
    }

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
        <div class="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm mb-4 bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
            <div>
                <p class="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2"><i data-lucide="user" class="w-4 h-4"></i> Cliente</p>
                <p class="font-bold text-zinc-900">${order.userName}</p>
                <p class="text-zinc-600 text-xs mt-1 break-all">${order.userEmail}</p>
            </div>
            <div>
                <p class="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2"><i data-lucide="calendar" class="w-4 h-4"></i> Fecha/ID</p>
                <p class="text-zinc-600 pb-1 text-xs border-zinc-200 w-fit">${dateStr}</p>
                <p class="font-mono text-[10px] text-zinc-400 mt-1 uppercase">#${order.id}</p>
            </div>
            <div class="col-span-2 md:col-span-1">
                <p class="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2"><i data-lucide="credit-card" class="w-4 h-4"></i> Pago</p>
                <p class="font-bold text-emerald-700 bg-emerald-100 inline-block px-2 py-1 rounded-md text-xs border border-emerald-200">${order.paymentMethod || 'N/A'}</p>
            </div>
            <div class="col-span-2 md:col-span-3 pt-4 border-t border-zinc-200/60">
                <p class="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2"><i data-lucide="map-pin" class="w-4 h-4"></i> Logística de Entrega</p>
                <div class="flex gap-2 mb-2">
                   <span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded border border-blue-200">${order.deliveryType || 'No especificado'}</span>
                   ${order.logistics ? `<span class="bg-zinc-200 text-zinc-700 text-xs font-bold px-2 py-1 rounded border border-zinc-300">Empresa: ${order.logistics}</span>` : ''}
                </div>
                ${order.deliveryType === 'Envio' && order.address ? `<p class="text-zinc-600 bg-white p-3 text-sm rounded-lg border border-zinc-200 shadow-sm mt-2"><span class="block font-bold text-xs text-zinc-400 mb-1">DIRECCIÓN:</span> ${order.address}</p>` : ''}
            </div>
        </div>
        
        <div class="bg-white border text-sm border-zinc-200 rounded-2xl p-6 shadow-sm mb-2">
            <h4 class="font-serif italic text-xl mb-4 text-zinc-900 border-b border-zinc-100 pb-2">Artículos Solicitados</h4>
            <div class="max-h-48 overflow-y-auto pr-2">
                ${itemsHtml}
            </div>
            <div class="mt-4 pt-4 border-t border-zinc-100 flex flex-col items-end gap-1 text-sm text-zinc-500">
                <div class="flex justify-between w-full md:w-1/3"><span>Subtotal:</span> <span class="font-bold text-zinc-800">$${(order.subtotal || order.total || 0).toFixed(2)}</span></div>
                <div class="flex justify-between w-full md:w-1/3"><span>Envío:</span> <span class="font-bold text-zinc-800">${(order.shippingCost === 0 || !order.shippingCost) ? 'Gratis' : '$' + order.shippingCost.toFixed(2)}</span></div>
            </div>
        </div>

        <div class="flex justify-between items-center bg-gradient-to-r from-zinc-900 to-zinc-800 text-white p-6 rounded-2xl shadow-xl mt-4">
            <span class="font-bold text-lg uppercase tracking-widest">Total</span>
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
        usersTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-zinc-400">No hay usuarios.</td></tr>`;
        return;
    }
    usersTbody.innerHTML = allUsers.map(u => {
        const lastLogin = u.lastLogin ? new Date(u.lastLogin.toDate()).toLocaleString() : 'Desconocido';
        const roleIcon = u.role === 'admin' ? '<i data-lucide="shield-check" class="w-4 h-4 text-rose-600 inline mr-1"></i>' : '<i data-lucide="user" class="w-4 h-4 text-zinc-400 inline mr-1"></i>';

        // Count orders for this user
        const totalPurchasing = allOrders.filter(o => o.userEmail === u.email && o.status !== 'Cancelado').length;

        return `
        <tr class="hover:bg-zinc-50 transition-colors">
            <td class="py-3 px-4 flex items-center gap-3">
                ${u.photoURL ? `<img src="${u.photoURL}" class="w-8 h-8 rounded-full border border-zinc-200">` : `<div class="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center"><i data-lucide="user" class="w-4 h-4 text-zinc-500"></i></div>`}
                <span class="font-bold text-sm">${u.displayName || 'Sin Nombre'}</span>
            </td>
            <td class="py-3 px-4 text-sm text-zinc-600">${u.email || ''}</td>
            <td class="py-3 px-4 text-xs font-bold uppercase">${roleIcon} ${u.role === 'admin' ? 'Admin' : 'Estándar'}</td>
            <td class="py-3 px-4 text-sm font-bold text-emerald-600">${totalPurchasing}</td>
            <td class="py-3 px-4 text-xs text-zinc-500">${lastLogin}</td>
        </tr>
    `}).join('');
    initIcons();
};

/* =========================================
   SETTINGS
   ========================================= */
let currentSettingsFilter = 'Todos';

document.getElementById('settings-filters')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('settings-filter-btn')) {
        document.querySelectorAll('.settings-filter-btn').forEach(btn => {
            btn.classList.remove('bg-zinc-900', 'text-white', 'border-zinc-900');
            btn.classList.add('bg-white', 'text-zinc-600', 'border-zinc-200');
        });
        e.target.classList.add('bg-zinc-900', 'text-white', 'border-zinc-900');
        e.target.classList.remove('bg-white', 'text-zinc-600', 'border-zinc-200');

        currentSettingsFilter = e.target.dataset.filter;

        const panels = document.querySelectorAll('.settings-panel');
        if (currentSettingsFilter === 'Todos') {
            panels.forEach(p => p.classList.remove('hidden'));
        } else {
            panels.forEach(p => {
                if (p.classList.contains(currentSettingsFilter)) {
                    p.classList.remove('hidden');
                } else {
                    p.classList.add('hidden');
                }
            });
        }
    }
});

const updateSettingsMetrics = () => {
    const color = document.getElementById('cfg-color-1-text').value || '#000';
    const colorEl = document.getElementById('metric-theme-color');
    if (colorEl) {
        colorEl.textContent = color;
        colorEl.style.color = color;
    }
    const colorBox = document.getElementById('metric-theme-color-box');
    if (colorBox) colorBox.style.backgroundColor = color;

    // Shipping Rule
    const cost = parseFloat(document.getElementById('cfg-shipping-cost').value) || 0;
    const thresh = parseFloat(document.getElementById('cfg-shipping-threshold').value) || 0;

    let shippingText = '';
    if (thresh > 0) {
        shippingText = `Fijo $${cost} / Gratis > $${thresh}`;
    } else if (cost === 0) {
        shippingText = 'Envío Gratis Global';
    } else {
        shippingText = `Fijo: $${cost}`;
    }
    const shipEl = document.getElementById('metric-shipping-rule');
    if (shipEl) shipEl.textContent = shippingText;

    // Offer Rule
    const offerEnd = document.getElementById('cfg-offer-end').value;
    const offerRuleEl = document.getElementById('metric-offer-rule');
    if (offerRuleEl) {
        if (!offerEnd) {
            offerRuleEl.textContent = 'Inactiva';
            offerRuleEl.classList.remove('text-amber-600', 'text-red-500');
            offerRuleEl.classList.add('text-zinc-400');
        } else {
            const endDt = new Date(offerEnd);
            if (endDt > new Date()) {
                offerRuleEl.textContent = `Vence: ${endDt.toLocaleDateString()}`;
                offerRuleEl.classList.add('text-amber-600');
                offerRuleEl.classList.remove('text-zinc-400', 'text-red-500');
            } else {
                offerRuleEl.textContent = 'Expirada';
                offerRuleEl.classList.remove('text-amber-600', 'text-zinc-400');
                offerRuleEl.classList.add('text-red-500');
            }
        }
    }
};

document.getElementById('cfg-color-1').addEventListener('input', (e) => {
    document.getElementById('cfg-color-1-text').value = e.target.value;
    updateSettingsMetrics();
});
document.getElementById('cfg-color-1-text').addEventListener('input', (e) => {
    document.getElementById('cfg-color-1').value = e.target.value;
    updateSettingsMetrics();
});
document.getElementById('cfg-shipping-cost').addEventListener('input', updateSettingsMetrics);
document.getElementById('cfg-shipping-threshold').addEventListener('input', updateSettingsMetrics);
document.getElementById('cfg-offer-end').addEventListener('input', updateSettingsMetrics);

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

// Footer Builder UI Logic
const footerBuilderContainer = document.getElementById('footer-builder');
const addFooterSectionBtn = document.getElementById('add-footer-section');

const renderFooterBuilder = (footerData) => {
    if (!footerBuilderContainer) return;
    footerBuilderContainer.innerHTML = '';

    footerData.forEach((section, sIdx) => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'p-4 bg-zinc-50 border border-zinc-200 rounded-xl relative';
        sectionDiv.innerHTML = `
            <button class="absolute top-2 right-2 text-zinc-400 hover:text-red-600 transition-colors remove-section-btn" data-idx="${sIdx}">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
            <div class="mb-4">
                <label class="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Título de Sección</label>
                <input type="text" value="${section.title}" class="section-title-input w-full px-3 py-1.5 border rounded focus:border-black outline-none text-sm font-bold">
            </div>
            <div class="links-container space-y-2">
                ${(section.links || []).map((link, lIdx) => `
                    <div class="flex gap-2 items-center link-row">
                        <input type="text" value="${link.text}" placeholder="Texto" class="link-text-input flex-1 px-3 py-1.5 border rounded outline-none text-xs">
                        <input type="text" value="${link.url}" placeholder="URL" class="link-url-input flex-1 px-3 py-1.5 border rounded outline-none text-xs font-mono">
                        <button class="text-zinc-300 hover:text-red-500 remove-link-btn" data-sidx="${sIdx}" data-lidx="${lIdx}">
                            <i data-lucide="minus-circle" class="w-3 h-3"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button class="mt-3 text-[10px] font-bold text-blue-600 hover:underline uppercase add-link-btn flex items-center gap-1" data-idx="${sIdx}">
                <i data-lucide="plus" class="w-3 h-3"></i> Añadir Enlace
            </button>
        `;
        footerBuilderContainer.appendChild(sectionDiv);
    });
    initIcons();
};

footerBuilderContainer?.addEventListener('click', (e) => {
    const sectionBtn = e.target.closest('.remove-section-btn');
    const linkBtn = e.target.closest('.remove-link-btn');
    const addLinkBtn = e.target.closest('.add-link-btn');

    const getCurrentData = () => {
        const sections = [];
        document.querySelectorAll('#footer-builder > div').forEach(div => {
            const title = div.querySelector('.section-title-input').value;
            const links = [];
            div.querySelectorAll('.link-row').forEach(row => {
                links.push({
                    text: row.querySelector('.link-text-input').value,
                    url: row.querySelector('.link-url-input').value
                });
            });
            sections.push({ title, links });
        });
        return sections;
    };

    if (sectionBtn) {
        const data = getCurrentData();
        data.splice(sectionBtn.dataset.idx, 1);
        renderFooterBuilder(data);
    }
    if (addLinkBtn) {
        const data = getCurrentData();
        data[addLinkBtn.dataset.idx].links.push({ text: '', url: '#' });
        renderFooterBuilder(data);
    }
    if (linkBtn) {
        const data = getCurrentData();
        data[linkBtn.dataset.sidx].links.splice(linkBtn.dataset.lidx, 1);
        renderFooterBuilder(data);
    }
});

addFooterSectionBtn?.addEventListener('click', () => {
    const data = [];
    document.querySelectorAll('#footer-builder > div').forEach(div => {
        const title = div.querySelector('.section-title-input').value;
        const links = [];
        div.querySelectorAll('.link-row').forEach(row => {
            links.push({
                text: row.querySelector('.link-text-input').value,
                url: row.querySelector('.link-url-input').value
            });
        });
        data.push({ title, links });
    });
    data.push({ title: 'Nueva Sección', links: [] });
    renderFooterBuilder(data);
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Guardando...';
    initIcons();

    const storeName = document.getElementById('cfg-store-name').value;
    const storeDescription = document.getElementById('cfg-store-desc').value;
    const categoriesRaw = document.getElementById('cfg-categories').value;
    const categories = categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);

    // Get Footer Data
    const footer = [];
    document.querySelectorAll('#footer-builder > div').forEach(div => {
        const title = div.querySelector('.section-title-input').value;
        const links = [];
        div.querySelectorAll('.link-row').forEach(row => {
            links.push({
                text: row.querySelector('.link-text-input').value,
                url: row.querySelector('.link-url-input').value
            });
        });
        footer.push({ title, links });
    });

    const primaryColor = document.getElementById('cfg-color-1-text').value;
    const brandsRaw = document.getElementById('cfg-brands').value;
    const brands = brandsRaw.split(',').map(s => s.trim()).filter(Boolean);

    let heroImage = document.getElementById('cfg-hero-image').value;
    const heroSubtitle = document.getElementById('cfg-hero-subtitle').value;
    const heroTitle = document.getElementById('cfg-hero-title').value;
    const offerEndTime = document.getElementById('cfg-offer-end').value;
    const whatsapp = document.getElementById('cfg-whatsapp').value.replace(/\D/g, '');
    const shippingCost = parseFloat(document.getElementById('cfg-shipping-cost').value) || 0;
    const shippingFreeThreshold = parseFloat(document.getElementById('cfg-shipping-threshold').value) || 0;

    const covers = {
        mujer: document.getElementById('cfg-cover-mujer').value,
        hombre: document.getElementById('cfg-cover-hombre').value,
        ninos: document.getElementById('cfg-cover-ninos').value,
        accesorios: document.getElementById('cfg-cover-accesorios').value
    };

    try {
        // Upload Files if present
        const heroFile = document.getElementById('cfg-hero-file').files[0];
        if (heroFile) heroImage = await uploadImage(heroFile, 'branding/hero');

        const coverFiles = {
            mujer: document.getElementById('cfg-file-mujer').files[0],
            hombre: document.getElementById('cfg-file-hombre').files[0],
            ninos: document.getElementById('cfg-file-ninos').files[0],
            accesorios: document.getElementById('cfg-file-accesorios').files[0]
        };

        for (const [key, file] of Object.entries(coverFiles)) {
            if (file) {
                covers[key] = await uploadImage(file, `branding/covers/${key}`);
            }
        }

        const payload = {
            storeName,
            storeDescription,
            categories,
            footer,
            primaryColor,
            brands,
            offerEndTime,
            whatsapp,
            shippingCost,
            shippingFreeThreshold,
            hero: {
                image: heroImage,
                subtitle: heroSubtitle,
                title: heroTitle
            },
            covers,
            updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'settings', 'site_config'), payload, { merge: true });
        showToast('Configuraciones guardadas y activas en web.');

        // Reset file inputs
        document.querySelectorAll('input[type="file"]').forEach(input => input.value = '');
        document.querySelectorAll('input[type="url"]').forEach(input => input.placeholder = "URL de imagen");

    } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Guardar Cambios';
        initIcons();
    }
});

// ==========================================
// Coupons Management
// ==========================================
let allCoupons = [];
const couponsTableBody = document.getElementById('coupons-table-body');
const couponForm = document.getElementById('coupon-form');

const renderCoupons = () => {
    if (!couponsTableBody) return;

    if (allCoupons.length === 0) {
        couponsTableBody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-zinc-400 font-serif italic">No hay cupones creados</td></tr>`;
        return;
    }

    couponsTableBody.innerHTML = allCoupons.map(c => {
        const valStr = c.type === 'percentage' ? `${c.discount}%` : `$${c.discount.toFixed(2)}`;
        const statusBadge = c.active
            ? `<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[10px] font-bold uppercase">Activo</span>`
            : `<span class="bg-zinc-200 text-zinc-600 px-2 py-1 rounded text-[10px] font-bold uppercase">Inactivo</span>`;

        return `
            <tr class="hover:bg-zinc-50 border-b border-zinc-100 last:border-0">
                <td class="py-3 font-mono font-bold text-black uppercase">${c.id}</td>
                <td class="py-3 font-medium">${valStr}</td>
                <td class="py-3">${statusBadge}</td>
                <td class="py-3 text-right">
                    <button class="delete-coupon-btn text-rose-500 hover:bg-rose-50 p-2 rounded transition-colors" data-id="${c.id}">
                        <i data-lucide="trash-2" class="w-4 h-4 text-center mx-auto"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach delete listeners
    document.querySelectorAll('.delete-coupon-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm('¿Seguro de eliminar este cupón?')) return;
            const id = e.currentTarget.dataset.id;
            try {
                await deleteDoc(doc(db, 'coupons', id));
                showToast('Cupón eliminado.');
            } catch (err) {
                handleFirestoreError(err, OperationType.DELETE, `coupons/${id}`);
            }
        });
    });
    initIcons();
};

if (couponForm) {
    couponForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('cp-code').value.trim().toUpperCase();
        const type = document.getElementById('cp-type').value;
        const discount = parseFloat(document.getElementById('cp-discount').value);
        const active = document.getElementById('cp-active').checked;

        if (!code) return;

        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        try {
            await setDoc(doc(db, 'coupons', code), {
                discount,
                type,
                active,
                createdAt: serverTimestamp()
            });
            showToast('Cupón guardado.');
            couponForm.reset();
        } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `coupons/${code}`);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar Cupón';
        }
    });
}

/* =========================================
   PUNTO DE VENTA (POS) Y FACTURACIÓN
   ========================================= */

window.printInvoice = (orderIdOrObject) => {
    let order = typeof orderIdOrObject === 'string' ? allOrders.find(o => o.id === orderIdOrObject) : orderIdOrObject;
    if (!order && typeof orderIdOrObject === 'string') {
        const directObj = allOrders.find(o => o.id === orderIdOrObject);
        if (!directObj) return showToast('Error: Orden no encontrada. Si recién la creó, intente visualizarla desde Pedidos.');
        order = directObj;
    }

    if (!order) return;

    const dateStr = order.createdAt && typeof order.createdAt.toDate === 'function' ? new Date(order.createdAt.toDate()).toLocaleString() : new Date().toLocaleString();
    const itemsHtml = (order.items || []).map(item => `
        <tr style="border-bottom: 1px dashed #ccc;">
            <td style="padding: 4px 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.quantity || 1}x ${item.name}</td>
            <td style="padding: 4px 0; text-align: right;">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
        </tr>
    `).join('');

    const storeName = document.getElementById('cfg-store-name')?.value || 'StyleHN';

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Factura #${order.id}</title>
            <style>
                body { 
                    font-family: 'Courier New', Courier, monospace; 
                    margin: 0; padding: 10px; width: 300px; 
                    color: #000; font-size: 12px;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .text-lg { font-size: 16px; }
                .mb-2 { margin-bottom: 8px; }
                .mb-4 { margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; }
                .divider { border-top: 1px dashed #000; margin: 10px 0; }
                @media print {
                    @page { margin: 0; }
                    body { margin: 0.5cm; }
                }
            </style>
        </head>
        <body>
            <div class="text-center mb-4">
                <div class="font-bold text-lg">${storeName}</div>
                <div>TICKET DE COMPRA</div>
            </div>
            
            <div class="mb-2">
                <div>Fecha: ${dateStr}</div>
                <div>Orden #: ${order.id}</div>
                <div>Cliente: ${order.userName || 'Consumidor Final'}</div>
                <div>Método: ${order.paymentMethod || 'Efectivo'}</div>
            </div>

            <div class="divider"></div>
            
            <table>
                <thead>
                    <tr style="border-bottom: 1px solid #000;">
                        <th style="text-align: left; padding-bottom: 4px;">Cant. Articulo</th>
                        <th style="text-align: right; padding-bottom: 4px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="divider"></div>

            <table style="width: 100%;">
                <tr>
                    <td>Subtotal:</td>
                    <td class="text-right">$${(order.subtotal || order.total || 0).toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Envío:</td>
                    <td class="text-right">${(order.shippingCost === 0 || !order.shippingCost) ? '$0.00' : '$' + order.shippingCost.toFixed(2)}</td>
                </tr>
                ${order.discountAmount ? `<tr><td>Descuento:</td><td class="text-right">-$${order.discountAmount.toFixed(2)}</td></tr>` : ''}
                <tr class="font-bold text-lg">
                    <td style="padding-top: 5px;">TOTAL:</td>
                    <td class="text-right" style="padding-top: 5px;">$${(order.total || 0).toFixed(2)}</td>
                </tr>
            </table>
            
            <div class="divider"></div>
            
            <div class="text-center mt-4">
                <div>¡Gracias por su compra!</div>
                <div style="font-size: 10px; color: #666; margin-top: 5px;">* Documento no válido como factura fiscal si no contiene datos impositivos adjuntos *</div>
            </div>

            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

let posCart = [];
const posSearchInput = document.getElementById('pos-search');
const posCatFilter = document.getElementById('pos-category-filter');
const posGrid = document.getElementById('pos-product-grid');
const posCartContainer = document.getElementById('pos-cart-items');
const posDiscountInput = document.getElementById('pos-discount');
const posPaymentMethod = document.getElementById('pos-payment-method');
const posSubtotalEl = document.getElementById('pos-subtotal');
const posTotalEl = document.getElementById('pos-total');
const posDiscountRow = document.getElementById('pos-discount-row');
const posDiscountVal = document.getElementById('pos-discount-val');
const posCheckoutBtn = document.getElementById('pos-checkout-btn');
const posClearBtn = document.getElementById('pos-clear-cart');

const updatePosCategories = () => {
    if (!posCatFilter) return;
    const cats = [...new Set(allProducts.map(p => p.category))].filter(Boolean);
    const currentValue = posCatFilter.value;
    posCatFilter.innerHTML = `<option value="Todos">Todas las Cat.</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    if (cats.includes(currentValue)) posCatFilter.value = currentValue;
};

const renderPosProducts = () => {
    if (!posGrid) return;
    updatePosCategories();

    const query = (posSearchInput.value || '').toLowerCase();
    const cat = posCatFilter.value;

    let filtered = allProducts;
    if (cat !== 'Todos') filtered = filtered.filter(p => p.category === cat);
    if (query) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query));
    }

    if (filtered.length === 0) {
        posGrid.innerHTML = '<div class="text-zinc-400 text-sm italic col-span-full text-center py-8">No se encontraron productos.</div>';
        return;
    }

    posGrid.innerHTML = filtered.map(p => {
        const stockStr = (p.stock > 0) ? `<span class="text-emerald-500 font-bold">${p.stock} en disp.</span>` : `<span class="text-rose-500 font-bold">Agotado</span>`;
        const disabledAttr = p.stock <= 0 ? 'disabled' : '';
        const opacityClass = p.stock <= 0 ? 'opacity-50 grayscale' : '';

        return `
        <button class="pos-add-item bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-black hover:shadow-lg transition-all text-left flex flex-col ${opacityClass}" ${disabledAttr} data-id="${p.id}">
            <div class="h-32 w-full bg-zinc-100 flex-shrink-0">
                ${p.image ? `<img src="${p.image}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-zinc-300"><i data-lucide="image" class="w-8 h-8"></i></div>`}
            </div>
            <div class="p-3 flex-1 flex flex-col">
                <p class="font-bold text-sm text-zinc-900 leading-tight mb-1 line-clamp-2">${p.name}</p>
                <div class="mt-auto flex justify-between items-end">
                    <span class="font-black text-black">$${p.price.toFixed(2)}</span>
                    <span class="text-[10px]">${stockStr}</span>
                </div>
            </div>
        </button>
        `;
    }).join('');
    initIcons();
};

const renderPosCart = () => {
    if (!posCartContainer) return;

    if (posCart.length === 0) {
        posCartContainer.innerHTML = '<div class="text-center text-zinc-400 text-sm italic py-8">Caja vacía. Selecciona productos.</div>';
        posSubtotalEl.textContent = '$0.00';
        posTotalEl.textContent = '$0.00';
        posDiscountRow.classList.add('hidden');
        posCheckoutBtn.disabled = true;
        return;
    }

    posCartContainer.innerHTML = posCart.map((item, idx) => `
        <div class="flex gap-3 bg-zinc-50 border border-zinc-200 p-2 rounded-xl">
            <div class="w-12 h-12 bg-zinc-200 rounded shadow-sm overflow-hidden flex-shrink-0">
                ${item.image ? `<img src="${item.image}" class="w-full h-full object-cover">` : ''}
            </div>
            <div class="flex-1 flex flex-col justify-center">
                <p class="text-xs font-bold text-zinc-900 leading-tight line-clamp-1">${item.name}</p>
                <div class="flex justify-between items-center mt-1">
                    <span class="font-black text-sm">$${(item.price * item.quantity).toFixed(2)}</span>
                    <div class="flex items-center gap-2 bg-white rounded border border-zinc-200 px-1">
                        <button class="pos-qty-btn text-zinc-500 hover:text-black py-0.5 px-1 font-bold" data-idx="${idx}" data-diff="-1">-</button>
                        <span class="text-xs font-bold w-4 text-center">${item.quantity}</span>
                        <button class="pos-qty-btn text-zinc-500 hover:text-black py-0.5 px-1 font-bold" data-idx="${idx}" data-diff="1">+</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    updatePosMath();
};

const updatePosMath = () => {
    const subtotal = posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discount = parseFloat(posDiscountInput?.value) || 0;
    if (discount < 0) discount = 0;
    if (discount > subtotal) discount = subtotal; // Cannot discount more than subtotal

    const total = subtotal - discount;

    posSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    if (discount > 0) {
        posDiscountRow.classList.remove('hidden');
        posDiscountVal.textContent = `-$${discount.toFixed(2)}`;
    } else {
        posDiscountRow.classList.add('hidden');
    }
    posTotalEl.textContent = `$${total.toFixed(2)}`;

    posCheckoutBtn.disabled = posCart.length === 0;
};

// Event Listeners for POS
if (posGrid) {
    posGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.pos-add-item');
        if (!btn) return;
        const id = btn.dataset.id;
        const product = allProducts.find(p => p.id === id);
        if (!product || product.stock <= 0) return;

        const existing = posCart.find(item => item.id === id);
        if (existing) {
            if (existing.quantity < product.stock) {
                existing.quantity++;
            } else {
                showToast('Stock insuficiente.');
            }
        } else {
            posCart.unshift({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
                quantity: 1,
                stock: product.stock
            });
        }
        renderPosCart();
    });
}

if (posCartContainer) {
    posCartContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.pos-qty-btn');
        if (!btn) return;
        const idx = parseInt(btn.dataset.idx);
        const diff = parseInt(btn.dataset.diff);

        const item = posCart[idx];
        if (!item) return;

        item.quantity += diff;
        if (item.quantity <= 0) {
            posCart.splice(idx, 1);
        } else if (item.quantity > item.stock) {
            item.quantity = item.stock;
            showToast('Stock máximo alcanzado.');
        }
        renderPosCart();
    });
}

posSearchInput?.addEventListener('input', renderPosProducts);
posCatFilter?.addEventListener('change', renderPosProducts);
posDiscountInput?.addEventListener('input', updatePosMath);
posClearBtn?.addEventListener('click', () => {
    if (posCart.length > 0 && confirm('¿Vaciar la caja?')) {
        posCart = [];
        if (posDiscountInput) posDiscountInput.value = '';
        renderPosCart();
    }
});

// Registrar Venta
posCheckoutBtn?.addEventListener('click', async () => {
    if (posCart.length === 0) return;

    const method = posPaymentMethod.value;
    const subtotal = posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = parseFloat(posDiscountInput?.value) || 0;
    const total = subtotal - discount;

    posCheckoutBtn.disabled = true;
    posCheckoutBtn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> Registrando...';
    initIcons();

    try {
        const orderId = 'POS' + Date.now().toString().slice(-6) + Math.random().toString(36).substring(2, 4).toUpperCase();

        // 1. Deduct Stock
        for (const item of posCart) {
            const productRef = doc(db, 'products', item.id);
            await updateDoc(productRef, { stock: increment(-item.quantity) });
        }

        // 2. Create Order
        const orderData = {
            id: orderId,
            userId: 'store-pos',
            userName: 'Venta Física (Local)',
            userEmail: 'admin@local.tienda',
            paymentMethod: method,
            items: posCart.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image,
                size: 'N/A'
            })),
            subtotal,
            shippingCost: 0,
            discountAmount: discount,
            total,
            status: 'Entregado',
            deliveryType: 'Física / Local',
            stockDeducted: true,
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, 'orders', orderId), orderData);

        showToast('Venta registrada exitosamente.');

        // Ask to Print
        if (confirm('¿Desea imprimir el recibo (Ticket)?')) {
            printInvoice(orderId);
        }

        // Clear
        posCart = [];
        if (posDiscountInput) posDiscountInput.value = '';
        renderPosCart();

    } catch (err) {
        console.error("Error procesando POS:", err);
        showToast('Error al registrar la venta.');
    } finally {
        posCheckoutBtn.disabled = false;
        posCheckoutBtn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> Cobrar y Finalizar';
        initIcons();
    }
});
