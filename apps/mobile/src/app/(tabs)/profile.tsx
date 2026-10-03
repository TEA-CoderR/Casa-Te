import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { orderStatusLabel } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Icon, type IconName } from '@/components/Icon';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { PrimaryButton } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchOrders, fetchProfile, updateProfile, type OrderWithItems } from '@/lib/api';
import { useClubSettings, useLayout, useStores } from '@/lib/hooks';
import { useFavorites } from '@/store/favorites';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SITE_WIDTH, type WebState } from '@/components/site/shared';
import { supabase } from '@/lib/supabase';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { usePreferences } from '@/store/preferences';
import { useUser } from '@/store/session';

const ACTIVE = new Set(['pending_payment', 'paid', 'picking', 'ready', 'shipped']);

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';

/** One line of a plain grouped list: small icon, label, optional detail, chevron. */
function Row({ icon, title, subtitle, onPress, last }: {
  icon: IconName; title: string; subtitle?: string; onPress: () => void; last?: boolean;
}) {
  return <Pressable onPress={onPress} accessibilityRole="button"
    style={({ pressed, hovered }: WebState) => [styles.row, !last && styles.rowLine, (pressed || hovered) && styles.rowOn]}>
    <Icon name={icon} size={20} strokeWidth={1.4} color={colors.green} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>}
    </View>
    <Icon name="chevron" size={15} color={colors.faint} />
  </Pressable>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.group}>
    <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
    <View>{children}</View>
  </View>;
}

/** Square shortcut (orders, addresses, favourites) at the top of the page. */
function Shortcut({ icon, label, detail, onPress, square }: { icon: IconName; label: string; detail?: string; onPress: () => void; square?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button"
    style={({ pressed, hovered }: WebState) => [styles.shortcut, square && { borderRadius: 4 }, (pressed || hovered) && { borderColor: colors.green }]}>
    <Icon name={icon} size={24} strokeWidth={1.3} color={colors.green} />
    <Text style={styles.shortcutLabel} numberOfLines={1}>{label}</Text>
    {!!detail && <Text style={styles.shortcutDetail} numberOfLines={1}>{detail}</Text>}
  </Pressable>;
}

export default function ProfileScreen() {
  const user = useUser();
  const storeId = usePreferences((s) => s.storeId);
  const { selected } = useStores();
  const { wide } = useLayout();
  const favourites = useFavorites((s) => s.ids.length);
  const [storeSheet, setStoreSheet] = useState(false);
  const profile = useQuery(user ? `profile:${user.id}` : null, () => fetchProfile(user!.id));
  const orders = useQuery<OrderWithItems[]>(user ? `orders:list:${user.id}` : null, fetchOrders);
  useRefetchOnFocus(orders.refetch);

  // Keep the preferred store in the profile (used for marketing/analytics and on other devices).
  useEffect(() => {
    if (user && profile.data && storeId && profile.data.preferred_store_id !== storeId) {
      updateProfile(user.id, { preferred_store_id: storeId }).catch(() => {});
    }
  }, [user, profile.data, storeId]);

  const name = profile.data?.full_name?.trim() || '';
  const member = !!profile.data?.club_member_since;
  const active = (orders.data ?? []).find((o) => ACTIVE.has(o.status));
  const orderCount = orders.data?.length ?? 0;
  const go = (href: Href) => router.push(href);
  const club = useClubSettings();
  const storeName = storeShortName(selected);

  const identity = user ? <View style={[styles.identity, wide && styles.panel]}>
    <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name || user.email || '')}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.hello} numberOfLines={1}>{name ? `Ciao, ${name.split(' ')[0]}` : 'Ciao!'}</Text>
      <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
      {member && <View style={styles.memberBadge}><Icon name="crown" size={13} color="#8A5D12" strokeWidth={1.8} /><Text style={styles.memberText}>Membro Casa & Te Club</Text></View>}
    </View>
    <Pressable onPress={() => go('/account/edit')} accessibilityRole="button" accessibilityLabel="Modifica dati personali"
      style={({ hovered }: WebState) => [styles.editButton, wide && styles.square, hovered && { borderColor: colors.green }]}>
      <Text style={styles.editText}>Modifica</Text></Pressable>
  </View> : <View style={[styles.welcome, wide && styles.panel]}>
    <Text style={styles.welcomeTitle}>Benvenuto in{'\n'}Casa & Te</Text>
    <Text style={styles.welcomeText}>Accedi per seguire i tuoi ordini, salvare gli indirizzi e iscriverti al Club. Ti basta l'email: niente password.</Text>
    <PrimaryButton title="Accedi o registrati" onPress={() => go('/auth/sign-in')} />
  </View>;

  const store = <View style={[styles.store, wide && styles.square, wide && { marginTop: 0, padding: 24 }]}>
    <View style={styles.storeHead}>
      <Icon name="store" size={20} strokeWidth={1.4} color={colors.green} />
      <Text style={styles.storeLabel}>Il tuo negozio</Text>
    </View>
    <Text style={styles.storeName}>{selected ? `CASA & TE ${storeName}` : 'Nessun negozio scelto'}</Text>
    <Text style={styles.storeText}>{selected?.opening_hours ? `Orari: ${selected.opening_hours}` : 'Disponibilità dei prodotti e ritiro gratuito in questo negozio.'}</Text>
    <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={styles.storeChange}>
      {({ hovered }: WebState) => <Text style={[styles.link, hovered && { textDecorationLine: 'underline' }]}>{selected ? 'Cambia negozio' : 'Scegli il negozio'}</Text>}
    </Pressable>
  </View>;

  const clubCard = (club.enabled || member) && <Pressable onPress={() => go('/club')} accessibilityRole="link"
    style={({ hovered }: WebState) => [styles.club, wide && styles.square, wide && { marginTop: 0 }, hovered && { backgroundColor: '#F1E5CF' }]}>
    <Icon name="crown" size={26} color="#8A5D12" strokeWidth={1.4} />
    <View style={{ flex: 1 }}>
      <Text style={styles.clubTitle}>Casa & Te Club</Text>
      <Text style={styles.clubText}>{member ? 'Sei membro: guarda le offerte a te riservate.' : club.tagline}</Text>
    </View>
    <Icon name="chevron" size={16} color={colors.text} />
  </Pressable>;

  const activeCard = active && <Pressable onPress={() => go(`/order/${active.id}`)} accessibilityRole="link" style={[styles.activeOrder, wide && styles.square, wide && { marginTop: 0, marginBottom: 22 }]}>
    <View style={styles.pulse} />
    <View style={{ flex: 1 }}>
      <Text style={styles.activeLabel}>Ordine in corso · {active.order_number}</Text>
      <Text style={styles.activeStatus}>{orderStatusLabel(active.status, active.fulfilment)}</Text>
    </View>
    <Text style={styles.link}>Segui</Text>
  </Pressable>;

  const shortcuts = user && <View style={[styles.shortcuts, wide && { marginTop: 0 }]}>
    <Shortcut square={wide} icon="box" label="Ordini" detail={orderCount ? `${orderCount}` : undefined} onPress={() => go('/orders')} />
    <Shortcut square={wide} icon="pin" label="Indirizzi" onPress={() => go('/account/addresses')} />
    <Shortcut square={wide} icon="heart" label="Preferiti" detail={favourites ? `${favourites}` : undefined} onPress={() => go('/favorites')} />
  </View>;

  const lists = <>
    {user && <Group title="Account">
      {/* Orders, addresses and favourites are the shortcuts above; here only what has no shortcut. */}
      <Row icon="user" title="Dati personali" subtitle={[name, profile.data?.phone].filter(Boolean).join(' · ') || 'Nome e telefono'} onPress={() => go('/account/edit')} last />
    </Group>}
    <Group title="Assistenza e informazioni">
      <Row icon="truck" title="Spedizioni e ritiro" subtitle="Tariffe, tempi e ritiro in negozio" onPress={() => go('/legal/shipping')} />
      <Row icon="shield" title="Condizioni di vendita e resi" onPress={() => go('/legal/terms')} />
      <Row icon="help" title="Informativa privacy" onPress={() => go('/legal/privacy')} last />
    </Group>
    {user && <View style={[styles.session, wide && { alignItems: 'center', flexDirection: 'row', gap: 28 }]}>
      <Pressable onPress={() => supabase.auth.signOut()} accessibilityRole="button"
        style={({ hovered, pressed }: WebState) => [styles.signOut, wide && styles.square, wide && { alignSelf: 'flex-start', paddingHorizontal: 28 }, (hovered || pressed) && { borderColor: colors.text }]}>
        <Text style={styles.signOutText}>Esci dall'account</Text></Pressable>
      <Pressable onPress={() => go('/account/delete')} accessibilityRole="button" hitSlop={6}>
        {({ hovered }: WebState) => <Text style={[styles.delete, hovered && { textDecorationLine: 'underline' }]}>Elimina account</Text>}
      </Pressable>
    </View>}
    <Text style={[styles.footer, wide && { textAlign: 'left' }]}>Casa & Te · Versione {Constants.expoConfig?.version ?? '1.0.0'} · Pagamenti gestiti da Stripe</Text>
  </>;

  // Desktop: a page title, then the person and their store on the left, everything else on the right.
  if (wide) return <Screen maxWidth={SITE_WIDTH - 80} contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 0 }}
    after={<SiteFooter />} bleed={40}>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <Text style={styles.pageTitle} accessibilityRole="header">Il mio account</Text>
    <View style={styles.columns}>
      <View style={styles.side}>{identity}{store}{clubCard}</View>
      <View style={styles.main}>{activeCard}{shortcuts}{lists}</View>
    </View>
  </Screen>;

  return <Screen>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    {identity}
    {activeCard}
    {shortcuts}
    {store}
    {clubCard}
    {lists}
  </Screen>;
}

const styles = StyleSheet.create({
  pageTitle: { fontSize: 56, lineHeight: 62, letterSpacing: -1, fontFamily: fonts.serif, color: colors.text, paddingTop: 40, paddingBottom: 28,
    borderBottomWidth: 1, borderColor: colors.text, marginBottom: 36 },
  columns: { flexDirection: 'row', gap: 56, alignItems: 'flex-start' },
  side: { width: 380, gap: 20 },
  main: { flex: 1, minWidth: 0 },
  square: { borderRadius: 4 },
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: 4, padding: 24, marginTop: 0 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 24, fontFamily: fonts.serif },
  hello: { fontSize: 28, lineHeight: 32, fontFamily: fonts.serif, color: colors.text },
  email: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans, marginTop: 2 },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: colors.sand, borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  memberText: { fontSize: 11, color: '#7A5414', fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  editButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, height: 34, justifyContent: 'center' },
  editText: { fontSize: 13, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  link: { fontSize: 13.5, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },

  welcome: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 22, gap: 12, marginTop: 8 },
  welcomeTitle: { fontSize: 30, lineHeight: 35, fontFamily: fonts.serif, color: colors.text },
  welcomeText: { fontSize: 14, lineHeight: 21, color: colors.muted, fontFamily: fonts.sans, marginBottom: 4 },

  activeOrder: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E8EFE6', borderRadius: 12, padding: 16, marginTop: 22 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  activeLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
  activeStatus: { fontSize: 17, fontFamily: fonts.serif, color: colors.text, marginTop: 1 },

  shortcuts: { flexDirection: 'row', gap: 10, marginTop: 22 },
  shortcut: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  shortcutLabel: { fontSize: 13.5, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  shortcutDetail: { position: 'absolute', top: 8, right: 10, fontSize: 11.5, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: '600' },

  store: { marginTop: 22, padding: 18, borderRadius: 12, backgroundColor: colors.stone, gap: 4 },
  storeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  storeLabel: { fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  storeName: { fontSize: 22, lineHeight: 26, fontFamily: fonts.serif, color: colors.text },
  storeText: { fontSize: 13, lineHeight: 19, color: colors.muted, fontFamily: fonts.sans },
  storeChange: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },

  club: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.sand, borderRadius: 12, padding: 16, marginTop: 14 },
  clubTitle: { fontSize: 18, fontFamily: fonts.serif, color: colors.text },
  clubText: { fontSize: 12.5, lineHeight: 17, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },

  group: { marginTop: 30 },
  groupTitle: { fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, fontFamily: fonts.sansSemiBold, fontWeight: '600',
    paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 58, paddingVertical: 10, paddingHorizontal: 2 },
  rowLine: { borderBottomWidth: 1, borderColor: colors.line },
  rowOn: { backgroundColor: '#FAF7F2' },
  rowTitle: { fontSize: 15.5, color: colors.text, fontFamily: fonts.sans },
  rowSub: { fontSize: 12.5, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },

  session: { marginTop: 36, alignItems: 'center', gap: 16 },
  signOut: { alignSelf: 'stretch', height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 15, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  delete: { fontSize: 13, color: colors.danger, fontFamily: fonts.sans },
  footer: { marginTop: 36, textAlign: 'center', fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
});
