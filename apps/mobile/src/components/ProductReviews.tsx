import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { friendlyError } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { fetchReviewEligibility, fetchReviews, submitReview } from '@/lib/api';
import { invalidate, useQuery } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { Stars, StarInput } from './Stars';
import { Notice, PrimaryButton } from './UI';

/** Reviews from verified buyers, and the form to write or edit one's own. */
export function ProductReviews({ productId, average, count, onChanged }: { productId: string; average: number | null; count: number; onChanged: () => void }) {
  const user = useUser();
  const reviews = useQuery(`reviews:${productId}`, () => fetchReviews(productId));
  const eligibility = useQuery(user ? `review-eligibility:${productId}:${user.id}` : null, () => fetchReviewEligibility(productId));
  const mine = eligibility.data?.review ?? null;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { if (mine) { setRating(mine.rating); setComment(mine.comment ?? ''); } }, [mine]);

  const send = async () => {
    if (!rating) { setMessage({ tone: 'error', text: 'Scegli da 1 a 5 stelle.' }); return; }
    setBusy(true); setMessage(null);
    try {
      await submitReview(productId, rating, comment.trim());
      setOpen(false);
      setMessage({ tone: 'success', text: 'Grazie! La tua recensione è pubblicata.' });
      invalidate(`reviews:${productId}`); void eligibility.refetch(); onChanged();
    } catch (e) {
      setMessage({ tone: 'error', text: friendlyError(e) });
    } finally { setBusy(false); }
  };

  const list = reviews.data ?? [];
  const visible = showAll ? list : list.slice(0, 3);
  return <View style={styles.wrap} nativeID="recensioni">
    <View style={styles.head}>
      <Text style={styles.title} accessibilityRole="header">Recensioni</Text>
      {count > 0 && average !== null && <View style={styles.summary}>
        <Stars value={average} size={15} /><Text style={styles.summaryText}>{average.toLocaleString('it-IT', { minimumFractionDigits: 1 })} · {count}</Text>
      </View>}
    </View>
    {!list.length && !reviews.loading && <Text style={styles.empty}>Ancora nessuna recensione. Le recensioni sono scritte solo da chi ha acquistato il prodotto.</Text>}
    {visible.map((r) => <View key={r.id} style={styles.review}>
      <View style={styles.reviewHead}><Stars value={r.rating} size={13} />
        <Text style={styles.author}>{r.author_name} · {new Date(r.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</Text></View>
      {!!r.comment && <Text style={styles.comment}>{r.comment}</Text>}
      <Text style={styles.verified}>Acquisto verificato</Text>
    </View>)}
    {list.length > 3 && !showAll && <Pressable onPress={() => setShowAll(true)} accessibilityRole="button" style={{ paddingVertical: 8 }}>
      <Text style={styles.link}>Mostra tutte le {list.length} recensioni</Text></Pressable>}

    {message && <Notice tone={message.tone} message={message.text} />}
    {!user ? <Pressable onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: `/product/${productId}` } })} accessibilityRole="link" style={{ paddingVertical: 8 }}>
      <Text style={styles.link}>Hai acquistato questo prodotto? Accedi per recensirlo</Text></Pressable>
      : eligibility.data?.eligible ? (open
        ? <View style={styles.form}>
            <Text style={styles.formTitle}>{mine ? 'Modifica la tua recensione' : 'La tua recensione'}</Text>
            <StarInput value={rating} onChange={setRating} />
            <TextInput value={comment} onChangeText={setComment} placeholder="Racconta com'è il prodotto (facoltativo)" placeholderTextColor={colors.faint}
              multiline maxLength={2000} accessibilityLabel="Commento" style={styles.input} />
            <PrimaryButton title={mine ? 'Aggiorna recensione' : 'Pubblica recensione'} onPress={send} loading={busy} />
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}><Text style={styles.link}>Annulla</Text></Pressable>
          </View>
        : <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.write}>
            <Text style={styles.writeText}>{mine ? 'Modifica la tua recensione' : 'Scrivi una recensione'}</Text></Pressable>)
      : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 26, paddingTop: 20, borderTopWidth: 1, borderColor: colors.line, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 20, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryText: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  empty: { fontSize: 14, lineHeight: 20, color: colors.muted, fontFamily: fonts.sans },
  review: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, gap: 6 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  author: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
  comment: { fontSize: 14, lineHeight: 21, color: colors.text, fontFamily: fonts.sans },
  verified: { fontSize: 11, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500' },
  link: { fontSize: 14, color: colors.green, textDecorationLine: 'underline', fontFamily: fonts.sansMedium },
  write: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.text, borderRadius: 999, paddingHorizontal: 18, minHeight: 42, justifyContent: 'center' },
  writeText: { fontSize: 14, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  form: { gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 16 },
  formTitle: { fontSize: 17, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  input: { minHeight: 96, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, fontSize: 15, color: colors.text, textAlignVertical: 'top', fontFamily: fonts.sans },
});
