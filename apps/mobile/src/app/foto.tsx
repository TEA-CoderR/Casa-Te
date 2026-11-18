// "Fotografa un prodotto" (plan v3 X3, step 1): the camera opens at once; the text on the pack is read on the phone
// (lib/labelReader) and only that text is matched against the catalogue (match_label_text). One clear match opens
// the product; a few are listed; none offers another photo or a search by hand. The photo never leaves the phone.
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@/components/Screen';
import { BrandHeader, HeaderBack, StatusBand } from '@/components/BrandHeader';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, Loading, Notice, PrimaryButton, SecondaryButton } from '@/components/UI';
import { colors, fonts, radius, type } from '@/config/theme';
import { matchLabelText, type CatalogProduct } from '@/lib/api';
import { canReadLabels, readLabel, searchHint } from '@/lib/labelReader';
import { useStores } from '@/lib/hooks';

type State =
  | { step: 'camera' }
  | { step: 'reading'; uri: string }
  | { step: 'results'; uri: string; items: CatalogProduct[] }
  | { step: 'none'; uri: string; hint: string }
  | { step: 'denied' }
  | { step: 'error' };

export default function PhotoSearchScreen() {
  const { selected } = useStores();
  const [state, setState] = useState<State>({ step: 'camera' });
  const run = useRef(0);
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const searchByHand = (q: string) => router.replace({ pathname: '/catalog', params: { search: '1', q, offerte: '', evidenza: '', category: '' } });

  const find = async (uri: string) => {
    const mine = ++run.current;
    setState({ step: 'reading', uri });
    try {
      const lines = await readLabel(uri);
      const text = lines.join('\n').trim();
      const found = text ? await matchLabelText(text, selected?.id ?? null) : { items: [], sure: false };
      if (mine !== run.current) return;
      if (found.sure && found.items[0]) return router.replace(`/product/${found.items[0].id}`);
      setState(found.items.length ? { step: 'results', uri, items: found.items } : { step: 'none', uri, hint: searchHint(lines) });
    } catch {
      if (mine === run.current) setState({ step: 'error' });
    }
  };

  const shoot = async (first = false) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setState({ step: 'denied' });
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) { if (first) back(); return; }
    find(res.assets[0].uri);
  };
  const gallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) find(res.assets[0].uri);
  };

  // The camera is the page: it opens straight away (cancelling it goes back to where the customer was).
  useEffect(() => { if (canReadLabels) shoot(true); else setState({ step: 'error' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const again = <View style={styles.actions}>
    <PrimaryButton title="Scatta un’altra foto" onPress={() => shoot()} />
    <SecondaryButton title="Scegli dalla galleria" onPress={gallery} />
  </View>;
  const photo = 'uri' in state ? <Image source={{ uri: state.uri }} style={styles.photo} accessibilityLabel="La tua foto" /> : null;

  return <Screen stack header={<StatusBand />} ground={colors.page} contentContainerStyle={{ padding: 0, paddingBottom: 32 }}
    top={<BrandHeader inScroll title="Fotografa un prodotto" left={<HeaderBack onPress={back} />} />} bodyStyle={{ paddingHorizontal: 16 }}>
    <Stack.Screen options={{ headerShown: false, title: 'Fotografa un prodotto' }} />
    {state.step === 'camera' ? <Loading label="Apertura della fotocamera…" />
      : state.step === 'reading' ? <View style={styles.reading}>{photo}<Loading label="Sto leggendo la confezione…" /></View>
      : state.step === 'results' ? <View style={{ paddingTop: 20 }}>
          <View style={styles.head}>{photo}<View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">Forse cercavi</Text>
            <Text style={styles.sub}>Prodotti con il nome che abbiamo letto sulla confezione.</Text>
          </View></View>
          <View style={styles.list}>{state.items.map((p) => <ProductCard key={p.id} product={p} variant="list" />)}</View>
          {again}
        </View>
      : state.step === 'none' ? <EmptyState icon="camera" title="Non l’abbiamo trovato"
          message="Inquadra il nome sul fronte della confezione, da vicino e con buona luce. Oppure cercalo per nome.">
          <PrimaryButton title="Scatta un’altra foto" onPress={() => shoot()} />
          <SecondaryButton title={state.hint ? `Cerca “${state.hint}”` : 'Cerca per nome'} onPress={() => searchByHand(state.hint)} />
        </EmptyState>
      : state.step === 'denied' ? <EmptyState icon="camera" title="Serve la fotocamera"
          message="Consenti a Casa & Te di usare la fotocamera nelle impostazioni del telefono, oppure scegli una foto dalla galleria.">
          <PrimaryButton title="Apri le impostazioni" onPress={() => Linking.openSettings()} />
          <SecondaryButton title="Scegli dalla galleria" onPress={gallery} />
        </EmptyState>
      : <View style={{ paddingTop: 20, gap: 12 }}>
          <Notice tone="error" title="Non siamo riusciti a leggere la foto" message="Controlla la connessione e riprova, oppure cerca il prodotto per nome." />
          {canReadLabels && again}
          <SecondaryButton title="Cerca per nome" onPress={() => searchByHand('')} />
        </View>}
  </Screen>;
}

const styles = StyleSheet.create({
  reading: { paddingTop: 32, alignItems: 'center', gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  photo: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.line },
  title: { ...type.section, fontFamily: fonts.display, color: colors.text },
  sub: { ...type.small, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  list: { gap: 8 },
  actions: { gap: 12, marginTop: 24 },
});
