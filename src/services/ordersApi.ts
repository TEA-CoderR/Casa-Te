import Constants from 'expo-constants';
import type { Order } from '@/types/order';

function apiBase(): string {
  const configured = process.env.EXPO_PUBLIC_ORDER_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) throw new Error('Servizio ordini non configurato. Avvia la demo con Expo LAN.');
  try {
    const metro = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`);
    return `http://${metro.hostname}:8787`;
  } catch {
    throw new Error('Indirizzo del servizio ordini non valido.');
  }
}

export async function submitOrder(order: Order): Promise<Order> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    response = await fetch(`${apiBase()}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order), signal: controller.signal,
    });
  } catch {
    throw new Error('Servizio ordini non raggiungibile. Verifica la connessione e riprova.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? 'Impossibile confermare l’ordine. Riprova.');
  }
  const payload = await response.json() as { order?: Order };
  if (!payload.order || payload.order.id !== order.id) throw new Error('Risposta ordine non valida. Riprova.');
  return payload.order;
}
