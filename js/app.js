import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

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
let cartUnsubscribe = null;
let wishlistUnsubscribe = null;
let productsUnsubscribe = null;

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
  renderProducts();
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
      // Update admin button href or behavior to redirect to admin panel
      adminBtn.onclick = () => window.location.href = 'admin.html';
    } else {
      adminBtn?.classList.add('hidden');
    }

    // Save user profile for admin panel
    setDoc(doc(db, 'user_profiles', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Usuario',
      photoURL: user.photoURL || null,
      lastLogin: serverTimestamp(),
      role: isAdminUser ? 'admin' : 'user'
    }, { merge: true }).catch(e => console.error("Error saving profile", e));

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
      const query = searchInput.value;
      if (query.trim()) {
        showToast(`Buscando: "${query}"...`);
        searchOverlay?.classList.add('hidden');
        searchInput.value = '';
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

// Checkout Math
const updateCheckoutMath = () => {
    const subtotal = cartItems.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
    const coSubtotalEl = document.getElementById('co-subtotal');
    const coShippingCostEl = document.getElementById('co-shipping-cost');
    const coFinalTotalEl = document.getElementById('co-final-total');
    const coShippingRow = document.getElementById('co-shipping-row');
    
    if (coSubtotalEl) coSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    
    let shipping = 0;
    const deliveryType = coDeliveryType?.value;
    
    if (deliveryType === 'Envio') {
        if (globalShippingThreshold > 0 && subtotal >= globalShippingThreshold) {
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
    
    const finalTotal = subtotal + shipping;
    if (coFinalTotalEl) coFinalTotalEl.textContent = `$${finalTotal.toFixed(2)}`;
};

// Open Product Details Modal
const openProductDetails = (id) => {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;
    
    currentViewedProduct = product;
    selectedSize = null; // reset
    
    document.getElementById('pd-image').src = product.image;
    document.getElementById('pd-category').textContent = product.category || 'Categoría';
    document.getElementById('pd-name').textContent = product.name;
    document.getElementById('pd-price').textContent = `$${(product.price || 0).toFixed(2)}`;
    document.getElementById('pd-desc').textContent = product.description || 'Sin descripción adicional.';
    
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
    
    const modal = document.getElementById('product-details-modal');
    modal.classList.remove('hidden');
    // small delay for transition
    setTimeout(() => {
        modal.querySelector('#product-details-content')?.classList.remove('translate-y-full');
    }, 10);
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
          quantity: 1,
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

  // Nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showToast(`Navegando a: ${link.textContent}`);
    });
  });

  // General buttons
  document.querySelectorAll('button:not(.add-to-cart):not(.wishlist-toggle):not(.nav-link):not(.size-btn)').forEach(btn => {
    if (['search-btn', 'close-search', 'cart-btn', 'wishlist-btn', 'floating-cart-btn', 'auth-btn', 'mobile-auth-btn', 'close-cart', 'close-wishlist', 'close-product-details', 'pd-submit-cart'].includes(btn.id)) return;
    
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

    try {
      const orderRef = doc(collection(db, 'orders'));
      
      // Calculate final shipping included total before saving to orders
      const subtotal = cartItems.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
      const deliveryType = coDeliveryType.value;
      const paymentMethod = document.getElementById('co-payment').value;
      
      let logistics = null;
      let address = null;
      let shippingCostVal = 0;

      if (deliveryType === 'Envio') {
          logistics = document.getElementById('co-logistics').value;
          address = document.getElementById('co-address').value;
          if (globalShippingThreshold === 0 || subtotal < globalShippingThreshold) {
              shippingCostVal = globalShippingCost;
          }
      }
      
      const total = subtotal + shippingCostVal;

      await setDoc(orderRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.displayName || 'Usuario',
        items: cartItems,
        subtotal,
        shippingCost: shippingCostVal,
        total,
        status: 'Pendiente',
        paymentMethod,
        deliveryType,
        logistics,
        address,
        createdAt: serverTimestamp()
      });

      // Clear cart
      for (const item of cartItems) {
        await deleteDoc(doc(db, `users/${currentUser.uid}/cart`, item.id));
      }

      showToast('¡Pedido realizado con éxito!');
      toggleSidebar(checkoutSidebar, false);
      checkoutForm.reset();
    } catch(err) {
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

  // Close sidebars
  closeCart?.addEventListener('click', () => toggleSidebar(cartSidebar, false));
  cartOverlay?.addEventListener('click', () => toggleSidebar(cartSidebar, false));
  closeWishlist?.addEventListener('click', () => toggleSidebar(wishlistSidebar, false));
  wishlistOverlay?.addEventListener('click', () => toggleSidebar(wishlistSidebar, false));
  closeCheckout?.addEventListener('click', () => toggleSidebar(checkoutSidebar, false));
  checkoutOverlay?.addEventListener('click', () => toggleSidebar(checkoutSidebar, false));

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

// Initialize everything
setupCategoryButtons();
setupSearch();
setupGlobalButtons();

// Listen to Global Products
productsUnsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
  allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  updateUI();
}, (e) => handleFirestoreError(e, OperationType.LIST, 'products'));

// Listen to Site Settings
onSnapshot(doc(db, 'settings', 'site_config'), (snapshot) => {
  if (snapshot.exists()) {
    const config = snapshot.data();
    
    // Update Dynamic CSS Variables (Primary Color)
    if (config.primaryColor) {
      document.documentElement.style.setProperty('--primary-color', config.primaryColor);
      // Try to dynamically update bg colors referencing the old hex by creating a quick style element
      let styleTag = document.getElementById('dynamic-site-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-site-style';
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = `
        .bg-\\[\\#ba0036\\] { background-color: ${config.primaryColor} !important; }
        .text-\\[\\#ba0036\\] { color: ${config.primaryColor} !important; }
        .border-\\[\\#ba0036\\] { border-color: ${config.primaryColor} !important; }
      `;
    }
    
    if (config.shippingCost !== undefined) globalShippingCost = config.shippingCost;
    if (config.shippingFreeThreshold !== undefined) globalShippingThreshold = config.shippingFreeThreshold;

    // Update Hero Banner
    const heroImageEl = document.querySelector('section.mb-12 img');
    const heroSubtitleEl = document.querySelector('section.mb-12 .text-white\\/80');
    const heroTitleEl = document.querySelector('section.mb-12 h2');
    
    if (config.hero) {
      if (heroImageEl && config.hero.image) heroImageEl.src = config.hero.image;
      if (heroSubtitleEl && config.hero.subtitle) heroSubtitleEl.textContent = config.hero.subtitle;
      if (heroTitleEl && config.hero.title) heroTitleEl.innerHTML = config.hero.title.replace('\\n', '<br />');
    }

    // Start Countdown
    if (config.offerEndTime) {
       startCountdown(config.offerEndTime);
    }

    // Update Brands Ticker
    const brandsContainer = document.querySelector('section.mb-24 .flex.gap-12');
    if (brandsContainer && config.brands && Array.isArray(config.brands)) {
      const classes = [
        "text-3xl font-serif grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-default",
        "text-3xl font-serif italic grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-default tracking-tighter",
        "text-3xl font-sans font-black grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-default tracking-widest",
        "text-3xl font-sans font-light grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all cursor-default tracking-widest"
      ];
      brandsContainer.innerHTML = config.brands.map((brand, i) => {
        if (brand.startsWith('http')) {
          return `<img src="${brand}" class="h-10 grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all object-contain">`;
        }
        return `<span class="${classes[i % classes.length]}">${brand}</span>`;
      }).join('');
    }
  }
});

console.log('StyleHN production-ready JS initialized with Firebase');
