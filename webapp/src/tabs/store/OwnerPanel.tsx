/**
 * Panel owner tab Store: form produk dan pengelolaan pesanan.
 *
 * Dipecah dari StoreTab.tsx (922 baris). Isi dipindahkan apa adanya;
 * yang berubah hanya di file mana ia tinggal.
 */
import React from 'react';
import { Package, Plus, Save, ShoppingBag, Tag, User } from 'lucide-react';
import { StoreOrder, StoreOrderStatus, StoreProduct } from '../../api';
import { Badge, Card, Empty, SectionLabel, Spinner, Switch } from '../../ui';
import { ProductFormState, formatPrice , getOrderEdit } from './shared.js';

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

export const OwnerPanel: React.FC<OwnerPanelProps> = ({
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
