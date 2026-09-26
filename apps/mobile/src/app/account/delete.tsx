import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { friendlyError } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { Notice, PrimaryButton, SecondaryButton, TextField } from '@/components/UI';
import { colors } from '@/config/theme';
import { deleteAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function DeleteAccountScreen() {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true); setError('');
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      router.replace('/');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  return <Screen stack maxWidth={560}>
    <Notice tone="error" title="Eliminazione definitiva"
      message="Elimineremo il tuo profilo, gli indirizzi salvati e l'accesso. Gli ordini già effettuati vengono conservati in forma non collegata al profilo per gli obblighi fiscali di legge." />
    <Text style={{ fontSize: 13, color: colors.text, marginVertical: 12, lineHeight: 20 }}>Per confermare scrivi ELIMINA qui sotto.</Text>
    <TextField label="Conferma" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
    {!!error && <Notice tone="error" message={error} />}
    <PrimaryButton title="Elimina il mio account" icon="close" loading={busy} disabled={confirm.trim() !== 'ELIMINA'} onPress={run} />
    <SecondaryButton title="Annulla" onPress={() => router.back()} />
  </Screen>;
}
