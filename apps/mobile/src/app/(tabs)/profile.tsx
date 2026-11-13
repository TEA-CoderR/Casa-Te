import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brandMonogramGreen, brandMonogramYellow, MONOGRAM_ASPECT } from '@/config/brand';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { orderStatusLabel } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Icon, type IconName } from '@/components/Icon';
import { StoreSheet, storeShortName } from '@/components/StoreSheet';
import { PillButton, PrimaryButton } from '@/components/UI';
import { ListGroup, ListRow } from '@/components/ListRow';
import { StatusBand } from '@/components/BrandHeader';
import { StoreCard } from '@/components/StoreCard';
import { BandWatermark, ClubPass } from '@/components/ClubPass';
import { colors, fonts, type } from '@/config/theme';
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
  const { selected, canChoose } = useStores();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
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
    {(canChoose || !selected) && <Pressable onPress={() => setStoreSheet(true)} accessibilityRole="button" style={styles.storeChange}>
      {({ hovered }: WebState) => <Text style={[styles.link, hovered && { textDecorationLine: 'underline' }]}>{selected ? 'Cambia negozio' : 'Scegli il negozio'}</Text>}
    </Pressable>}
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
      <Row icon="user" title="Dati personali" subtitle={[name, profile.data?.phone].filter(Boolean).join(' · ') || 'Nome e telefono'} onPress={() => go('/account/edit')} />
      <Row icon="shield" title="Password" subtitle="Imposta o cambia la password di accesso" onPress={() => go('/account/password')} last />
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

  // Phone (design D): green band with the person, cards on the light ground.
  const card = (children: React.ReactNode, onPress?: () => void, label?: string, extra?: object) => onPress
    ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.pCard, extra, pressed && { opacity: 0.8 }]}>{children}</Pressable>
    : <View style={[styles.pCard, extra]}>{children}</View>;
  const tile = (icon: IconName, label: string, onPress: () => void, count?: number, tone?: 'red') =>
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count}` : label}
      style={({ pressed }) => [styles.pTile, pressed && { opacity: 0.8 }]}>
      <View style={styles.pCircle}>
        <Icon name={icon} size={21} color={tone === 'red' ? colors.sale : colors.green} strokeWidth={1.9} />
        {!!count && <View style={[styles.pCount, tone === 'red' && { backgroundColor: colors.sale }]}><Text style={styles.pCountText}>{count}</Text></View>}
      </View>
      <Text style={styles.pTileText}>{label}</Text>
    </Pressable>;
  const row = (icon: IconName, title: string, onPress: () => void, subtitle?: string, last?: boolean) =>
    <Pressable key={title} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.pRow, !last && styles.rowLine, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={20} strokeWidth={1.9} color={colors.green} />
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.pRowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>}</View>
      <Icon name="chevron" size={16} color={colors.faint} strokeWidth={2} />
    </Pressable>;

  // Phone (design F, F-Profilo): the person on the awning, the active order hanging from it, three shortcuts,
  // the store, the Club, then plain grouped lists.
  if (!wide) {
    const card = profile.data?.member_card_number ?? null;
    const first = name.split(' ')[0];
    const since = member ? new Date(profile.data!.club_member_since!).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    // The hanging card: the member's own card, or the next step towards it.
    const pass = !user ? { title: 'La tua tessera,\nsempre in tasca.', action: 'Accedi o registrati', onPress: () => go('/auth/sign-in') }
      : card ? { name: name || undefined, card }
      : member ? { name: name || undefined, title: 'Collega la tessera\ndel negozio.', action: 'Collega la tessera', onPress: () => go('/club') }
      : club.enabled ? { name: name || undefined, title: 'Prezzi Soci su tutto\nil catalogo.', action: 'Iscriviti gratis', onPress: () => go('/club') }
      : null;
    const hint = !user ? 'Hai già la tessera del negozio? La colleghi dopo l’accesso.' : card ? 'Mostrala alla cassa: tocca per ingrandire.' : '';
    const live = (orders.data ?? []).filter((o) => ACTIVE.has(o.status)).length;
    return <Screen header={<StatusBand />} ground={colors.page} contentContainerStyle={{ padding: 0, paddingBottom: 28 }}
      top={<View style={[styles.gZone, !pass && { paddingBottom: 30 }]}>
        <BandWatermark top={0} />
        <View style={styles.gTop}>
          <Text style={styles.gKicker}>PROFILO</Text>
          {user && <PillButton onDark title="Modifica" accessibilityLabel="Modifica dati personali" onPress={() => go('/account/edit')} />}
        </View>
        <Text style={styles.gName} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">{user ? first || 'Ciao!' : 'Benvenuto'}</Text>
        <Text style={styles.gSub} numberOfLines={1}>{!user ? 'Accedi con la tua email, niente password.' : member ? `Socio Casa & Te dal ${since}` : user.email}</Text>
      </View>}>
      <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
      <View style={{ paddingHorizontal: 22 }}>
        {pass && <ClubPass {...pass} style={{ marginTop: -96 }} />}
        {!!hint && <Text style={styles.gHint}>{hint}</Text>}
        {/* One list for everything (plan §5.6); the order in progress is on Home, here only counted. */}
        <ListGroup style={{ marginTop: 16 }}>
          {user && <ListRow first title="Ordini" detail={live ? `${live} in corso` : orderCount ? String(orderCount) : undefined} onPress={() => go('/orders')} />}
          <ListRow first={!user} title="Preferiti" detail={favourites ? String(favourites) : undefined} onPress={() => go('/favorites')} />
          {user && <ListRow title="Indirizzi" onPress={() => go('/account/addresses')} />}
          <ListRow title="Il tuo negozio" detail={selected ? storeName : 'Scegli'} onPress={canChoose || !selected ? () => setStoreSheet(true) : undefined} />
        </ListGroup>
        {user && <ListGroup title="Account">
          <ListRow first title="Dati personali" subtitle={[name, profile.data?.phone].filter(Boolean).join(' · ') || 'Nome e telefono'} onPress={() => go('/account/edit')} />
          <ListRow title="Password" subtitle="Imposta o cambia la password" onPress={() => go('/account/password')} />
        </ListGroup>}
        <ListGroup title="Assistenza e informazioni">
          <ListRow first title="Spedizioni e ritiro" subtitle="Tariffe, tempi e ritiro in negozio" onPress={() => go('/legal/shipping')} />
          <ListRow title="Condizioni di vendita e resi" onPress={() => go('/legal/terms')} />
          <ListRow title="Informativa privacy" onPress={() => go('/legal/privacy')} />
        </ListGroup>
        {user && <View style={styles.fSession}>
          <Pressable onPress={() => supabase.auth.signOut()} accessibilityRole="button" hitSlop={8}><Text style={styles.fOutText}>Esci dall’account</Text></Pressable>
          <Pressable onPress={() => go('/account/delete')} accessibilityRole="link" hitSlop={6}><Text style={styles.fDelete}>Elimina account</Text></Pressable>
        </View>}
        <Text style={styles.fVersion}>Casa & Te · Versione {Constants.expoConfig?.version ?? '1.0.0'} · Pagamenti gestiti da Stripe</Text>
      </View>
    </Screen>;
  }

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

const CLUB_CARD = require('../../../assets/club-card.webp');

const styles = StyleSheet.create({
  // Profilo (November 2026): the green zone with the monogram texture, the first name in large type, the member's card hanging.
  gZone: { backgroundColor: colors.band, paddingTop: 10, paddingHorizontal: 22, paddingBottom: 122, overflow: 'hidden' },
  gTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  gKicker: { fontSize: 13, letterSpacing: 1.8, fontFamily: fonts.sansSemiBold, color: colors.bandMuted },
  gName: { ...type.display, color: colors.bandText, marginTop: 16 },
  gSub: { ...type.body, color: colors.bandMuted, marginTop: 4 },
  gHint: { ...type.small, color: colors.muted, textAlign: 'center', marginTop: 12 }, // ui-check: allow (live dot halo)
  // Green band at the top (as on every page), a white card hanging from its edge (as the store card on Home).
  fHero: { backgroundColor: colors.band, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 58 },
  fAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.signInk, alignItems: 'center', justifyContent: 'center' },
  fAvatarText: { fontSize: 20, fontFamily: fonts.heavy, color: colors.band },
  fHello: { fontSize: 28, lineHeight: 33, fontFamily: fonts.display, color: colors.bandText, letterSpacing: -0.5 },
  fEmail: { fontSize: 14, lineHeight: 19, fontFamily: fonts.sans, color: colors.bandMuted, marginTop: 3 },
  fCard: { marginTop: -40, padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line,
    shadowColor: '#143019', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  fCardTitle: { fontSize: 16, fontFamily: fonts.sansBold, color: colors.text },
  fBtn: { flex: 1, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  fBtnPrimary: { backgroundColor: colors.green, borderColor: colors.green },
  fBtnText: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  fStats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
  fStat: { flex: 1, alignItems: 'center', gap: 2, minHeight: 50, justifyContent: 'center' },
  fStatValue: { fontSize: 22, lineHeight: 26, fontFamily: fonts.heavy, color: colors.text },
  fStatLabel: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  fStatRule: { width: 1, height: 34, backgroundColor: colors.line },
  // The Club with its real card, a white plate like the rest.
  fClub: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, padding: 14, borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.line },
  fClubCard: { width: 64, height: 40, borderRadius: 4 },
  fClubTitle: { fontSize: 16, lineHeight: 21, fontFamily: fonts.sansBold, color: colors.text },
  fClubText: { fontSize: 13, lineHeight: 17, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  fSession: { alignItems: 'center', gap: 14, marginTop: 32 },
  fOutText: { ...type.body, fontFamily: fonts.sansMedium, color: colors.muted },
  fDelete: { ...type.small, fontFamily: fonts.sansSemiBold, color: colors.danger },
  fVersion: { ...type.small, fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: 24 },
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

  activeOrder: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 16, marginTop: 22 },
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
  rowOn: { backgroundColor: '#F7F7F5' },
  rowTitle: { fontSize: 15.5, color: colors.text, fontFamily: fonts.sans },
  rowSub: { fontSize: 12.5, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },

  session: { marginTop: 36, alignItems: 'center', gap: 16 },
  pHero: { backgroundColor: colors.band, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 26, overflow: 'hidden' },
  pWatermark: { position: 'absolute', right: -40, top: 10, width: 200, height: 112, opacity: 0.22 },
  pAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  pAvatarText: { fontSize: 22, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text },
  pHello: { fontSize: 28, lineHeight: 33, fontFamily: fonts.display, color: colors.bandText, letterSpacing: -0.5 },
  pEmail: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.bandMuted, marginTop: 2 },
  pEdit: { height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.bandButton, justifyContent: 'center' },
  pEditText: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.bandText },
  pMember: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.18)' },
  pMemberText: { fontSize: 13, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.yellow },
  pSignIn: { alignSelf: 'flex-start', height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.yellow, justifyContent: 'center', marginTop: 14 },
  pSignInText: { fontSize: 15.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  pCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  pFloat: { backgroundColor: colors.yellow, shadowColor: '#18201A', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  pFollow: { height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.text, justifyContent: 'center' },
  pFollowText: { fontSize: 13.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  pDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, borderWidth: 6, borderColor: colors.well, marginHorizontal: 2 },
  pStrong: { fontSize: 16, fontFamily: fonts.heavy, fontWeight: '800', color: colors.text, marginTop: 1 },
  pLink: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.green },
  pTile: { flex: 1, alignItems: 'flex-start', gap: 8, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  // The icon alone, no tinted circle behind it (design H); the box keeps room for the count.
  pCircle: { width: 28, height: 28, alignItems: 'flex-start', justifyContent: 'center' },
  pCount: { position: 'absolute', top: -4, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  pCountText: { fontSize: 11, fontFamily: fonts.heavy, fontWeight: '800', color: '#FFFFFF' },
  pTileText: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  pClub: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: '#F5E6C8' },
  pClubTitle: { fontSize: 18, lineHeight: 23, fontFamily: fonts.display, color: '#3D2A06' },
  pClubText: { fontSize: 13, lineHeight: 17, fontFamily: fonts.sansMedium, color: '#3D2A06', marginTop: 1 },
  pGroup: { fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: fonts.heavy, color: colors.muted, marginTop: 12, marginLeft: 4 },
  pList: { borderRadius: 18, backgroundColor: '#FFFFFF', paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 10 },
  pRowTitle: { fontSize: 15.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  signOut: { alignSelf: 'stretch', height: 52, borderWidth: 1.5, borderColor: colors.line, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 15, color: colors.text, fontFamily: fonts.sansBold, fontWeight: '700' },
  delete: { fontSize: 14, color: colors.danger, fontFamily: fonts.sansBold },
  footer: { marginTop: 36, textAlign: 'center', fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
});
