import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Screen } from '@/components/Screen';
import { StoreSelector } from '@/components/StoreSelector';
import { ListRow, PageTitle, PrimaryButton, SectionTitle } from '@/components/UI';
import { colors } from '@/config/theme';
import { fetchProfile, updateProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@/lib/useQuery';
import { usePreferences } from '@/store/preferences';
import { useUser } from '@/store/session';
import { useEffect } from 'react';

export default function ProfileScreen() {
  const user = useUser();
  const storeId = usePreferences((s) => s.storeId);
  const profile = useQuery(user ? `profile:${user.id}` : null, () => fetchProfile(user!.id));

  // Keep the preferred store in the profile (used for marketing/analytics and on other devices).
  useEffect(() => {
    if (user && profile.data && storeId && profile.data.preferred_store_id !== storeId) {
      updateProfile(user.id, { preferred_store_id: storeId }).catch(() => {});
    }
  }, [user, profile.data, storeId]);

  return <Screen>
    <PageTitle title="Profilo" subtitle={user ? (profile.data?.full_name || user.email) : 'Accedi per ordini, indirizzi e fatture.'} />
    {!user && <PrimaryButton title="Accedi o registrati" icon="user" onPress={() => router.push('/auth/sign-in')} />}

    <StoreSelector />

    {user && <>
      <SectionTitle>Il mio account</SectionTitle>
      <ListRow icon="user" title="Dati personali" subtitle={user.email} onPress={() => router.push('/account/edit')} />
      <ListRow icon="pin" title="Indirizzi di consegna" onPress={() => router.push('/account/addresses')} />
      <ListRow icon="box" title="I miei ordini" onPress={() => router.push('/orders')} />
    </>}
    <ListRow icon="crown" title="Casa & Te Club" subtitle={profile.data?.club_member_since ? 'Sei membro · vedi le tue offerte' : 'Vantaggi e offerte dedicate'} onPress={() => router.push('/club')} />
    <ListRow icon="heart" title="Preferiti" onPress={() => router.push('/favorites')} />

    <SectionTitle>Informazioni</SectionTitle>
    <ListRow icon="truck" title="Spedizioni e ritiro" subtitle="Tariffe, tempi e ritiro in negozio" onPress={() => router.push('/legal/shipping')} />
    <ListRow icon="shield" title="Condizioni di vendita e resi" onPress={() => router.push('/legal/terms')} />
    <ListRow icon="help" title="Informativa privacy" onPress={() => router.push('/legal/privacy')} />

    {user && <>
      <SectionTitle>Sessione</SectionTitle>
      <ListRow icon="arrow" title="Esci" onPress={() => supabase.auth.signOut()} />
      <ListRow icon="close" title="Elimina account" danger onPress={() => router.push('/account/delete')} />
    </>}
    <View style={{ marginTop: 28, alignItems: 'center' }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>CASA & TE · versione {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </View>
  </Screen>;
}
