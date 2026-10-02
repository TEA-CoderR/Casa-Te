// Minimal stroke icon set for the console (no icon-font dependency).
const PATHS = {
  dashboard: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z',
  picking: 'M9 5h10M9 12h10M9 19h10M4.5 5l1 1 2-2M4.5 12l1 1 2-2M4.5 19l1 1 2-2',
  orders: 'M6 3h12l1 18H5zM9 8a3 3 0 0 0 6 0',
  inventory: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  products: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  import: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  categories: 'M4 6h16M4 12h10M4 18h6',
  reviews: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  coupons: 'M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 7v12',
  shipping: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  pickup: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  customers: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M19 15c2 .6 3 2.4 3 5',
  stores: 'M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-6h6v6',
  staff: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  euro: 'M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  refund: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M19 12H5M11 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
} as const;

export type AdminIcon = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: AdminIcon; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}
