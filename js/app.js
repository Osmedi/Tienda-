import { auth, db, loginWithGoogle, logout, getRedirectResult, handleFirestoreError, OperationType } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, query, where, updateDoc, increment, getDoc } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

// Initialize Lucide icons using the global object from CDN
const initIcons = () => {
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }
};
document.addEventListener('DOMContentLoaded', initIcons);
initIcons();

// State
let currentUser = null;
let cartItems = [];
let wishlistItems = [];
let allProducts = [];
let globalFilteredProducts = [];
let currentCategory = null;
let currentSearchQuery = '';
let currentBrand = null;
let appliedCoupon = null;

// Default category based on path
const pathName = window.location.pathname.toLowerCase();
if (pathName.includes('mujer.html')) currentCategory = 'Mujer';
else if (pathName.includes('hombre.html')) currentCategory = 'Hombre';
else if (pathName.includes('ninos.html')) currentCategory = 'Niños';
let cartUnsubscribe = null;
let wishlistUnsubscribe = null;
let productsUnsubscribe = null;
let userOrders = [];
let ordersUnsubscribe = null;

// Settings
let globalShippingCost = 0;
let globalShippingThreshold = 0;

// Modal State
let currentViewedProduct = null;
let selectedSize = null;

// Elements
const productsGrid = document.getElementById('products-grid');
const adminBtn = document.getElementById('admin-btn');
const cartCountEl = document.getElementById('cart-count');
const floatingCartCountEl = document.getElementById('floating-cart-count');
const wishlistCountEl = document.getElementById('wishlist-count');
const toastContainer = document.getElementById('toast-container');
const searchOverlay = document.getElementById('search-overlay');
const searchBtn = document.getElementById('search-btn');
const closeSearch = document.getElementById('close-search');
const searchInput = document.getElementById('search-input');
const cartSidebar = document.getElementById('cart-sidebar');
const cartOverlay = document.getElementById('cart-overlay');
const closeCart = document.getElementById('close-cart');
const wishlistSidebar = document.getElementById('wishlist-sidebar');
const wishlistOverlay = document.getElementById('wishlist-overlay');
const closeWishlist = document.getElementById('close-wishlist');
const cartItemsContainer = document.getElementById('cart-items');
const wishlistItemsContainer = document.getElementById('wishlist-items');
const cartTotalEl = document.getElementById('cart-total');
const ordersSidebar = document.getElementById('orders-sidebar');
const ordersOverlay = document.getElementById('orders-overlay');
const closeOrders = document.getElementById('close-orders');
const ordersItemsContainer = document.getElementById('orders-items');
const logoutBtn = document.getElementById('logout-btn');
const authBtn = document.getElementById('auth-btn');
const mobileAuthBtn = document.getElementById('mobile-auth-btn');

// Checkout Elements
const checkoutSidebar = document.getElementById('checkout-sidebar');
const checkoutOverlay = document.getElementById('checkout-overlay');
const closeCheckout = document.getElementById('close-checkout');
const triggerCheckoutBtn = document.getElementById('trigger-checkout-btn');
const checkoutForm = document.getElementById('checkout-form');
const coDeliveryType = document.getElementById('co-delivery-type');
const coShippingFields = document.getElementById('co-shipping-fields');

// Sidebar Logic
const toggleSidebar = (sidebar, open) => {
  if (!sidebar) return;
  const content = sidebar.querySelector('div:last-child');
  if (open) {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('sidebar-open');
    setTimeout(() => content?.classList.add('sidebar-content-enter'), 10);
  } else {
    content?.classList.remove('sidebar-content-enter');
    setTimeout(() => {
      sidebar.classList.add('hidden');
      sidebar.classList.remove('sidebar-open');
    }, 300);
  }
};

// Toast System
const showToast = (message) => {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'bg-zinc-900 text-white px-6 py-3 rounded-full shadow-2xl text-sm font-medium toast-enter pointer-events-auto';
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.replace('toast-enter', 'toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// Update UI
const updateUI = () => {
  const cartCount = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  if (cartCountEl) cartCountEl.textContent = cartCount.toString();
  if (floatingCartCountEl) floatingCartCountEl.textContent = cartCount.toString();

  if (wishlistCountEl) {
    wishlistCountEl.textContent = wishlistItems.length.toString();
    wishlistCountEl.classList.toggle('hidden', wishlistItems.length === 0);
  }

  renderCart();
  renderWishlist();
  updateHeartIcons();
  renderTendencias();
  renderProducts();
  renderOrders();
};

const renderOrders = () => {
  if (!ordersItemsContainer) return;
  if (userOrders.length === 0) {
    ordersItemsContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-zinc-400 gap-4">
        <i data-lucide="package" class="w-12 h-12 opacity-20"></i>
        <p class="font-serif italic font-medium">No has realizado ningún pedido aún</p>
      </div>
    `;
    initIcons();
    return;
  }

  const sorted = [...userOrders].sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

  ordersItemsContainer.innerHTML = sorted.map(o => {
    const dateStr = o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString() : '';
    let colorClass = 'bg-zinc-100 text-zinc-600';
    if (o.status === 'Enviado') colorClass = 'bg-blue-100 text-blue-700';
    if (o.status === 'Entregado') colorClass = 'bg-emerald-100 text-emerald-700';
    if (o.status === 'Cancelado') colorClass = 'bg-rose-100 text-rose-700';

    return `
      <div class="bg-white border text-sm border-zinc-200 rounded-xl p-4 shadow-sm group">
          <div class="flex justify-between items-center mb-3 border-b border-zinc-100 pb-2">
              <div>
                  <p class="font-mono text-[10px] text-zinc-400 tracking-wider">Orden #${o.id.substring(0, 8)}</p>
                  <p class="text-xs text-zinc-900 font-bold mt-1">${dateStr}</p>
              </div>
              <span class="px-2 py-1 text-[10px] font-bold uppercase rounded ${colorClass}">${o.status || 'Pendiente'}</span>
          </div>
          <div class="space-y-3 mb-4 mt-2">
              ${(o.items || []).map(item => `
                  <div class="flex items-center gap-3">
                      <img src="${item.image}" class="w-10 h-10 object-cover rounded bg-zinc-50 border border-zinc-100">
                      <div class="flex-1 min-w-0">
                          <p class="font-bold text-xs text-zinc-900 truncate">${item.name}</p>
                          <p class="text-[10px] text-zinc-500 mt-0.5 font-medium">Cant: ${item.quantity || 1} &times; $${(item.price || 0).toFixed(2)}</p>
                      </div>
                  </div>
              `).join('')}
          </div>
          <div class="border-t border-zinc-100 pt-3 flex justify-between items-center bg-zinc-50 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl mt-2">
              <span class="text-xs font-bold text-zinc-500">Total pagado</span>
              <span class="font-black text-sm">$${(o.total || 0).toFixed(2)}</span>
          </div>
      </div>
      `;
  }).join('');

  initIcons();
};

const applyFilters = () => {
  let filtered = [...allProducts];

  if (currentCategory && currentCategory !== 'Todos') {
    filtered = filtered.filter(p => p.category === currentCategory);
  }

  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }

  if (currentBrand) {
    filtered = filtered.filter(p => p.brand === currentBrand);
  }

  globalFilteredProducts = filtered;
};

const renderTendencias = () => {
  const tendenciasContainer = document.getElementById('tendencias-container');
  if (!tendenciasContainer) return;

  // Select trending products and restrict to 4 maximum for the UI design
  const trends = allProducts.filter(p => p.isTrending).slice(0, 4);

  if (trends.length === 0) {
    tendenciasContainer.innerHTML = '<p class="text-zinc-500 font-serif italic py-8">Nuevas tendencias próximamente...</p>';
    return;
  }

  tendenciasContainer.innerHTML = trends.map(product => {
    const isAgotado = (product.stock !== undefined && product.stock <= 0);
    const agotadoOverlay = isAgotado ? `<div class="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center pointer-events-none"><span class="bg-[#ba0036] text-white px-4 py-2 text-xs font-black tracking-[0.3em] uppercase rotate-[-5deg] ring-4 ring-[#ba0036]/30">Agotado</span></div>` : '';
    const addBtn = isAgotado ? '' : `<button class="add-to-cart absolute bottom-4 right-4 bg-zinc-900 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all cursor-pointer z-20" data-id="${product.id}"><i data-lucide="plus" class="w-6 h-6"></i></button>`;

    return `
        <div class="flex flex-col gap-4 group text-left relative overflow-hidden">
          <div class="relative aspect-[3/4] rounded-lg overflow-hidden bg-zinc-100">
            ${agotadoOverlay}
            <img class="w-full h-full object-cover transition-transform duration-700 ${!isAgotado ? 'group-hover:scale-110' : ''}" src="${product.image}" alt="${product.name}" referrerpolicy="no-referrer" />
            ${product.isNew ? '<span class="absolute top-4 left-4 bg-white px-3 py-1 text-[10px] font-bold uppercase rounded-full tracking-tighter z-20 shadow-sm text-zinc-900">Nuevo</span>' : ''}
            ${product.isOffer && !isAgotado ? '<span class="absolute top-4 right-4 bg-[#ba0036] px-3 py-1 text-[10px] font-bold uppercase rounded-full tracking-tighter z-20 shadow-sm text-white">Oferta</span>' : ''}
            <button class="wishlist-toggle absolute ${product.isOffer && !isAgotado ? 'top-14' : 'top-4'} right-4 bg-white/80 backdrop-blur-[4px] text-zinc-500 p-2 rounded-full hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer z-20 shadow-sm" data-id="${product.id}">
              <i data-lucide="heart" class="w-4 h-4"></i>
            </button>
            ${addBtn}
          </div>
          <div class="px-1">
            <h4 class="font-serif text-[17px] leading-tight mb-1 text-zinc-900 tracking-tight">${product.name}</h4>
            <p class="font-bold text-zinc-600">$${(product.price || 0).toFixed(2)}</p>
          </div>
        </div>
        `;
  }).join('');

  document.querySelectorAll('#tendencias-container .group').forEach(card => {
    const imgContainer = card.querySelector('.relative');
    imgContainer.classList.add('cursor-pointer');
    imgContainer.addEventListener('click', (e) => {
      if (e.target.closest('.wishlist-toggle') || e.target.closest('.add-to-cart')) return;
      const btn = card.querySelector('.add-to-cart');
      // If it's exhausted, there is no add button but we still want to open the modal
      if (btn) {
        openProductDetails(btn.dataset.id);
      } else {
        // Recover ID from wishlist button
        const wBtn = card.querySelector('.wishlist-toggle');
        if (wBtn) openProductDetails(wBtn.dataset.id);
      }
    });
  });

  setupProductListeners();
  initIcons();
};

const renderProducts = () => {
  applyFilters();
  if (!productsGrid) return;

  if (globalFilteredProducts.length === 0) {
    productsGrid.innerHTML = `
      <div class="col-span-full py-20 text-center text-zinc-400">
        <p class="font-serif italic text-xl">No hay productos disponibles para este filtro</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = globalFilteredProducts.map(product => {
    const isAgotado = (product.stock !== undefined && product.stock <= 0);
    const agotadoOverlay = isAgotado ? `<div class="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center pointer-events-none"><span class="bg-[#ba0036] text-white px-4 py-2 text-xs font-black tracking-[0.3em] uppercase rotate-[-5deg] ring-4 ring-[#ba0036]/30">Agotado</span></div>` : '';
    const addBtn = isAgotado ? '' : `<button class="add-to-cart absolute bottom-4 right-4 bg-zinc-900 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all cursor-pointer z-20" data-id="${product.id}"><i data-lucide="plus" class="w-6 h-6"></i></button>`;

    return `
    <div class="flex flex-col gap-4 group text-left relative overflow-hidden">
      <div class="relative aspect-[3/4] rounded-lg overflow-hidden bg-zinc-100">
        ${agotadoOverlay}
        <img class="w-full h-full object-cover transition-transform duration-700 ${!isAgotado ? 'group-hover:scale-110' : ''}" src="${product.image}" alt="${product.name}" referrerpolicy="no-referrer" />
        ${product.isNew ? '<span class="absolute top-4 left-4 bg-white px-3 py-1 text-[10px] font-bold uppercase rounded-full tracking-tighter z-20 shadow-sm text-zinc-900">Nuevo</span>' : ''}
        ${product.isOffer && !isAgotado ? '<span class="absolute top-4 right-4 bg-[#ba0036] px-3 py-1 text-[10px] font-bold uppercase rounded-full tracking-tighter z-20 shadow-sm text-white">Oferta</span>' : ''}
        <button class="wishlist-toggle absolute ${product.isOffer && !isAgotado ? 'top-14' : 'top-4'} right-4 bg-white/80 backdrop-blur-[4px] text-zinc-500 p-2 rounded-full hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer z-20 shadow-sm" data-id="${product.id}">
          <i data-lucide="heart" class="w-4 h-4"></i>
        </button>
        ${addBtn}
      </div>
      <div class="px-1">
        <h4 class="font-serif text-[17px] leading-tight mb-1 text-zinc-900 tracking-tight">${product.name}</h4>
        <p class="font-bold text-zinc-600">$${(product.price || 0).toFixed(2)}</p>
      </div>
    </div>
  `}).join('');

  // Attach card click for details
  document.querySelectorAll('#products-grid .group').forEach(card => {
    // Add cursor-pointer to the image container
    const imgContainer = card.querySelector('.relative');
    imgContainer.classList.add('cursor-pointer');

    imgContainer.addEventListener('click', (e) => {
      // Don't trigger if they clicked wishist or add directly
      if (e.target.closest('.wishlist-toggle') || e.target.closest('.add-to-cart')) return;

      const btn = card.querySelector('.add-to-cart');
      if (btn) openProductDetails(btn.dataset.id);
    });
  });

  // Re-attach listeners for dynamic products
  setupProductListeners();
  updateHeartIcons();
  initIcons();
};



const updateHeartIcons = () => {
  document.querySelectorAll('.wishlist-toggle').forEach(btn => {
    const productCard = btn.closest('.group');
    const name = productCard?.querySelector('h4')?.textContent || '';
    const isWishlisted = wishlistItems.some(item => item.id === name);

    if (isWishlisted) {
      btn.classList.add('text-[#ba0036]', 'bg-white');
    } else {
      btn.classList.remove('text-[#ba0036]', 'bg-white');
    }
  });
};

const renderCart = () => {
  if (!cartItemsContainer || !cartTotalEl) return;

  if (cartItems.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-zinc-400 gap-4">
        <i data-lucide="shopping-bag" class="w-12 h-12 opacity-20"></i>
        <p class="font-serif italic">Tu carrito está vacío</p>
      </div>
    `;
    cartTotalEl.textContent = '$0.00';
    initIcons();
    return;
  }

  let total = 0;
  cartItemsContainer.innerHTML = cartItems.map(item => {
    const price = item.price || 0;
    total += price * (item.quantity || 1);
    const sizeStr = item.size ? `Talla: ${item.size}` : '';
    return `
      <div class="flex gap-4 items-center group">
        <div class="w-20 h-24 bg-zinc-100 rounded-lg overflow-hidden flex-shrink-0">
          <img src="${item.image}" class="w-full h-full object-cover" alt="${item.name}">
        </div>
        <div class="flex-1">
          <h4 class="font-serif italic text-lg leading-tight">${item.name}</h4>
          <p class="text-zinc-500 text-sm mb-2">${sizeStr}</p>
          <div class="flex justify-between items-center">
            <span class="font-bold">$${price.toFixed(2)}</span>
            <div class="flex items-center gap-3">
              <button class="remove-from-cart p-1 hover:text-[#ba0036] transition-colors cursor-pointer" data-id="${item.id}">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cartTotalEl.textContent = `$${total.toFixed(2)}`;

  // Add listeners to remove buttons
  document.querySelectorAll('.remove-from-cart').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (currentUser && id) {
        try {
          await deleteDoc(doc(db, `users/${currentUser.uid}/cart`, id));
          showToast('Producto eliminado del carrito');
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `users/${currentUser.uid}/cart/${id}`);
        }
      }
    });
  });

  initIcons();
};

const renderWishlist = () => {
  if (!wishlistItemsContainer) return;

  if (wishlistItems.length === 0) {
    wishlistItemsContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-zinc-400 gap-4">
        <i data-lucide="heart" class="w-12 h-12 opacity-20"></i>
        <p class="font-serif italic">No tienes favoritos aún</p>
      </div>
    `;
    initIcons();
    return;
  }

  wishlistItemsContainer.innerHTML = wishlistItems.map(item => {
    const pPrice = item.price || 0;
    return `
      <div class="flex gap-4 items-center group">
        <div class="w-20 h-24 bg-zinc-100 rounded-lg overflow-hidden flex-shrink-0">
          <img src="${item.image}" class="w-full h-full object-cover" alt="${item.name}">
        </div>
        <div class="flex-1">
          <h4 class="font-serif italic text-lg leading-tight">${item.name}</h4>
          <div class="flex justify-between items-center mt-2">
            <span class="font-bold">$${pPrice.toFixed(2)}</span>
            <button class="remove-from-wishlist p-1 hover:text-[#ba0036] transition-colors cursor-pointer" data-id="${item.id}">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.remove-from-wishlist').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (currentUser && id) {
        try {
          await deleteDoc(doc(db, `users/${currentUser.uid}/wishlist`, id));
          showToast('Eliminado de favoritos');
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `users/${currentUser.uid}/wishlist/${id}`);
        }
      }
    });
  });

  initIcons();
};

// Handle Redirect Result
if (typeof getRedirectResult === 'function') {
  getRedirectResult(auth).catch(err => console.error("Error al procesar redirección:", err));
}

// Auth Logic
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  // Unsubscribe from previous listeners
  if (cartUnsubscribe) cartUnsubscribe();
  if (wishlistUnsubscribe) wishlistUnsubscribe();

  if (user) {
    let isAdminUser = user.email === 'lopezosmedi456@gmail.com';
    let existingRole = null;

    // First, fetch existing profile to not overwrite admin roles
    getDoc(doc(db, 'user_profiles', user.uid)).then((docSnap) => {
      if (docSnap.exists()) {
        existingRole = docSnap.data().role;
        if (existingRole === 'admin') isAdminUser = true;
      }

      if (isAdminUser) {
        adminBtn?.classList.remove('hidden');
        adminBtn.onclick = () => window.location.href = 'admin.html';
      } else {
        adminBtn?.classList.add('hidden');
      }

      // Save user profile 
      setDoc(doc(db, 'user_profiles', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Usuario',
        photoURL: user.photoURL || null,
        lastLogin: serverTimestamp(),
        role: isAdminUser ? 'admin' : (existingRole || 'user')
      }, { merge: true }).catch(e => console.error("Error saving profile", e));
    });

    showToast(`Bienvenido, ${user.displayName || 'Usuario'}`);
    if (authBtn) authBtn.innerHTML = `<i data-lucide="user" class="w-5 h-5 text-[#ba0036]"></i>`;
    if (mobileAuthBtn) mobileAuthBtn.innerHTML = `<i data-lucide="user" class="w-5 h-5 text-[#ba0036]"></i><span class="text-[10px] font-bold uppercase tracking-tighter">Perfil</span>`;

    // Listen to Orders
    if (ordersUnsubscribe) ordersUnsubscribe();
    const qOrders = query(collection(db, 'orders'), where('userId', '==', user.uid));
    ordersUnsubscribe = onSnapshot(qOrders, (snapshot) => {
      userOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateUI();
    });

    // Listen to Cart
    cartUnsubscribe = onSnapshot(collection(db, `users/${user.uid}/cart`), (snapshot) => {
      cartItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateUI();
    }, (e) => handleFirestoreError(e, OperationType.LIST, `users/${user.uid}/cart`));

    // Listen to Wishlist
    wishlistUnsubscribe = onSnapshot(collection(db, `users/${user.uid}/wishlist`), (snapshot) => {
      wishlistItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateUI();
    }, (e) => handleFirestoreError(e, OperationType.LIST, `users/${user.uid}/wishlist`));

  } else {
    if (authBtn) authBtn.innerHTML = `<i data-lucide="user" class="w-5 h-5 text-zinc-900"></i>`;
    if (mobileAuthBtn) mobileAuthBtn.innerHTML = `<i data-lucide="user" class="w-5 h-5 text-zinc-400"></i><span class="text-[10px] font-bold uppercase tracking-tighter">Perfil</span>`;
    cartItems = [];
    wishlistItems = [];
    userOrders = [];
    if (ordersUnsubscribe) { ordersUnsubscribe(); ordersUnsubscribe = null; }
    updateUI();
  }
  initIcons();
});

// Countdown Timer Logic
let countdownInterval;
const startCountdown = (endDateString) => {
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');

  if (!hoursEl || !minutesEl || !secondsEl) return;
  if (countdownInterval) clearInterval(countdownInterval);

  if (!endDateString) {
    hoursEl.textContent = '00';
    minutesEl.textContent = '00';
    secondsEl.textContent = '00';
    return;
  }

  countdownInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = new Date(endDateString).getTime() - now;

    if (distance < 0) {
      clearInterval(countdownInterval);
      hoursEl.textContent = '00';
      minutesEl.textContent = '00';
      secondsEl.textContent = '00';
      return;
    }

    const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((distance % (1000 * 60)) / 1000);

    hoursEl.textContent = h.toString().padStart(2, '0');
    minutesEl.textContent = m.toString().padStart(2, '0');
    secondsEl.textContent = s.toString().padStart(2, '0');
  }, 1000);
};

// Category Button Interaction
const setupCategoryButtons = () => {
  const scrollBar = document.getElementById('category-scroll-bar');
  if (!scrollBar) return;

  const buttons = scrollBar.querySelectorAll('button');

  // Highlight active initially
  if (!currentCategory) {
    currentCategory = 'Todos';
  }

  buttons.forEach(b => {
    b.classList.remove('bg-zinc-900', 'text-white');
    b.classList.add('bg-zinc-200', 'text-zinc-900');
    if (b.textContent === currentCategory) {
      b.classList.remove('bg-zinc-200', 'text-zinc-900');
      b.classList.add('bg-zinc-900', 'text-white');
    }
  });

  buttons.forEach(btn => {
    btn.onclick = () => {
      buttons.forEach(b => {
        b.classList.remove('bg-zinc-900', 'text-white');
        b.classList.add('bg-zinc-200', 'text-zinc-900');
      });
      btn.classList.remove('bg-zinc-200', 'text-zinc-900');
      btn.classList.add('bg-zinc-900', 'text-white');

      currentCategory = btn.textContent;
      currentBrand = null;
      renderProducts();

      const grid = document.getElementById('products-grid');
      if (grid) {
        const y = grid.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    };
  });
};

// Search Logic
const setupSearch = () => {
  searchBtn?.addEventListener('click', () => {
    searchOverlay?.classList.remove('hidden');
    searchInput?.focus();
  });

  closeSearch?.addEventListener('click', () => {
    searchOverlay?.classList.add('hidden');
  });

  searchOverlay?.addEventListener('click', (e) => {
    if (e.target === searchOverlay) searchOverlay.classList.add('hidden');
  });

  const popularContainer = document.getElementById('popular-searches-container');
  const suggestionsContainer = document.getElementById('search-suggestions-container');

  searchInput?.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    if (!val) {
      popularContainer?.classList.remove('hidden');
      suggestionsContainer?.classList.add('hidden');
      return;
    }

    popularContainer?.classList.add('hidden');
    if (suggestionsContainer && allProducts) {
      suggestionsContainer.classList.remove('hidden');

      const suggestions = allProducts.filter(p =>
        (p.name || '').toLowerCase().includes(val) ||
        (p.category || '').toLowerCase().includes(val) ||
        (p.brand || '').toLowerCase().includes(val)
      ).slice(0, 10);

      if (suggestions.length === 0) {
        suggestionsContainer.innerHTML = `<p class="p-6 text-center text-zinc-500 font-serif italic text-lg">No encontramos "${val}"</p>`;
      } else {
        suggestionsContainer.innerHTML = suggestions.map(s => `
                  <div class="suggestion-item flex items-center gap-4 p-3 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer w-full border-b border-zinc-50 last:border-0" data-product-id="${s.id}">
                      <img src="${s.image}" class="w-14 h-16 object-cover rounded-md flex-shrink-0 shadow-sm" alt="${s.name}">
                      <div class="flex-1 text-left flex flex-col justify-center min-w-0">
                          <h4 class="font-serif italic text-base leading-tight truncate w-full text-zinc-900">${s.name}</h4>
                          <span class="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">${s.category || 'Categoría'}</span>
                      </div>
                      <span class="font-bold text-sm bg-zinc-100 text-zinc-900 px-3 py-1 rounded-full whitespace-nowrap">$${(s.price || 0).toFixed(2)}</span>
                  </div>
              `).join('');
      }
    }
  });

  suggestionsContainer?.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (item) {
      const productId = item.dataset.productId;
      document.getElementById('search-overlay').classList.add('hidden');
      openProductDetails(productId);
    }
  });

  searchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value;
      currentSearchQuery = query.trim();
      searchOverlay?.classList.add('hidden');
      renderProducts();
      const grid = document.getElementById('products-grid');
      if (grid) {
        const y = grid.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
  });

  document.querySelectorAll('#search-overlay button:not(#close-search)').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSearchQuery = btn.textContent;
      searchInput.value = currentSearchQuery;
      searchOverlay?.classList.add('hidden');
      renderProducts();
      const grid = document.getElementById('products-grid');
      if (grid) {
        const y = grid.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  });
};

// Checkout Math
const updateCheckoutMath = () => {
  const subtotal = cartItems.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
  const coSubtotalEl = document.getElementById('co-subtotal');
  const coShippingCostEl = document.getElementById('co-shipping-cost');
  const coFinalTotalEl = document.getElementById('co-final-total');
  const coShippingRow = document.getElementById('co-shipping-row');
  const coDiscountRow = document.getElementById('co-discount-row');
  const coDiscountAmountEl = document.getElementById('co-discount-amount');
  const coDiscountNameEl = document.getElementById('co-discount-name');

  if (coSubtotalEl) coSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;

  let discountAmount = 0;
  if (appliedCoupon && appliedCoupon.active) {
    if (appliedCoupon.type === 'percentage') {
      discountAmount = subtotal * (appliedCoupon.discount / 100);
    } else {
      discountAmount = appliedCoupon.discount;
    }
    if (discountAmount > subtotal) discountAmount = subtotal;

    if (coDiscountRow) coDiscountRow.classList.remove('hidden');
    if (coDiscountAmountEl) coDiscountAmountEl.textContent = `-$${discountAmount.toFixed(2)}`;
    if (coDiscountNameEl) coDiscountNameEl.textContent = appliedCoupon.id;
  } else {
    if (coDiscountRow) coDiscountRow.classList.add('hidden');
  }

  let finalSubtotal = subtotal - discountAmount;
  let shipping = 0;
  const deliveryType = coDeliveryType?.value;

  if (deliveryType === 'Envio') {
    if (globalShippingThreshold > 0 && finalSubtotal >= globalShippingThreshold) {
      shipping = 0; // Free shipping
      if (coShippingCostEl) coShippingCostEl.textContent = '¡Gratis!';
    } else {
      shipping = globalShippingCost;
      if (coShippingCostEl) coShippingCostEl.textContent = `$${shipping.toFixed(2)}`;
    }
    if (coShippingRow) coShippingRow.classList.remove('hidden', 'flex');
    if (coShippingRow) coShippingRow.classList.add('flex');
  } else {
    shipping = 0; // Pick-up
    if (coShippingRow) coShippingRow.classList.remove('flex');
    if (coShippingRow) coShippingRow.classList.add('hidden');
  }

  const finalTotal = finalSubtotal + shipping;
  if (coFinalTotalEl) coFinalTotalEl.textContent = `$${finalTotal.toFixed(2)}`;
};

// Open Product Details Modal
const openProductDetails = (id) => {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;

  currentViewedProduct = product;
  selectedSize = null; // reset

  const mainImg = document.getElementById('pd-image');
  const gallery = document.getElementById('pd-gallery');

  // Helper to check if URL is a video
  const isVideo = (url) => {
    if (!url) return false;
    return url.includes('/video/upload/') || url.match(/\.(mp4|webm|ogg|mov)$/i);
  };

  const setMainMedia = (url) => {
    if (isVideo(url)) {
      mainImg.outerHTML = `<video id="pd-image" class="w-full h-full object-cover" src="${url}" controls autoplay muted loop></video>`;
    } else {
      const currentMedia = document.getElementById('pd-image');
      if (currentMedia.tagName === 'VIDEO') {
        currentMedia.outerHTML = `<img id="pd-image" class="w-full h-full object-cover" src="${url}" alt="Product Image">`;
      } else {
        currentMedia.src = url;
      }
    }
  };

  setMainMedia(product.image);

  // Gallery Logic
  if (gallery) {
    gallery.innerHTML = '';
    const allImages = [product.image, ...(product.extraImages || [])].filter(Boolean);

    if (allImages.length > 1) {
      gallery.classList.remove('hidden');
      allImages.forEach(url => {
        const thumb = document.createElement('div');
        thumb.className = 'w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent cursor-pointer hover:border-[#ba0036] transition-all flex-shrink-0 bg-zinc-100';

        if (isVideo(url)) {
          thumb.innerHTML = `<video class="w-full h-full object-cover opacity-50" src="${url}"></video>`;
        } else {
          thumb.innerHTML = `<img class="w-full h-full object-cover" src="${url}">`;
        }

        thumb.onclick = () => {
          setMainMedia(url);
          gallery.querySelectorAll('div').forEach(d => d.classList.remove('border-[#ba0036]'));
          thumb.classList.add('border-[#ba0036]');
        };
        gallery.appendChild(thumb);
      });
      // Highlight first
      gallery.querySelector('div')?.classList.add('border-[#ba0036]');
    } else {
      gallery.classList.add('hidden');
    }
  }

  document.getElementById('pd-category').textContent = product.category || 'Categoría';
  document.getElementById('pd-name').textContent = product.name;
  document.getElementById('pd-price').textContent = `$${(product.price || 0).toFixed(2)}`;
  const descEl = document.getElementById('pd-desc');
  if (product.stock > 0 && product.stock < 5) {
    descEl.innerHTML = `<span class="flex text-orange-600 bg-orange-50 px-3 py-2 rounded-lg text-xs font-bold w-fit mb-4 border border-orange-100 uppercase tracking-widest items-center gap-1"><i data-lucide="alert-triangle" class="w-4 h-4"></i> ¡Pocas unidades: Solo quedan ${product.stock}!</span><span class="block">${product.description || 'Sin descripción adicional.'}</span>`;
  } else {
    descEl.innerHTML = `<span class="block">${product.description || 'Sin descripción adicional.'}</span>`;
  }

  const pSubmitBtn = document.getElementById('pd-submit-cart');
  if (product.stock !== undefined && product.stock <= 0) {
    pSubmitBtn.innerHTML = '<i data-lucide="ban" class="w-5 h-5"></i> Agotado';
    pSubmitBtn.disabled = true;
    pSubmitBtn.classList.remove('active:scale-95', 'primary-gradient');
    pSubmitBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-zinc-400', 'text-white');
  } else {
    pSubmitBtn.innerHTML = '<i data-lucide="shopping-bag" class="w-5 h-5"></i> Añadir al Carrito';
    pSubmitBtn.disabled = false;
    pSubmitBtn.classList.add('active:scale-95', 'primary-gradient');
    pSubmitBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-zinc-400');
  }

  const sizesContainer = document.getElementById('pd-sizes-container');
  const sizesDiv = document.getElementById('pd-sizes');
  const errorEl = document.getElementById('pd-size-error');

  errorEl.classList.add('hidden');
  sizesDiv.innerHTML = '';

  if (product.sizes && product.sizes.length > 0) {
    sizesContainer.classList.remove('hidden');
    sizesDiv.innerHTML = product.sizes.map(size => `
            <button class="size-btn px-4 py-2 border border-zinc-200 rounded-lg text-sm font-bold font-mono hover:border-black transition-colors" data-size="${size}">${size}</button>
        `).join('');

    // Add listeners to sizes
    document.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.size-btn').forEach(b => {
          b.classList.remove('bg-zinc-900', 'text-white', 'border-zinc-900');
          b.classList.add('border-zinc-200');
        });
        btn.classList.add('bg-zinc-900', 'text-white', 'border-zinc-900');
        btn.classList.remove('border-zinc-200');
        selectedSize = btn.dataset.size;
        errorEl.classList.add('hidden');
      });
    });
  } else {
    sizesContainer.classList.add('hidden');
  }

  // Related Products
  const relatedContainer = document.getElementById('pd-related-container');
  const relatedDiv = document.getElementById('pd-related');
  if (relatedContainer && relatedDiv) {
    const related = allProducts.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
    if (related.length > 0) {
      relatedContainer.classList.remove('hidden');
      relatedDiv.innerHTML = related.map(rp => `
              <div class="w-32 flex-shrink-0 cursor-pointer group snap-center" onclick="window.openProductDetails('${rp.id}')">
                  <div class="aspect-[3/4] bg-zinc-100 rounded-lg mb-2 overflow-hidden relative">
                      <img src="${rp.image}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                  </div>
                  <p class="text-xs font-serif leading-tight line-clamp-2">${rp.name}</p>
                  <p class="text-xs font-bold text-[#ba0036]">$${(rp.price || 0).toFixed(2)}</p>
              </div>
          `).join('');
    } else {
      relatedContainer.classList.add('hidden');
    }
  }

  const modal = document.getElementById('product-details-modal');
  modal.classList.remove('hidden');
  // small delay for transition
  setTimeout(() => {
    modal.querySelector('#product-details-content')?.classList.remove('translate-y-full');
  }, 10);
  initIcons();
};

const closeProductDetails = () => {
  const modal = document.getElementById('product-details-modal');
  modal.querySelector('#product-details-content')?.classList.add('translate-y-full');
  setTimeout(() => {
    modal.classList.add('hidden');
    currentViewedProduct = null;
  }, 300);
};

// Global Button Listeners
const setupGlobalButtons = () => {

  document.getElementById('close-product-details')?.addEventListener('click', closeProductDetails);
  document.getElementById('product-details-overlay')?.addEventListener('click', closeProductDetails);

  document.getElementById('pd-submit-cart')?.addEventListener('click', async () => {
    if (!currentViewedProduct) return;
    if (!currentUser) {
      showToast('Debes iniciar sesión para comprar');
      loginWithGoogle();
      return;
    }

    if (currentViewedProduct.sizes && currentViewedProduct.sizes.length > 0 && !selectedSize) {
      document.getElementById('pd-size-error').classList.remove('hidden');
      return; // need to select size
    }

    const p = currentViewedProduct;

    const currentlyInCart = cartItems.filter(i => i.productId === p.id).reduce((acc, i) => acc + (i.quantity || 1), 0);
    if (currentlyInCart >= (p.stock || 0)) {
      showToast(`¡Límite alcanzado! Solo hay ${p.stock || 0} unidad(es) de este producto.`);
      return;
    }

    const cartId = selectedSize ? `${p.id}_${selectedSize}` : p.id;

    try {
      const btn = document.getElementById('pd-submit-cart');
      const ogText = btn.innerHTML;
      btn.innerHTML = '<div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>';
      btn.disabled = true;

      const cartRef = doc(db, `users/${currentUser.uid}/cart`, cartId);
      await setDoc(cartRef, {
        productId: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
        size: selectedSize,
        quantity: increment(1),
        updatedAt: serverTimestamp()
      }, { merge: true });

      showToast(`¡${p.name} añadido al carrito!`);
      btn.innerHTML = ogText;
      btn.disabled = false;
      closeProductDetails();
      toggleSidebar(cartSidebar, true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/cart/${cartId}`);
    }
  });


  // Add to cart buttons
  setupProductListeners();

  // Nav links to subpages
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const text = link.textContent.trim().toLowerCase();
      if (text === 'mujer') { e.preventDefault(); window.location.href = 'mujer.html'; }
      else if (text === 'hombre') { e.preventDefault(); window.location.href = 'hombre.html'; }
      else if (text === 'niños') { e.preventDefault(); window.location.href = 'ninos.html'; }
      else {
        // Just filter for the others like Accesorios, Ofertas
        e.preventDefault();
        currentCategory = text.charAt(0).toUpperCase() + text.slice(1);
        currentBrand = null;
        renderProducts();

        // ensure we highlight the correct category pill
        document.querySelectorAll('section.hide-scrollbar button').forEach(b => {
          if (b.textContent === currentCategory) {
            b.classList.remove('bg-zinc-200', 'text-zinc-900');
            b.classList.add('bg-zinc-900', 'text-white');
          } else {
            b.classList.remove('bg-zinc-900', 'text-white');
            b.classList.add('bg-zinc-200', 'text-zinc-900');
          }
        });

        const grid = document.getElementById('products-grid');
        if (grid) {
          const y = grid.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }
    });
  });

  // Hero button link
  document.querySelector('section.mb-12 button')?.addEventListener('click', () => {
    const grid = document.getElementById('products-grid');
    if (grid) {
      const y = grid.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  });

  // Ver todo
  document.querySelector('section.mb-16 button.text-\\[\\#ba0036\\]')?.addEventListener('click', () => {
    currentCategory = 'Todos';
    currentBrand = null;
    renderProducts();
    document.querySelectorAll('section.hide-scrollbar button').forEach(b => {
      if (b.textContent === 'Todos') {
        b.classList.remove('bg-zinc-200', 'text-zinc-900');
        b.classList.add('bg-zinc-900', 'text-white');
      } else {
        b.classList.remove('bg-zinc-900', 'text-white');
        b.classList.add('bg-zinc-200', 'text-zinc-900');
      }
    });
    const grid = document.getElementById('products-grid');
    if (grid) {
      const y = grid.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  });

  // Categorias Grid in index.html linking to pages
  document.querySelectorAll('section.mb-16 div.group').forEach(gridCard => {
    const title = gridCard.querySelector('h4')?.textContent?.trim().toLowerCase();
    if (!title || (!['mujer', 'hombre', 'niños'].includes(title))) return;

    gridCard.addEventListener('click', () => {
      if (title === 'mujer') window.location.href = 'mujer.html';
      if (title === 'hombre') window.location.href = 'hombre.html';
      if (title === 'niños') window.location.href = 'ninos.html';
    });
  });

  // Connect Trending & Offers cards to open a modal if title matches product name
  document.querySelectorAll('.group:has(.absolute.inset-0.bg-gradient-to-t)').forEach(card => {
    card.addEventListener('click', () => {
      const title = card.querySelector('h5')?.textContent?.trim();
      if (title) {
        // Find matching product
        const p = allProducts.find(prod => prod.name.toLowerCase().includes(title.toLowerCase()));
        if (p) {
          openProductDetails(p.id);
        } else {
          // fallback to search
          currentSearchQuery = title;
          renderProducts();
          const grid = document.getElementById('products-grid');
          if (grid) {
            const y = grid.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }
      }
    });
  });

  // Cart/Wishlist main buttons
  document.getElementById('cart-btn')?.addEventListener('click', () => toggleSidebar(cartSidebar, true));
  document.getElementById('mobile-cart-btn')?.addEventListener('click', () => toggleSidebar(cartSidebar, true));
  document.getElementById('floating-cart-btn')?.addEventListener('click', () => toggleSidebar(cartSidebar, true));
  document.getElementById('wishlist-btn')?.addEventListener('click', () => toggleSidebar(wishlistSidebar, true));
  document.getElementById('mobile-wishlist-btn')?.addEventListener('click', () => toggleSidebar(wishlistSidebar, true));

  // Trigger Checkout
  triggerCheckoutBtn?.addEventListener('click', () => {
    if (!currentUser) {
      showToast('Debes iniciar sesión para comprar');
      loginWithGoogle();
      return;
    }
    if (cartItems.length === 0) return;

    updateCheckoutMath(); // Calculate with shipping

    toggleSidebar(cartSidebar, false);
    toggleSidebar(checkoutSidebar, true);
  });

  // Coupons
  document.getElementById('co-apply-coupon')?.addEventListener('click', async () => {
    const codeEl = document.getElementById('co-coupon-code');
    const msgEl = document.getElementById('co-coupon-msg');
    const code = codeEl?.value.trim().toUpperCase();

    if (!code) return;

    msgEl.classList.remove('hidden', 'text-emerald-600', 'text-rose-600');
    msgEl.textContent = 'Verificando...';
    msgEl.classList.add('text-zinc-500');

    try {
      const snap = await getDoc(doc(db, 'coupons', code));
      if (snap.exists() && snap.data().active) {
        appliedCoupon = { id: snap.id, ...snap.data() };
        msgEl.textContent = '¡Cupón aplicado correctamente!';
        msgEl.classList.replace('text-zinc-500', 'text-emerald-600');
        updateCheckoutMath();
      } else {
        msgEl.textContent = 'El cupón no es válido o ha expirado.';
        msgEl.classList.replace('text-zinc-500', 'text-rose-600');
        appliedCoupon = null;
        updateCheckoutMath();
      }
    } catch (err) {
      msgEl.textContent = 'Error al validar cupón';
      msgEl.classList.replace('text-zinc-500', 'text-rose-600');
    }
  });

  document.getElementById('co-remove-coupon')?.addEventListener('click', () => {
    appliedCoupon = null;
    const msgEl = document.getElementById('co-coupon-msg');
    const codeEl = document.getElementById('co-coupon-code');
    if (msgEl) msgEl.classList.add('hidden');
    if (codeEl) codeEl.value = '';
    updateCheckoutMath();
  });

  coDeliveryType?.addEventListener('change', (e) => {
    if (e.target.value === 'Recoger') {
      coShippingFields?.classList.add('hidden');
      document.getElementById('co-address')?.removeAttribute('required');
    } else {
      coShippingFields?.classList.remove('hidden');
      document.getElementById('co-address')?.setAttribute('required', 'true');
    }
    updateCheckoutMath();
  });

  // Checkout Button
  checkoutForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser || cartItems.length === 0) return;

    const submitBtn = document.getElementById('co-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';

    // Validate Stock First
    for (const item of cartItems) {
      const p = allProducts.find(prod => prod.id === item.productId);
      const required = cartItems.filter(i => i.productId === item.productId).reduce((acc, i) => acc + (i.quantity || 1), 0);
      const available = p ? (p.stock || 0) : 0;

      if (!p || available < required) {
        showToast(`Error: ${item.name} se ha agotado o no tiene stock suficiente.`);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Orden';
        return;
      }
    }

    try {
      const orderRef = doc(collection(db, 'orders'));

      // Calculate subtotal
      const subtotal = cartItems.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
      const deliveryType = coDeliveryType.value;
      const paymentMethod = document.getElementById('co-payment').value;

      // Calculate Discount
      let discountAmountVal = 0;
      if (appliedCoupon && appliedCoupon.active) {
        if (appliedCoupon.type === 'percentage') {
          discountAmountVal = subtotal * (appliedCoupon.discount / 100);
        } else {
          discountAmountVal = appliedCoupon.discount;
        }
        if (discountAmountVal > subtotal) discountAmountVal = subtotal;
      }

      const finalSubtotal = subtotal - discountAmountVal;
      let logistics = null;
      let address = null;
      let shippingCostVal = 0;

      if (deliveryType === 'Envio') {
        logistics = document.getElementById('co-logistics').value;
        address = document.getElementById('co-address').value;
        if (globalShippingThreshold === 0 || finalSubtotal < globalShippingThreshold) {
          shippingCostVal = globalShippingCost;
        }
      }

      const finalTotal = finalSubtotal + shippingCostVal;

      // Deduct stock in DB immediately
      for (const item of cartItems) {
        await updateDoc(doc(db, 'products', item.productId), {
          stock: increment(-(item.quantity || 1))
        });
      }

      await setDoc(orderRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.displayName || 'Usuario',
        items: cartItems,
        subtotal,
        shippingCost: shippingCostVal,
        discountAmount: discountAmountVal,
        couponCode: appliedCoupon ? appliedCoupon.id : null,
        total: finalTotal,
        status: 'Pendiente',
        paymentMethod,
        deliveryType,
        logistics,
        address,
        stockDeducted: true,
        createdAt: serverTimestamp()
      });

      // Clear cart
      for (const item of cartItems) {
        await deleteDoc(doc(db, `users/${currentUser.uid}/cart`, item.id));
      }

      toggleSidebar(checkoutSidebar, false);
      checkoutForm.reset();

      // Show Success Modal
      const successOverlay = document.getElementById('order-success-overlay');
      const whatsappBtn = document.getElementById('success-whatsapp-btn');

      if (successOverlay) {
        successOverlay.classList.remove('hidden');
        successOverlay.classList.add('flex');

        // Show WhatsApp button only if number is configured
        if (whatsappBtn) {
          const configStr = localStorage.getItem('stylehn_settings');
          const config = configStr ? JSON.parse(configStr) : {};

          if (config.whatsapp) {
            whatsappBtn.classList.remove('hidden');
            whatsappBtn.onclick = () => {
              window.open(`https://wa.me/${config.whatsapp}`, '_blank');
            };
          } else {
            whatsappBtn.classList.add('hidden');
          }
        }

        // Handle Continue Shopping
        const continueBtn = document.getElementById('success-continue-btn');
        if (continueBtn) {
          continueBtn.onclick = () => {
            successOverlay.classList.add('hidden');
            successOverlay.classList.remove('flex');
          };
        }
      } else {
        showToast('¡Pedido realizado con éxito!'); // Fallback
      }

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'orders');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar Orden';
    }
  });

  // Search mobile
  document.getElementById('mobile-search-btn')?.addEventListener('click', () => {
    searchOverlay?.classList.remove('hidden');
    searchInput?.focus();
  });

  // Mobile home
  document.querySelector('nav i[data-lucide="home"]')?.parentElement?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Close sidebars
  closeCart?.addEventListener('click', () => toggleSidebar(cartSidebar, false));
  cartOverlay?.addEventListener('click', () => toggleSidebar(cartSidebar, false));
  closeWishlist?.addEventListener('click', () => toggleSidebar(wishlistSidebar, false));
  wishlistOverlay?.addEventListener('click', () => toggleSidebar(wishlistSidebar, false));
  closeCheckout?.addEventListener('click', () => toggleSidebar(checkoutSidebar, false));
  checkoutOverlay?.addEventListener('click', () => toggleSidebar(checkoutSidebar, false));
  closeOrders?.addEventListener('click', () => toggleSidebar(ordersSidebar, false));
  ordersOverlay?.addEventListener('click', () => toggleSidebar(ordersSidebar, false));
  logoutBtn?.addEventListener('click', () => {
    logout();
    showToast('Sesión cerrada');
    toggleSidebar(ordersSidebar, false);
  });

  // Auth buttons
  const handleAuth = () => {
    if (currentUser) {
      toggleSidebar(ordersSidebar, true);
    } else {
      loginWithGoogle();
    }
  };
  document.getElementById('auth-btn')?.addEventListener('click', handleAuth);
  document.getElementById('mobile-auth-btn')?.addEventListener('click', handleAuth);
};

// Product Listeners
const setupProductListeners = () => {
  document.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentUser) {
        showToast('Inicia sesión para añadir al carrito');
        loginWithGoogle();
        return;
      }

      const id = btn.dataset.id;
      openProductDetails(id);
    });
  });

  document.querySelectorAll('.wishlist-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentUser) {
        showToast('Inicia sesión para guardar favoritos');
        loginWithGoogle();
        return;
      }

      const id = btn.dataset.id;
      const product = allProducts.find(p => p.id === id);
      if (!product) return;

      const isWishlisted = wishlistItems.some(item => item.id === product.id);

      try {
        const wishlistRef = doc(db, `users/${currentUser.uid}/wishlist`, product.id);
        if (isWishlisted) {
          await deleteDoc(wishlistRef);
          showToast('Eliminado de favoritos');
        } else {
          await setDoc(wishlistRef, {
            productId: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            createdAt: serverTimestamp()
          });
          showToast('Añadido a favoritos');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/wishlist/${product.id}`);
      }
    });
  });
};

const renderDeals = () => {
  const container = document.getElementById('ofertas-container');
  if (!container) return;

  const deals = allProducts.filter(p => p.isOffer);

  if (deals.length === 0) {
    container.innerHTML = `
      <div class="w-full py-8 text-center text-zinc-400">
        <p class="font-serif italic text-sm">No hay ofertas publicadas por hoy.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = deals.map(p => {
    let priceLine = `<span class="font-bold text-[#ba0036]">$${(p.price || 0).toFixed(2)}</span>`;
    let discountHTML = '';

    if (p.oldPrice && p.oldPrice > p.price) {
      const pct = Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100);
      discountHTML = `<span class="absolute top-2 left-2 bg-[#ba0036] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">-${pct}%</span>`;
      priceLine = `
          <span class="font-bold text-[#ba0036]">$${p.price.toFixed(2)}</span>
          <span class="text-[10px] line-through text-zinc-400">$${p.oldPrice.toFixed(2)}</span>
        `;
    }

    return `
      <div class="min-w-[220px] bg-white rounded-lg p-3 shadow-sm border border-transparent hover:border-zinc-200 transition-all cursor-pointer group deal-card" data-id="${p.id}">
        <div class="relative aspect-square rounded-lg overflow-hidden bg-zinc-50 mb-3">
          <img class="w-full h-full object-cover transition-transform group-hover:scale-105" src="${p.image}" alt="${p.name}" referrerpolicy="no-referrer" />
          ${discountHTML}
        </div>
        <h6 class="font-medium text-sm mb-1 truncate">${p.name}</h6>
        <div class="flex items-center gap-2">
          ${priceLine}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.deal-card').forEach(card => {
    card.addEventListener('click', () => {
      openProductDetails(card.dataset.id);
    });
  });
};

// Initialize everything
setupCategoryButtons();
setupSearch();
setupGlobalButtons();

// Listen to Global Products
productsUnsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
  allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  updateUI();
  renderDeals();
}, (e) => handleFirestoreError(e, OperationType.LIST, 'products'));

// Listen to Site Settings
onSnapshot(doc(db, 'settings', 'site_config'), (snapshot) => {
  if (snapshot.exists()) {
    const config = snapshot.data();
    localStorage.setItem('stylehn_settings', JSON.stringify(config));

    // Update Dynamic CSS Variables (Primary Color)
    if (config.primaryColor) {
      document.documentElement.style.setProperty('--primary-color', config.primaryColor);
      let styleTag = document.getElementById('dynamic-site-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-site-style';
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = `
        :root { --primary-color: ${config.primaryColor} !important; }
        .bg-\\[\\#ba0036\\] { background-color: ${config.primaryColor} !important; }
        .text-\\[\\#ba0036\\] { color: ${config.primaryColor} !important; }
        .border-\\[\\#ba0036\\] { border-color: ${config.primaryColor} !important; }
        .primary-gradient { background: ${config.primaryColor} !important; }
      `;
    }

    if (config.shippingCost !== undefined) globalShippingCost = Number(config.shippingCost) || 0;
    if (config.shippingFreeThreshold !== undefined) globalShippingThreshold = Number(config.shippingFreeThreshold) || 0;
    updateCheckoutMath();

    // Update Hero Banner
    const heroImageEl = document.getElementById('main-hero-img');
    const heroSubtitleEl = document.getElementById('main-hero-subtitle');
    const heroTitleEl = document.getElementById('main-hero-title');

    if (config.hero) {
      const removeTextSkeleton = (el) => {
        if (!el) return;
        el.classList.remove('skeleton', 'w-32', 'h-4', 'w-3/4', 'h-16', 'rounded');
      };

      if (heroImageEl && config.hero.image) {
        const isVideo = (url) => url && (url.includes('/video/upload/') || url.match(/\.(mp4|webm|ogg|mov)$/i));

        if (isVideo(config.hero.image)) {
          heroImageEl.outerHTML = `<video id="main-hero-img" class="w-full h-full object-cover opacity-90 transition-opacity duration-500 delay-100" src="${config.hero.image}" autoplay muted loop playsinline></video>`;
        } else {
          heroImageEl.src = config.hero.image;
          heroImageEl.classList.remove('skeleton');
        }
      }
      if (heroSubtitleEl && config.hero.subtitle) {
        heroSubtitleEl.textContent = config.hero.subtitle;
        removeTextSkeleton(heroSubtitleEl);
      }
      if (heroTitleEl && config.hero.title) {
        heroTitleEl.innerHTML = config.hero.title.replace(/\\n/g, '<br />');
        removeTextSkeleton(heroTitleEl);
      }
    }

    // Start Countdown
    if (config.offerEndTime) {
      startCountdown(config.offerEndTime);
    }

    // Update Covers
    if (config.covers) {
      const mappings = {
        'cover-mujer-img': config.covers.mujer,
        'cover-hombre-img': config.covers.hombre,
        'cover-ninos-img': config.covers.ninos,
        'cover-accesorios-img': config.covers.accesorios
      };

      for (const [id, url] of Object.entries(mappings)) {
        const img = document.getElementById(id);
        if (img && url) {
          img.src = url;
          img.classList.remove('skeleton');
        }
      }

      // Fallback for html pages without matching IDs (if any left)
      document.querySelectorAll('img[alt="Mujer"]:not(#cover-mujer-img)').forEach(img => {
        if (config.covers.mujer) {
          img.src = config.covers.mujer;
          img.classList.remove('skeleton');
        }
      });
      document.querySelectorAll('img[alt="Hombre"]:not(#cover-hombre-img)').forEach(img => {
        if (config.covers.hombre) {
          img.src = config.covers.hombre;
          img.classList.remove('skeleton');
        }
      });
      document.querySelectorAll('img[alt="Niños"]:not(#cover-ninos-img)').forEach(img => {
        if (config.covers.ninos) {
          img.src = config.covers.ninos;
          img.classList.remove('skeleton');
        }
      });
      document.querySelectorAll('img[alt="Accesorios"]:not(#cover-accesorios-img)').forEach(img => {
        if (config.covers.accesorios) {
          img.src = config.covers.accesorios;
          img.classList.remove('skeleton');
        }
      });
    }

    // Update Store Identity
    if (config.storeName) {
      document.title = `${config.storeName} | Boutique Digital`;
      const logoEls = document.querySelectorAll('#navbar-logo, #footer-logo');
      logoEls.forEach(el => el.textContent = config.storeName);
    }
    if (config.storeDescription) {
      const descEl = document.getElementById('footer-description');
      if (descEl) descEl.textContent = config.storeDescription;
    }
    const copyrightEl = document.getElementById('footer-copyright');
    if (copyrightEl) {
      const year = new Date().getFullYear();
      copyrightEl.textContent = `© ${year} ${config.storeName || 'StyleHN'} Editorial. All rights reserved.`;
    }

    // Update Categories (Navbar & Filters)
    if (config.categories && Array.isArray(config.categories)) {
      const leftNav = document.getElementById('navbar-categories-left');
      const rightNav = document.getElementById('navbar-categories-right');
      const scrollBar = document.getElementById('category-scroll-bar');

      if (leftNav && rightNav) {
        const mid = Math.ceil(config.categories.length / 2);
        const leftCats = config.categories.slice(0, mid);
        const rightCats = config.categories.slice(mid);

        leftNav.innerHTML = leftCats.map(cat => `<a class="nav-link text-zinc-500 hover:text-zinc-800 font-serif tracking-tight text-lg" href="#">${cat}</a>`).join('');
        rightNav.innerHTML = rightCats.map(cat => `<a class="nav-link text-zinc-500 hover:text-zinc-800 font-serif tracking-tight text-lg" href="#">${cat}</a>`).join('');

        // Add click listeners to nav links for filtering
        [...leftNav.children, ...rightNav.children].forEach(link => {
          link.onclick = (e) => {
            e.preventDefault();
            currentCategory = link.textContent;
            currentBrand = null;
            setupCategoryButtons(); // Refresh scroll bar highlight
            renderProducts();
            document.getElementById('products-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };
        });
      }

      if (scrollBar) {
        const currentSelected = currentCategory || 'Todos';
        scrollBar.innerHTML = `
          <button class="px-6 py-2 ${currentSelected === 'Todos' ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-900'} text-sm font-medium rounded-full whitespace-nowrap cursor-pointer transition-colors">Todos</button>
          ${config.categories.map(cat => `
            <button class="px-6 py-2 ${currentSelected === cat ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-900'} text-sm font-medium rounded-full whitespace-nowrap hover:bg-zinc-300 transition-colors cursor-pointer">${cat}</button>
          `).join('')}
        `;
        setupCategoryButtons();
      }
    }

    // Update Footer Sections
    const footerContainer = document.getElementById('footer-sections-container');
    if (footerContainer && config.footer && Array.isArray(config.footer)) {
      footerContainer.innerHTML = config.footer.map(section => `
        <div>
          <h5 class="font-bold text-sm uppercase tracking-widest mb-6">${section.title}</h5>
          <ul class="flex flex-col gap-4 text-zinc-400 text-sm">
            ${(section.links || []).map(link => `<li><a class="hover:text-white transition-colors" href="${link.url || '#'}">${link.text}</a></li>`).join('')}
          </ul>
        </div>
      `).join('');
    }

    // Update Brands Ticker
    const brandsContainer = document.querySelector('section.mb-24 .flex.gap-12');
    if (brandsContainer && config.brands && Array.isArray(config.brands)) {
      const classes = [
        "text-3xl font-serif grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer",
        "text-3xl font-serif italic grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer tracking-tighter",
        "text-3xl font-sans font-black grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer tracking-widest",
        "text-3xl font-sans font-light grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer tracking-widest"
      ];
      brandsContainer.innerHTML = config.brands.map((brand, i) => {
        if (brand.startsWith('http')) {
          return `<img src="${brand}" data-brand="${brand}" class="brand-item h-10 grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all object-contain cursor-pointer">`;
        }
        return `<span class="brand-item ${classes[i % classes.length]}" data-brand="${brand}">${brand}</span>`;
      }).join('');

      brandsContainer.querySelectorAll('.brand-item').forEach(el => {
        el.onclick = (e) => {
          currentBrand = e.currentTarget.dataset.brand;
          currentCategory = 'Todos';
          currentSearchQuery = '';

          setupCategoryButtons();

          const searchInput = document.getElementById('search-input');
          if (searchInput) searchInput.value = '';

          renderProducts();

          document.getElementById('products-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      });
    }
  }
});

window.openProductDetails = openProductDetails;
console.log('StyleHN production-ready JS initialized with Firebase');

