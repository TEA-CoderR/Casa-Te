# Product names: format cleanup — proposal for the owner (18/11/2026)

Dry run on the test database (nothing changed): **1,302 of 11,494** active products would change.
Only the format changes; the ERP text stays in `erp_name`, so every name can be restored.

## 1. Measurements (846 names)
`x` or `*` between numbers becomes `×`. "cm" is added **only** when the name already said cm
(as "Cm." in front or "cm" after); names without a unit keep no unit (it could be mm). A final "h" (height) is dropped
when the unit is cm.

| Prima | Dopo |
|---|---|
| Panca Pieghevole Cm. 180x28x44h | Panca Pieghevole 180×28×44 cm |
| Barbecue rettangolare Cm. 58x38x82h C/Ripiano | Barbecue rettangolare 58×38×82 cm C/Ripiano |
| P/Bottiglia Classic cm 9x9x38h assortiti | P/Bottiglia Classic 9×9×38 cm assortiti |
| Set 3 Lampadine Solari Dia. Cm. 6x9h | Set 3 Lampadine Solari Dia. 6×9 cm |
| Plaid Gently 125x150 cm assortiti | Plaid Gently 125×150 cm assortiti |
| Portascarpe a 12 Scomparti Peva Tnt Pe 76x60x15 Ella Bei | Portascarpe a 12 Scomparti Peva Tnt Pe 76×60×15 Ella Bei |
| Piscina Mini Frame Blu 122x122x30 cm I.3 | Piscina Mini Frame Blu 122×122×30 cm I.3 |

Not touched: pack counts like "Fazzoletti 6X9", "Felix 4X85", sizes in mm ("45x16x9 mm").

## 2. Supplier codes at the end (616 names)
Removed only when the code is clearly not part of the product:
- capital letter(s) + at least three digits ("C1913", "C12T6", "C0244", "4PZ374");
- codes with a hyphen ("Yd-19803-A", "Jh-5155");
- a number or code **right after "cm"** ("Padella 22 cm 9908", "Mobile 3 Cas 30×24×61 cm Qb12485c").

| Prima | Dopo |
|---|---|
| Ace Gentile 2,3 l PROF.LAVAND.MUSCH.C1913 | Ace Gentile 2,3 l PROF.LAVAND.MUSCH. |
| Last Piatti 950 ml Limone C0006 | Last Piatti 950 ml Limone |
| Venus Ig. intima 200 ml Lenitivo C1365 | Venus Ig. intima 200 ml Lenitivo |
| Cuoca Stone Padella 22 cm 9908 | Cuoca Stone Padella 22 cm |
| Grangusto Coppa Insalata 19 cm 67119 | Grangusto Coppa Insalata 19 cm |
| Pouf Tdo L. Grig. 28*27 cm Yd-19803-A | Pouf Tdo L. Grig. 28×27 cm |
| Quadro Buddha Ass 45*45*1,8 cm 19gt01 | Quadro Buddha Ass 45×45×1,8 cm |

Kept on purpose: shade numbers ("Lipstick 0024", "Pencil 0003"), weights and model numbers not after "cm"
("Crocchette … 4000", "Conta Banconote 5300", "Lego … 60479"), codes containing a size ("ROT120X700CMBLU").

## 3. A number glued to a word (41 names)
A space between a word of 4+ letters and the number after it.

| Prima | Dopo |
|---|---|
| Sedile Wc Selnova3 Polytech Bianco | Sedile Wc Selnova 3 Polytech Bianco |
| Diamond Set 4 Bicchieri Vetro Acqua280 ml | Diamond Set 4 Bicchieri Vetro Acqua 280 ml |
| Giocomissile30 cm C/Fischio | Giocomissile 30 cm C/Fischio |
| Casettaavventura112x112x94 cm | Casettaavventura 112×112×94 cm |

Kept: "Allin1", "Tuttoin1", "4in1".

## Not in this proposal
Abbreviations ("Ig.", "Prof.", "Lav.") stay as they are: expanding them means guessing the meaning.
Product names edited by hand in the back office are not touched.
