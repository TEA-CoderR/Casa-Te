// "Domande frequenti" (plan v3 X8): how the shop works, in the customer's words. Every answer states what the app
// and the database actually do (pickup slots, pay in store, 14 days to collect, returns, safety stock); the
// minimum order and the WhatsApp number come from the back office. Contacts at the bottom.
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatEuro, RETURN_GUARANTEE_DAYS, RETURN_WINDOW_DAYS } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Icon } from '@/components/Icon';
import { colors, fonts, type } from '@/config/theme';
import { useClubSettings, useCompanies } from '@/lib/hooks';
import { canReadLabels } from '@/lib/labelReader';

type QA = { q: string; a: string };

function questions(minOrderCents: number): QA[] {
  return [
    { q: 'Come funziona il ritiro in negozio?',
      a: 'Scegli il negozio e un orario di ritiro di un’ora, da oggi a dopodomani (il primo è almeno due ore dopo l’ordine). Prepariamo l’ordine e ti scriviamo quando è pronto. Alla cassa mostra il numero d’ordine o il codice nell’app.' },
    { q: 'Quanto tempo ho per ritirare?',
      a: 'L’ordine resta in negozio per 14 giorni da quando è pronto. La data esatta è nell’email “pronto per il ritiro” e nella pagina dell’ordine.' },
    { q: 'Come posso pagare?',
      a: 'Online con carta o portafoglio digitale, sulla pagina sicura di Stripe. Oppure in negozio quando ritiri, in contanti o con carta.' },
    ...(minOrderCents > 0 ? [{ q: 'C’è un ordine minimo?',
      a: `Sì, ${formatEuro(minOrderCents)} di prodotti, calcolati dopo Prezzi Soci e codici sconto. Il carrello ti dice quanto manca.` }] : []),
    { q: 'Posso annullare un ordine?',
      a: 'Se paghi in negozio, puoi annullarlo dalla pagina dell’ordine finché il negozio non ha iniziato a prepararlo. Se hai già pagato online, contatta il negozio: penserà lui al rimborso.' },
    { q: 'Come funzionano i Prezzi Soci?',
      a: 'L’iscrizione al Casa & Te Club è gratuita. Da socio vedi e paghi i Prezzi Soci (l’etichetta rossa “Prezzo Soci”) online e, con la tessera digitale dell’app, alla cassa.' },
    { q: 'Come faccio un reso?',
      a: `Dalla pagina dell’ordine tocca “Reso e assistenza”. Per un ripensamento hai ${RETURN_WINDOW_DAYS} giorni dal ritiro; per un prodotto difettoso vale la garanzia di ${Math.round(RETURN_GUARANTEE_DAYS / 365)} anni. Quando il negozio approva, porti gli articoli in negozio e scegli rimborso o buono.` },
    { q: 'Perché un prodotto risulta non disponibile?',
      a: 'La disponibilità è quella del negozio che hai scelto. Gli ultimi pezzi sullo scaffale restano per chi compra in negozio: prova a scegliere un altro negozio o torna più tardi.' },
    ...(canReadLabels ? [{ q: 'Come funziona “Fotografa un prodotto”?',
      a: 'Tocca la fotocamera accanto alla ricerca e inquadra il nome sulla confezione. Il testo viene letto sul telefono: la foto non viene inviata né salvata.' }] : []),
  ];
}

export default function HelpScreen() {
  const { minOrderCents, whatsapp } = useClubSettings();
  const { companies } = useCompanies();
  const [open, setOpen] = useState<number | null>(null);
  const email = companies.find((c) => c.is_operator)?.email ?? null;
  const items = questions(minOrderCents);
  const openUrl = (url: string) => Platform.OS === 'web' && typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener') : Linking.openURL(url);

  return <Screen stack maxWidth={760}>
    <Stack.Screen options={{ title: 'Domande frequenti' }} />
    <View style={styles.list}>
      {items.map((it, i) => {
        const on = open === i;
        return <View key={it.q} style={[styles.item, i > 0 && styles.divider]}>
          <Pressable onPress={() => setOpen(on ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: on }} style={styles.question}>
            <Text style={styles.qText}>{it.q}</Text>
            <View style={on && { transform: [{ rotate: '180deg' }] }}><Icon name="down" size={18} color={colors.muted} strokeWidth={2.2} /></View>
          </Pressable>
          {on && <Text style={styles.answer} selectable>{it.a}</Text>}
        </View>;
      })}
    </View>
    {(whatsapp || email) && <ListGroup title="Contattaci">
      {!!whatsapp && <ListRow first icon="phone" title="Scrivici su WhatsApp" subtitle={whatsapp.replace(/^\+39/, '+39 ')}
        onPress={() => openUrl(`https://wa.me/${whatsapp.replace(/\D/g, '')}`)} />}
      {!!email && <ListRow first={!whatsapp} icon="mail" title="Scrivici un’email" subtitle={email} onPress={() => openUrl(`mailto:${email}`)} />}
    </ListGroup>}
    <ListGroup title="Informazioni">
      <ListRow first title="Spedizioni e ritiro" onPress={() => router.push('/legal/shipping')} />
      <ListRow title="Condizioni di vendita e resi" onPress={() => router.push('/legal/terms')} />
    </ListGroup>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.page },
  item: { paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderColor: colors.line },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12 },
  qText: { ...type.body, flex: 1, fontFamily: fonts.sansSemiBold, color: colors.text },
  answer: { ...type.body, fontFamily: fonts.sans, color: colors.muted, paddingBottom: 16 },
});
