/**
 * Tipe, konstanta, dan helper murni milik tab Store.
 *
 * Dipecah dari StoreTab.tsx (922 baris). Isi dipindahkan apa adanya;
 * yang berubah hanya di file mana ia tinggal.
 */
import React from 'react';
import { Ban, CheckCircle2, Clock, User } from 'lucide-react';
import { StoreOrder, StoreOrderStatus, StoreProductInput, UserMe } from '../../api';

export interface StoreTabProps {
  user: UserMe;
  active?: boolean;
}

export const STATUS_META: Record<
  StoreOrderStatus,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'info'; icon: React.ElementType }
> = {
  pending: { label: 'Menunggu', tone: 'warn', icon: Clock },
  contacted: { label: 'Dihubungi', tone: 'info', icon: User },
  completed: { label: 'Selesai', tone: 'ok', icon: CheckCircle2 },
  cancelled: { label: 'Dibatalkan', tone: 'danger', icon: Ban },
};

export type ProductFormState = Omit<StoreProductInput, 'tags'> & { tags: string };

export const EMPTY_FORM: ProductFormState = {
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

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function getOrderEdit(
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
