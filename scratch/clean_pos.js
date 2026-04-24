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
    
    if(!order) return;

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
        
    } catch(err) {
        console.error("Error procesando POS:", err);
        showToast('Error al registrar la venta.');
    } finally {
        posCheckoutBtn.disabled = false;
        posCheckoutBtn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> Cobrar y Finalizar';
        initIcons();
    }
});
