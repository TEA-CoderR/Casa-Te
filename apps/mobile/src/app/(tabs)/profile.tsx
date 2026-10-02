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
import { useStores } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { usePreferences } from '@/store/preferences';
import { useUser } from '@/store/session';

const ACTIVE = new Set(['pending_payment', 'paid', 'picking', 'ready', 'shipped']);

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';

function Row({ icon, title, subtitle, onPress, danger, last }: {
  icon: IconName; title: string; subtitle?: string; onPress: () => void; danger?: boolean; last?: boolean;
}) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { opacity: 0.6 }]}>
    <View style={[styles.rowIcon, danger && { backgroundColor: '#F8E9E7' }]}><Icon name={icon} size={19} strokeWidth={1.5} color={danger ? colors.danger : colors.text} /></View>
    <View style={{ flex: 1 }}>
      <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
      {!!subtitle && <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>}
    </View>
    {!danger && <Icon name="chevron" size={16} color={colors.faint} />}
  </Pressable>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ marginTop: 26 }}>
    <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
    <View style={styles.card}>{children}</View>
  </View>;
}

export default function ProfileScreen() {
  const user = useUser();
  const storeId = usePreferences((s) => s.storeId);
  const { selected } = useStores();
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
  const go = (href: Href) => router.push(href);

  return <Screen>
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />

    {user ? <View style={styles.hero}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name || user.email || '')}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.hello}>{name ? `Ciao, ${name.split(' ')[0]}` : 'Ciao!'}</Text>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
        {member && <View style={styles.memberBadge}><Icon name="crown" size={13} color="#B07A1E" strokeWidth={1.8} /><Text style={styles.memberText}>Membro Casa & Te Club</Text></View>}
      </View>
      <Pressable onPress={() => go('/account/edit')} accessibilityRole="button" accessibilityLabel="Modifica dati personali" hitSlop={8}>
        <Text style={styles.edit}>Modifica</Text></Pressable>
    </View> : <View style={styles.welcome}>
      <Text style={styles.welcomeTitle}>Benvenuto in{'\n'}Casa & Te</Text>
      <Text style={styles.welcomeText}>Accedi per seguire i tuoi ordini, salvare gli indirizzi e iscriverti al Club. Ti basta l'email: niente password.</Text>
      <PrimaryButton title="Accedi o registrati" onPress={() => go('/auth/sign-in')} />
    </View>}

    {active && <Pressable onPress={() => go(`/order/${active.id}`)} accessibilityRole="link" style={styles.activeOrder}>
      <View style={styles.pulse} />
      <View style={{ flex: 1 }}>
        <Text style={styles.activeLabel}>Ordine in corso · {active.order_number}</Text>
        <Text style={styles.activeStatus}>{orderStatusLabel(active.status, active.fulfilment)}</Text>
      </View>
      <Text style={styles.edit}>Segui</Text>
    </Pressable>}

    <Pressable onPress={() => go('/club')} accessibilityRole="link" style={styles.club}>
      <Icon name="crown" size={30} color="#B07A1E" strokeWidth={1.4} />
      <View style={{ flex: 1 }}>
        <Text style={styles.clubTitle}>Casa & Te Club</Text>
        <Text style={styles.clubText}>{member ? 'Sei membro: guarda le offerte a te riservate.' : 'Scopri vantaggi esclusivi e offerte dedicate ai nostri clienti.'}</Text>
      </View>
      <Icon name="chevron" size={18} />
    </Pressable>

    <Group title="Il mio negozio">
      <Row icon="store" title={selected ? `CASA & TE ${storeShortName(selected)}` : 'Scegli il negozio'}
        subtitle={selected?.opening_hours ? `Orari: ${selected.opening_hours}` : 'Disponibilità e ritiro gratuito qui · Cambia'}
        onPress={() => setStoreSheet(true)} last />
    </Group>

    {user && <Group title="Account">
      <Row icon="user" title="Dati personali" subtitle={[name, profile.data?.phone].filter(Boolean).join(' · ') || 'Nome e telefono'} onPress={() => go('/account/edit')} />
      <Row icon="pin" title="Indirizzi di consegna" onPress={() => go('/account/addresses')} />
      <Row icon="box" title="I miei ordini" subtitle="Stato, ritiri e consegne" onPress={() => go('/orders')} last />
    </Group>}

    <Group title="Assistenza e informazioni">
      <Row icon="truck" title="Spedizioni e ritiro" subtitle="Tariffe, tempi e ritiro in negozio" onPress={() => go('/legal/shipping')} />
      <Row icon="shield" title="Condizioni di vendita e resi" onPress={() => go('/legal/terms')} />
      <Row icon="help" title="Informativa privacy" onPress={() => go('/legal/privacy')} last />
    </Group>

    {user && <Group title="Sessione">
      <Row icon="arrow" title="Esci" onPress={() => supabase.auth.signOut()} />
      <Row icon="close" title="Elimina account" danger onPress={() => go('/account/delete')} last />
    </Group>}

    <View style={{ marginTop: 30, alignItems: 'center', gap: 4 }}>
      <Text style={styles.footerLogo}>Casa & Te</Text>
      <Text style={styles.footer}>Versione {Constants.expoConfig?.version ?? '1.0.0'} · Pagamenti gestiti da Stripe</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 26, fontFamily: fonts.serif },
  hello: { fontSize: 28, lineHeight: 33, fontFamily: fonts.serif, color: colors.text },
  email: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans, marginTop: 2 },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: colors.sand, borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  memberText: { fontSize: 11, color: '#7A5414', fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  edit: { fontSize: 13, color: colors.green, textDecorationLine: 'underline', fontFamily: fonts.sansMedium, fontWeight: '500' },
  welcome: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 22, gap: 12, marginTop: 8 },
  welcomeTitle: { fontSize: 30, lineHeight: 35, fontFamily: fonts.serif, color: colors.text },
  welcomeText: { fontSize: 14, lineHeight: 21, color: colors.muted, fontFamily: fonts.sans, marginBottom: 4 },
  activeOrder: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E8EFE6', borderRadius: 14, padding: 16, marginTop: 22 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  activeLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
  activeStatus: { fontSize: 17, fontFamily: fonts.serif, color: colors.text, marginTop: 1 },
  club: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.sand, borderRadius: 14, padding: 16, marginTop: 22 },
  clubTitle: { fontSize: 18, fontFamily: fonts.serif, color: colors.text },
  clubText: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },
  groupTitle: { fontSize: 19, fontFamily: fonts.serif, color: colors.text, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 10 },
  rowLine: { borderBottomWidth: 1, borderColor: colors.line },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },
  footerLogo: { fontSize: 18, fontFamily: fonts.serif, color: colors.text },
  footer: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
});
