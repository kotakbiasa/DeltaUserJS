import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  User,
  X,
} from 'lucide-react';
import {
  api,
  StoreOrder,
  StoreOrderStatus,
  StoreProduct,
  StoreProductInput,
  UserMe,
} from '../api';
import {
  copyText,
  openTelegramUser,
  showConfirm,
  tg,
  triggerHaptic,
} from '../telegram';
import {
  Badge,
  Banner,
  Card,
  Empty,
  SectionLabel,
  Skeleton,
  Spinner,
  Switch,
  Toast,
  formatDate,
} from '../ui';

interface StoreTabProps {
  user: UserMe;
  active?: boolean;
}

const STATUS_META: Record<
  StoreOrderStatus,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'info'; icon: React.ElementType }
> = {
  pending: { label: 'Menunggu', tone: 'warn', icon: Clock },
  contacted: { label: 'Dihubungi', tone: 'info', icon: User },
  completed: { label: 'Selesai', tone: 'ok', icon: CheckCircle2 },
  cancelled: { label: 'Dibatalkan', tone: 'danger', icon: Ban },
};

type ProductFormState = Omit<StoreProductInput, 'tags'> & { tags: string };

const EMPTY_FORM: ProductFormState = {
  name: '',
  pluginName: '',
  version: '1.0.0',
  description: '',
  price: 0,
  category: 'Plugin Digital',
  deliveryNote: 'Plugin dikirim atau diinstal setelah owner menghubungi pembeli.',
  tags: '',
  featured: false,
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

function getOrderEdit(
  edits: Record<string, { status: StoreOrderStatus; ownerReply: string }>,
  order: StoreOrder
) {
  return (
    edits[order.id] || {
      status: order.status,
      ownerReply: order.ownerReply,
    }
  );
}

export const StoreTab: React.FC<StoreTabProps> = ({ user, active = true }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [ownerId, setOwnerId] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const [orderNote, setOrderNote] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [ownerPanelOpen, setOwnerPanelOpen] = useState(false);
  const [productForm, setProductForm] = useState(EMPTY_FORM);
  const [savingProduct, setSavingProduct] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [orderEdits, setOrderEdits] = useState<
    Record<string, { status: StoreOrderStatus; ownerReply: string }>
  >({});
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const showToast = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadStore = useCallback(async (manual = false) => {
    if (manual) {setRefreshing(true);}
    try {
      setError(null);
      const [productResult, orderResult] = await Promise.allSettled([
        api.getStoreProducts(user.isOwner),
        api.getStoreOrders(user.isOwner),
      ]);
      let hadError = false;
      if (productResult.status === 'fulfilled' && productResult.value.success) {
        setProducts(productResult.value.products || []);
        setOwnerId(productResult.value.ownerId);
      } else {
        hadError = true;
        setError('Katalog plugin belum dapat dimuat.');
      }
      if (orderResult.status === 'fulfilled' && orderResult.value.success) {
        setOrders(orderResult.value.orders || []);
      } else if (!hadError) {
        setError('Daftar pesanan belum dapat dimuat.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat toko digital.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.isOwner]);

  useEffect(() => {
    if (!active) {return;}
    loadStore();
  }, [active, loadStore]);

  useEffect(() => {
    if (!selectedProduct) {return;}
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const close = () => setSelectedProduct(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) {return;}
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {return;}
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const backButton = tg?.BackButton;
    backButton?.onClick(close);
    backButton?.show();
    window.addEventListener('keydown', onKey);
    const frame = window.requestAnimationFrame(() => modalRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      backButton?.offClick(close);
      backButton?.hide();
      previouslyFocused?.focus?.();
    };
  }, [selectedProduct]);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (!user.isOwner && !product.active) {return false;}
      if (!needle) {return true;}
      return [
        product.name,
        product.pluginName,
        product.version,
        product.description,
        product.category,
        ...product.tags,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [products, query, user.isOwner]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    filteredProducts.forEach((product) => {
      counts.set(product.category, (counts.get(product.category) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredProducts]);

  const openProduct = (product: StoreProduct) => {
    triggerHaptic('light');
    setOrderNote('');
    setSelectedProduct(product);
  };

  const submitOrder = async () => {
    if (!selectedProduct || ordering) {return;}
    const confirmed = await showConfirm(
      `Pesan ${selectedProduct.name} v${selectedProduct.version} seh ${formatPrice(selectedProduct.price)}?\n\nPesanan diproses manual oleh owner.`
    );
    if (!confirmed) {return;}

    triggerHaptic('medium');
    setOrdering(true);
    try {
      const response = await api.createStoreOrder(selectedProduct.id, orderNote.trim() || undefined);
      triggerHaptic('success');
      showToast(response.message || 'Pesanan berhasil dibuat.', true);
      setSelectedProduct(null);
      setOrderNote('');
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal membuat pesanan.', false);
      return;
    } finally {
      setOrdering(false);
    }

    try {
      const orderResponse = await api.getStoreOrders(user.isOwner);
      setOrders(orderResponse.orders || []);
    } catch {
      showToast('Pesanan berhasil dibuat, tetapi daftar belum dapat dimuat. Muat ulang nanti.', true);
    }
  };

  const createProduct = async () => {
    if (savingProduct) {return;}
    setSavingProduct(true);
    try {
      const response = await api.createStoreProduct({
        ...productForm,
        tags: productForm.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      triggerHaptic('success');
      showToast(response.message || 'Produk ditambahkan.', true);
      setProductForm(EMPTY_FORM);
      await loadStore();
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal menambahkan produk.', false);
    } finally {
      setSavingProduct(false);
    }
  };

  const patchProduct = async (
    product: StoreProduct,
    patch: { active?: boolean; featured?: boolean }
  ) => {
    setPendingProductId(product.id);
    try {
      const response = await api.updateStoreProduct(product.id, patch);
      setProducts((current) =>
        current.map((item) => (item.id === product.id ? response.product : item))
      );
      triggerHaptic('success');
      showToast(response.message || 'Produk diperbarui.', true);
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui produk.', false);
    } finally {
      setPendingProductId(null);
    }
  };

  const saveOrder = async (order: StoreOrder) => {
    const edit = getOrderEdit(orderEdits, order);
    setSavingOrderId(order.id);
    try {
      const response = await api.updateStoreOrder(order.id, edit);
      setOrders((current) => current.map((item) => (item.id === order.id ? response.order : item)));
      setOrderEdits((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      triggerHaptic('success');
      showToast('Status pesanan diperbarui.', true);
    } catch (err) {
      triggerHaptic('error');
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui pesanan.', false);
    } finally {
      setSavingOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="page stack gap-12">
        <Skeleton height={142} count={1} />
        <Skeleton height={64} count={1} />
        <Skeleton height={156} count={3} />
      </div>
    );
  }

  return (
    <div className="page stack gap-14">
      {toast && (
        <Toast tone={toast.ok ? 'ok' : 'err'}>
          {toast.ok ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span className="grow">{toast.text}</span>
        </Toast>
      )}
      {error && (
        <Banner tone="danger" icon={<ShieldCheck size={17} />}>
          <div>{error}</div>
          <button className="btn ghost sm mt-10" onClick={() => loadStore(true)}>
            <RefreshCw size={13} /> Coba lagi
          </button>
        </Banner>
      )}

      <section className="store-hero">
        <div className="store-hero-icon">
          <Store size={28} />
        </div>
        <div className="grow">
          <div className="fs-11 fw-8 hint" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Plugin marketplace
          </div>
          <h1 className="store-title">Toko Plugin Digital</h1>
          <p className="store-subtitle">
            Plugin pilihan untuk userbot DeltaUserJS. Pilih paket, lalu konfirmasi pesanan langsung ke owner.
          </p>
        </div>
        <Badge tone="gold">Pembayaran manual</Badge>
      </section>

      {user.isOwner && (
        <section className="owner-store-bar">
          <div className="center gap-10 grow" style={{ minWidth: 0 }}>
            <Crown size={18} color="var(--gold)" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="fw-7 fs-13">Mode Owner</div>
              <div className="fs-11 hint">
                {products.filter((product) => product.active).length} produk aktif · {orders.length} pesanan
              </div>
            </div>
          </div>
          <button
            className={`btn ${ownerPanelOpen ? 'ghost' : 'primary'} sm`}
            onClick={() => setOwnerPanelOpen((value) => !value)}
          >
            {ownerPanelOpen ? <EyeOff size={14} /> : <Eye size={14} />}
            {ownerPanelOpen ? 'Tutup' : 'Kelola'}
          </button>
        </section>
      )}

      {ownerPanelOpen && user.isOwner && (
        <OwnerPanel
          products={products}
          orders={orders}
          form={productForm}
          setForm={setProductForm}
          savingProduct={savingProduct}
          onCreateProduct={createProduct}
          pendingProductId={pendingProductId}
          onPatchProduct={patchProduct}
          orderEdits={orderEdits}
          setOrderEdits={setOrderEdits}
          savingOrderId={savingOrderId}
          onSaveOrder={saveOrder}
          onCopyOrder={async (order) => {
            const ok = await copyText(`${order.productName} — ${order.id}`);
            showToast(ok ? 'ID pesanan disalin.' : 'Gagal menyalin ID.', ok);
          }}
        />
      )}

      <section>
        <SectionLabel
          right={
            <button className="icon-btn" onClick={() => loadStore(true)} aria-label="Muat ulang toko">
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            </button>
          }
        >
          <ShoppingBag size={13} /> Katalog plugin
        </SectionLabel>

        <div className="store-search">
          <Search size={16} className="hint" />
          <input
            className="input"
            type="search"
            aria-label="Cari plugin"
            placeholder="Cari plugin, kategori, atau tag…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="icon-btn" onClick={() => setQuery('')} aria-label="Bersihkan pencarian">
              <X size={15} />
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <div className="chip-row no-scrollbar">
            {categories.map(([category, count]) => (
              <span key={category} className="chip">
                {category} <span className="chip-count">{count}</span>
              </span>
            ))}
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <Card>
            <Empty
              icon="🧩"
              title={query ? 'Plugin tidak ditemukan' : 'Belum ada plugin dijual'}
              desc={
                user.isOwner
                  ? 'Gunakan panel Kelola untuk menambahkan plugin digital pertama.'
                  : 'Owner belum menambahkan plugin digital. Cek kembali nanti.'
              }
            />
          </Card>
        ) : (
          <div className="store-grid">
            {filteredProducts.map((product) => (
              <article key={product.id} className={`product-card ${product.featured ? 'featured' : ''}`}>
                <div className="product-top">
                  <span className="product-icon">
                    <Package size={21} />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="between gap-8">
                      <span className="product-name truncate">{product.name}</span>
                      {product.featured && <Badge tone="gold">Unggulan</Badge>}
                    </div>
                    <div className="product-version">
                      v{product.version} · <span className="mono">{product.pluginName}</span>
                    </div>
                  </div>
                </div>
                <p className="product-description">{product.description}</p>
                {product.tags.length > 0 && (
                  <div className="product-tags">
                    {product.tags.slice(0, 4).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
                <div className="product-footer">
                  <div>
                    <div className="product-price">{formatPrice(product.price)}</div>
                    <div className="product-manual">Konfirmasi owner</div>
                  </div>
                  {user.isOwner && !product.active ? (
                    <Badge tone="muted">Nonaktif</Badge>
                  ) : (
                    <button
                      className="btn primary sm"
                      aria-label={`Pesan ${product.name}`}
                      onClick={() => openProduct(product)}
                    >
                      <ShoppingBag size={14} /> Pesan
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionLabel right={<Badge tone={user.isOwner ? 'info' : 'muted'}>{orders.length}</Badge>}>
          {user.isOwner ? 'Pesanan pelanggan' : 'Pesanan saya'}
        </SectionLabel>
        {orders.length === 0 ? (
          <Card>
            <Empty
              icon="🧾"
              title="Belum ada pesanan"
              desc={user.isOwner ? 'Pesanan manual akan muncul di sini.' : 'Pesanan plugin yang kamu buat akan muncul di sini.'}
            />
          </Card>
        ) : (
          <div className="stack gap-10">
            {orders.map((order) => {
              const meta = STATUS_META[order.status];
              const StatusIcon = meta.icon;
              return (
                <Card key={order.id} className="order-card">
                  <div className="between gap-10">
                    <div className="center gap-10 grow" style={{ minWidth: 0 }}>
                      <span className="row-icon">
                        <StatusIcon size={17} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="row-title truncate">{order.productName}</div>
                        <div className="fs-11 hint">
                          v{order.version} · {formatDate(order.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  {user.isOwner && (
                    <div className="order-buyer">
                      <User size={13} />
                      <button
                        className="link-button"
                        onClick={() => openTelegramUser(order.userId)}
                      >
                        {order.username ? `@${order.username}` : `User ${order.userId}`}
                      </button>
                      <span>·</span>
                      <span>{order.id}</span>
                    </div>
                  )}
                  <div className="order-summary">
                    <span>Total</span>
                    <strong>{formatPrice(order.amount)}</strong>
                  </div>
                  {order.buyerNote && (
                    <div className="order-note">
                      <b>Catatan pembeli</b>
                      <span>{order.buyerNote}</span>
                    </div>
                  )}
                  {order.ownerReply && !user.isOwner && (
                    <div className="owner-reply">
                      <b>Balasan owner</b>
                      <span>{order.ownerReply}</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {!user.isOwner && ownerId && (
        <button className="btn ghost wide" onClick={() => openTelegramUser(ownerId)}>
          <User size={16} /> Hubungi owner
        </button>
      )}

      {selectedProduct && (
        <div className="modal-layer" role="presentation">
          <button className="modal-scrim" onClick={() => setSelectedProduct(null)} aria-label="Tutup" />
          <section
            ref={modalRef}
            tabIndex={-1}
            className="store-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Pesan ${selectedProduct.name}`}
          >            <div className="between">
              <span className="fs-11 fw-8 hint" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Konfirmasi pesanan
              </span>
              <button className="icon-btn" onClick={() => setSelectedProduct(null)} aria-label="Tutup">
                <X size={16} />
              </button>
            </div>
            <div className="store-modal-product">
              <span className="product-icon large"><Package size={24} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="fw-8 fs-15">{selectedProduct.name}</div>
                <div className="fs-12 hint">v{selectedProduct.version} · {selectedProduct.category}</div>
              </div>
              <strong>{formatPrice(selectedProduct.price)}</strong>
            </div>
            <div className="banner info">
              <ShieldCheck size={17} className="shrink-0" />
              <span className="fs-12">
                {selectedProduct.deliveryNote || 'Owner akan menghubungi purchaser setelah pesanan dibuat.'}
              </span>
            </div>
            <div>
              <div className="field-label">Catatan untuk owner (opsional)</div>
              <textarea
                className="input"
                aria-label="Catatan untuk owner"
                rows={3}
                maxLength={500}
                placeholder="Contoh: plugin untuk Windows, DAM-69, atau catatan versi…"
                value={orderNote}
                onChange={(event) => setOrderNote(event.target.value)}
              />
              <div className="between fs-11 hint mt-6">
                <span>Tidak ada pembayaran otomatis.</span>
                <span>{orderNote.length}/500</span>
              </div>
            </div>
            <button
              className="btn primary wide"
              aria-label={`Kirim pesanan ${selectedProduct.name}`}
              onClick={submitOrder}
              disabled={ordering}
            >
              {ordering ? <Spinner size={17} /> : <ShoppingBag size={17} />}
              {ordering ? 'Mengirim pesanan…' : 'Kirim pesanan'}
            </button>
          </section>
        </div>
      )}
    </div>
  );
};

interface OwnerPanelProps {
  products: StoreProduct[];
  orders: StoreOrder[];
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  savingProduct: boolean;
  onCreateProduct: () => void;
  pendingProductId: string | null;
  onPatchProduct: (
    product: StoreProduct,
    patch: { active?: boolean; featured?: boolean }
  ) => void;
  orderEdits: Record<string, { status: StoreOrderStatus; ownerReply: string }>;
  setOrderEdits: React.Dispatch<
    React.SetStateAction<Record<string, { status: StoreOrderStatus; ownerReply: string }>>
  >;
  savingOrderId: string | null;
  onSaveOrder: (order: StoreOrder) => void;
  onCopyOrder: (order: StoreOrder) => void;
}

const OwnerPanel: React.FC<OwnerPanelProps> = ({
  products,
  orders,
  form,
  setForm,
  savingProduct,
  onCreateProduct,
  pendingProductId,
  onPatchProduct,
  orderEdits,
  setOrderEdits,
  savingOrderId,
  onSaveOrder,
  onCopyOrder,
}) => (
  <div className="stack gap-14 owner-panel">
    <section>
      <SectionLabel><Plus size={13} /> Tambah plugin digital</SectionLabel>
      <Card pad>
        <fieldset className="store-form-fieldset" disabled={savingProduct}>
        <div className="form-grid">
          <label>
            <span className="field-label">Nama tampilan</span>
            <input
              className="input"
              maxLength={80}
              placeholder="Premium Moderation"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span className="field-label">Nama internal plugin</span>
            <input
              className="input mono"
              maxLength={50}
              placeholder="premium_moderation"
              value={form.pluginName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  pluginName: event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
                }))
              }
            />
          </label>
          <label>
            <span className="field-label">Versi</span>
            <input
              className="input mono"
              maxLength={30}
              value={form.version}
              onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
            />
          </label>
          <label>
            <span className="field-label">Harga (Rp)</span>
            <input
              className="input num"
              type="number"
              min={0}
              step={1000}
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({ ...current, price: Math.max(0, Number(event.target.value) || 0) }))
              }
            />
          </label>
          <label>
            <span className="field-label">Kategori</span>
            <input
              className="input"
              maxLength={40}
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            />
          </label>
          <label>
            <span className="field-label">Tag dipisah koma</span>
            <input
              className="input"
              placeholder="moderasi, premium, grup"
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
            />
          </label>
        </div>
        <label className="block mt-12">
          <span className="field-label">Deskripsi</span>
          <textarea
            className="input"
            rows={3}
              maxLength={2000}
            placeholder="Jelaskan fungsi, manfaat, dan kebutuhan plugin."
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </label>
        <label className="block mt-12">
          <span className="field-label">Catatan pengiriman</span>
          <textarea
            className="input"
            rows={2}
            maxLength={500}
            value={form.deliveryNote}
            onChange={(event) =>
              setForm((current) => ({ ...current, deliveryNote: event.target.value }))
            }
          />
        </label>
        <div className="between mt-12">
          <span className="fs-12 hint">Tandai sebagai produk unggulan.</span>
          <Switch
            checked={Boolean(form.featured)}
            onChange={(featured) => setForm((current) => ({ ...current, featured }))}
            label="Produk unggulan"
          />
        </div>
        <button className="btn primary wide mt-14" onClick={onCreateProduct} disabled={savingProduct}>
          {savingProduct ? <Spinner size={16} /> : <Plus size={16} />}
          {savingProduct ? 'Menyimpan…' : 'Tambah produk'}
        </button>
        </fieldset>
      </Card>
    </section>

    <section>
      <SectionLabel right={<Badge tone="muted">{products.length}</Badge>}>
        <Tag size={13} /> Status produk
      </SectionLabel>
      <Card>
        {products.length === 0 ? (
          <Empty icon="📦" title="Belum ada produk" desc="Tambahkan plugin digital pertama melalui form di atas." />
        ) : (
          products.map((product) => (
            <div key={product.id} className="owner-product-row">
              <span className="product-icon small"><Package size={17} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row-title truncate">{product.name}</div>
                <div className="fs-11 hint">
                  v{product.version} · {formatPrice(product.price)} · {product.active ? 'Aktif' : 'Nonaktif'}
                </div>
              </div>
              <div className="owner-product-switches">
                <span className="fs-10 hint">Aktif</span>
                <Switch
                  checked={product.active}
                  disabled={Boolean(pendingProductId)}
                  onChange={(active) => onPatchProduct(product, { active })}
                  label={`Aktifkan ${product.name}`}
                />
                <span className="fs-10 hint">Unggulan</span>
                <Switch
                  checked={product.featured}
                  disabled={Boolean(pendingProductId)}
                  onChange={(featured) => onPatchProduct(product, { featured })}
                  label={`Jadikan ${product.name} unggulan`}
                />
              </div>
            </div>
          ))
        )}
      </Card>
    </section>

    <section>
      <SectionLabel right={<Badge tone="warn">{orders.length}</Badge>}>
        <ShoppingBag size={13} /> Kelola pesanan
      </SectionLabel>
      <div className="stack gap-10">
        {orders.length === 0 ? (
          <Card><Empty icon="🧾" title="Belum ada pesanan" desc="Pesanan pelanggan akan muncul di sini." /></Card>
        ) : (
          orders.map((order) => {
            const edit = getOrderEdit(orderEdits, order);
            return (
              <Card key={order.id} pad className="owner-order-card">
                <div className="between gap-8">
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-7 truncate">{order.productName}</div>
                    <div className="fs-11 hint truncate">
                      {order.username ? `@${order.username}` : `User ${order.userId}`} · {order.id}
                    </div>
                  </div>
                  <strong>{formatPrice(order.amount)}</strong>
                </div>
                {order.buyerNote && <div className="order-note mt-10"><b>Catatan</b><span>{order.buyerNote}</span></div>}
                <div className="form-grid mt-12">
                  <label>
                    <span className="field-label">Status</span>
                    <select
                      className="input"
                      disabled={savingOrderId === order.id}
                      value={edit.status}
                      onChange={(event) =>
                        setOrderEdits((current) => ({
                          ...current,
                          [order.id]: {
                            ...edit,
                            status: event.target.value as StoreOrderStatus,
                          },
                        }))
                      }
                    >
                      <option value="pending">Menunggu</option>
                      <option value="contacted">Sudah dihubungi</option>
                      <option value="completed">Selesai</option>
                      <option value="cancelled">Dibatalkan</option>
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Balasan owner</span>
                    <input
                      className="input"
                      disabled={savingOrderId === order.id}
                      maxLength={1000}
                      placeholder="Link download atau instruksi delivery…"
                      value={edit.ownerReply}
                      onChange={(event) =>
                        setOrderEdits((current) => ({
                          ...current,
                          [order.id]: { ...edit, ownerReply: event.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="between mt-10">
                  <button className="btn ghost sm" onClick={() => onCopyOrder(order)}>
                    Salin ID
                  </button>
                  <button
                    className="btn primary sm"
                    onClick={() => onSaveOrder(order)}
                    disabled={savingOrderId === order.id}
                  >
                    {savingOrderId === order.id ? <Spinner size={14} /> : <Save size={14} />}
                    Simpan
                  </button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </section>
  </div>
);
