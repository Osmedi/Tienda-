import { createIcons, Search, Heart, ShoppingBag, ArrowRight, Plus, Globe, Share2, Mail, CreditCard, Wallet, Home, User, X, LogOut } from 'lucide';
import './index.css';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

// Icon definitions
const ICONS = {
  Search,
  Heart,
  ShoppingBag,
  ArrowRight,
  Plus,
  Globe,
  Share2,
  Mail,
  CreditCard,
  Wallet,
  Home,
  User,
  X,
  LogOut
};

// Initialize Lucide icons
const initIcons = () => createIcons({ icons: ICONS });
initIcons();

// State
let currentUser: FirebaseUser | null = null;
let cartItems: any[] = [];
let wishlistItems: any[] = [];
let allProducts: any[] = [];
let cartUnsubscribe: (() => void) | null = null;
let wishlistUnsubscribe: (() => void) | null = null;
let productsUnsubscribe: (() => void) | null = null;

// Elements
const productsGrid = document.getElementById('products-grid');
const adminBtn = document.getElementById('admin-btn');
const adminOverlay = document.getElementById('admin-overlay');
const closeAdmin = document.getElementById('close-admin');
const addProductForm = document.getElementById('add-product-form') as HTMLFormElement;
const adminProductsList = document.getElementById('admin-products-list');
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
const authBtn = document.getElementById('auth-btn');
const mobileAuthBtn = document.getElementById('mobile-auth-btn');

// Sidebar Logic
const toggleSidebar = (sidebar: HTMLElement | null, open: boolean) => {
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
const showToast = (message: string) => {
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
  renderProducts();
  renderAdminProducts();
};

const renderProducts = () => {
  if (!productsGrid) return;
  
  if (allProducts.length === 0) {
    productsGrid.innerHTML = `
      <div class="col-span-full py-20 text-center text-zinc-400">
        <p class="font-serif italic text-xl">No hay productos disponibles</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = allProducts.map(product => `
    <div class="flex flex-col gap-4 group">
      <div class="relative aspect-[3/4] rounded-lg overflow-hidden bg-zinc-100">
        <img class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src="${product.image}" alt="${product.name}" referrerpolicy="no-referrer" />
        ${product.isNew ? '<span class="absolute top-4 left-4 bg-white px-3 py-1 text-[10px] font-bold uppercase rounded-full tracking-tighter">Nuevo</span>' : ''}
        <button class="wishlist-toggle absolute top-4 right-4 bg-white/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-white hover:text-[#ba0036] transition-colors cursor-pointer" data-id="${product.id}">
          <i data-lucide="heart" class="w-4 h-4"></i>
        </button>
        <button class="add-to-cart absolute bottom-4 right-4 bg-zinc-900 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all cursor-pointer" data-id="${product.id}">
          <i data-lucide="plus" class="w-6 h-6"></i>
        </button>
      </div>
      <div class="px-1">
        <h4 class="font-serif text-lg leading-tight mb-2">${product.name}</h4>
        <p class="font-bold text-zinc-900">$${(product.price || 0).toFixed(2)}</p>
      </div>
    </div>
  `).join('');

  // Re-attach listeners for dynamic products
  setupProductListeners();
  updateHeartIcons();
  initIcons();
};

const renderAdminProducts = () => {
  if (!adminProductsList) return;
  
  adminProductsList.innerHTML = allProducts.map(product => `
    <div class="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
      <div class="flex items-center gap-4">
        <img src="${product.image}" class="w-12 h-12 object-cover rounded-lg" alt="">
        <div>
          <h5 class="font-bold text-sm">${product.name}</h5>
          <p class="text-zinc-500 text-xs">$${product.price.toFixed(2)}</p>
        </div>
      </div>
      <button class="delete-product p-2 text-zinc-400 hover:text-red-600 transition-colors" data-id="${product.id}">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    </div>
  `).join('');

  document.querySelectorAll('.delete-product').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id;
      if (id && confirm('¿Estás seguro de eliminar este producto?')) {
        try {
          await deleteDoc(doc(db, 'products', id));
          showToast('Producto eliminado');
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `products/${id}`);
        }
      }
    });
  });

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
    return `
      <div class="flex gap-4 items-center group">
        <div class="w-20 h-24 bg-zinc-100 rounded-lg overflow-hidden flex-shrink-0">
          <img src="${item.image}" class="w-full h-full object-cover" alt="${item.name}">
        </div>
        <div class="flex-1">
          <h4 class="font-serif italic text-lg leading-tight">${item.name}</h4>
          <p class="text-zinc-500 text-sm mb-2">${item.size ? `Talla: ${item.size}` : ''}</p>
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
      const id = (btn as HTMLElement).dataset.id;
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

  wishlistItemsContainer.innerHTML = wishlistItems.map(item => `
    <div class="flex gap-4 items-center group">
      <div class="w-20 h-24 bg-zinc-100 rounded-lg overflow-hidden flex-shrink-0">
        <img src="${item.image}" class="w-full h-full object-cover" alt="${item.name}">
      </div>
      <div class="flex-1">
        <h4 class="font-serif italic text-lg leading-tight">${item.name}</h4>
        <div class="flex justify-between items-center mt-2">
          <span class="font-bold">$${(item.price || 0).toFixed(2)}</span>
          <button class="remove-from-wishlist p-1 hover:text-[#ba0036] transition-colors cursor-pointer" data-id="${item.id}">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.remove-from-wishlist').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id;
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

// Auth Logic
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  
  // Unsubscribe from previous listeners
  if (cartUnsubscribe) cartUnsubscribe();
  if (wishlistUnsubscribe) wishlistUnsubscribe();

  if (user) {
    const isAdminUser = user.email === 'lopezosmedi456@gmail.com';
    if (isAdminUser) {
      adminBtn?.classList.remove('hidden');
    } else {
      adminBtn?.classList.add('hidden');
    }

    showToast(`Bienvenido, ${user.displayName || 'Usuario'}`);
    if (authBtn) authBtn.innerHTML = `<i data-lucide="log-out" class="w-5 h-5 text-[#ba0036]"></i>`;
    if (mobileAuthBtn) mobileAuthBtn.innerHTML = `<i data-lucide="log-out" class="w-5 h-5 text-[#ba0036]"></i><span class="text-[10px] font-bold uppercase tracking-tighter">Salir</span>`;
    
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
    updateUI();
  }
  initIcons();
});

// Countdown Timer Logic
const countdown = () => {
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');

  if (!hoursEl || !minutesEl || !secondsEl) return;

  let h = 12;
  let m = 45;
  let s = 8;

  setInterval(() => {
    s--;
    if (s < 0) {
      s = 59;
      m--;
      if (m < 0) {
        m = 59;
        h--;
        if (h < 0) {
          h = 23;
        }
      }
    }

    hoursEl.textContent = h.toString().padStart(2, '0');
    minutesEl.textContent = m.toString().padStart(2, '0');
    secondsEl.textContent = s.toString().padStart(2, '0');
  }, 1000);
};

// Category Button Interaction
const setupCategoryButtons = () => {
  const buttons = document.querySelectorAll('section.hide-scrollbar button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => {
        b.classList.remove('bg-zinc-900', 'text-white');
        b.classList.add('bg-zinc-200', 'text-zinc-900');
      });
      btn.classList.remove('bg-zinc-200', 'text-zinc-900');
      btn.classList.add('bg-zinc-900', 'text-white');
      showToast(`Filtrando por: ${btn.textContent}`);
    });
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

  searchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = (searchInput as HTMLInputElement).value;
      if (query.trim()) {
        showToast(`Buscando: "${query}"...`);
        searchOverlay?.classList.add('hidden');
        (searchInput as HTMLInputElement).value = '';
      }
    }
  });

  document.querySelectorAll('#search-overlay button:not(#close-search)').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast(`Buscando: "${btn.textContent}"...`);
      searchOverlay?.classList.add('hidden');
    });
  });
};

// Global Button Listeners
const setupGlobalButtons = () => {
  // Admin Panel
  adminBtn?.addEventListener('click', () => {
    adminOverlay?.classList.remove('hidden');
  });

  closeAdmin?.addEventListener('click', () => {
    adminOverlay?.classList.add('hidden');
  });

  adminOverlay?.addEventListener('click', (e) => {
    if (e.target === adminOverlay) adminOverlay.classList.add('hidden');
  });

  addProductForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('admin-p-name') as HTMLInputElement).value;
    const price = parseFloat((document.getElementById('admin-p-price') as HTMLInputElement).value);
    const category = (document.getElementById('admin-p-category') as HTMLSelectElement).value;
    const image = (document.getElementById('admin-p-image') as HTMLInputElement).value;
    const desc = (document.getElementById('admin-p-desc') as HTMLInputElement).value;

    try {
      const id = name.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'products', id), {
        id,
        name,
        price,
        category,
        image,
        description: desc,
        isNew: true,
        createdAt: serverTimestamp()
      });
      showToast('Producto añadido con éxito');
      addProductForm.reset();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products');
    }
  });

  // Add to cart buttons
  setupProductListeners();

  // Nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showToast(`Navegando a: ${link.textContent}`);
    });
  });

  // General buttons
  document.querySelectorAll('button:not(.add-to-cart):not(.wishlist-toggle):not(.nav-link)').forEach(btn => {
    if (['search-btn', 'close-search', 'cart-btn', 'wishlist-btn', 'floating-cart-btn', 'auth-btn', 'mobile-auth-btn', 'close-cart', 'close-wishlist'].includes(btn.id)) return;
    
    btn.addEventListener('click', () => {
      const text = btn.textContent?.trim();
      if (text) showToast(`Acción: ${text}`);
    });
  });

  // Cart/Wishlist main buttons
  document.getElementById('cart-btn')?.addEventListener('click', () => toggleSidebar(cartSidebar, true));
  document.getElementById('mobile-cart-btn')?.addEventListener('click', () => toggleSidebar(cartSidebar, true));
  document.getElementById('floating-cart-btn')?.addEventListener('click', () => toggleSidebar(cartSidebar, true));
  document.getElementById('wishlist-btn')?.addEventListener('click', () => toggleSidebar(wishlistSidebar, true));
  document.getElementById('mobile-wishlist-btn')?.addEventListener('click', () => toggleSidebar(wishlistSidebar, true));

  // Search mobile
  document.getElementById('mobile-search-btn')?.addEventListener('click', () => {
    searchOverlay?.classList.remove('hidden');
    searchInput?.focus();
  });

  // Close sidebars
  closeCart?.addEventListener('click', () => toggleSidebar(cartSidebar, false));
  cartOverlay?.addEventListener('click', () => toggleSidebar(cartSidebar, false));
  closeWishlist?.addEventListener('click', () => toggleSidebar(wishlistSidebar, false));
  wishlistOverlay?.addEventListener('click', () => toggleSidebar(wishlistSidebar, false));

  // Auth buttons
  const handleAuth = () => {
    if (currentUser) {
      logout();
      showToast('Sesión cerrada');
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
      
      const id = (btn as HTMLElement).dataset.id;
      const product = allProducts.find(p => p.id === id);
      if (!product) return;

      try {
        const cartRef = doc(db, `users/${currentUser.uid}/cart`, product.id);
        await setDoc(cartRef, {
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          quantity: 1,
          updatedAt: serverTimestamp()
        }, { merge: true });
        showToast(`¡${product.name} añadido al carrito!`);
        toggleSidebar(cartSidebar, true);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/cart/${product.id}`);
      }
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

      const id = (btn as HTMLElement).dataset.id;
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

// Initialize everything
countdown();
setupCategoryButtons();
setupSearch();
setupGlobalButtons();

// Listen to Global Products
productsUnsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
  allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  updateUI();
}, (e) => handleFirestoreError(e, OperationType.LIST, 'products'));

console.log('StyleHN production-ready JS initialized with Firebase');
