---
name: Casa & Te
description: Web shop and customer app of CASA & TE, everyday household goods with design sense, tied to five local stores.
colors:
  forest: "#1F4A33"
  forest-deep: "#163826"
  sale-red: "#D62828"
  heart-red: "#B3261E"
  danger: "#A62F2F"
  ink: "#1B2620"
  muted: "#5E625A"
  faint: "#686C64"
  paper: "#FFFFFF"
  stone: "#F4EFE6"
  sand: "#F6EEDF"
  cream: "#F3E9D6"
  rule: "#E4DCCD"
  line: "#ECE6DB"
typography:
  wordmark:
    fontFamily: "Bodoni Moda, Georgia, serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: "46px"
    letterSpacing: "-0.4px"
  display:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "92px"
    fontWeight: 400
    lineHeight: "90px"
    letterSpacing: "-2px"
  headline:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "56px"
    fontWeight: 400
    lineHeight: "58px"
    letterSpacing: "-1px"
  headline-phone:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "31px"
    fontWeight: 400
    lineHeight: "37px"
    letterSpacing: "-0.2px"
  title:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: "23px"
  price:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "18.5px"
    fontWeight: 500
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    letterSpacing: "0.3px"
  label-caps:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    letterSpacing: "1px"
rounded:
  print: "4px"
  hairline: "2px"
  badge: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  grid: "28px"
  gutter: "40px"
  section: "112px"
components:
  button-primary-desktop:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.print}"
    height: "50px"
    padding: "13px 24px"
  button-primary-phone:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "50px"
    padding: "13px 24px"
  button-secondary-desktop:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.forest}"
    rounded: "{rounded.print}"
    height: "48px"
    padding: "0 20px"
  button-cover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.forest}"
    rounded: "{rounded.hairline}"
    height: "52px"
    padding: "0 28px"
  button-add-to-cart:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    size: "34px"
  badge-discount:
    backgroundColor: "{colors.sale-red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.badge}"
    padding: "3px 8px"
  product-plate:
    backgroundColor: "{colors.stone}"
    rounded: "{rounded.print}"
  product-card-phone:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sm}"
  input-phone:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "50px"
    padding: "0 14px"
  search-desktop:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "40px"
    width: "300px"
  filter-chip-phone:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 12px"
  filter-chip-desktop:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.print}"
    height: "36px"
    padding: "0 12px"
  pickup-band:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
---

# Design System: Casa & Te

## Overview

**Creative North Star: "The Printed Home Catalogue"**

Casa & Te is one system with two registers sharing a single token set (`src/config/theme.ts`). Below 900 px the phone register is the incumbent app: soft and touch-friendly, with pills, gently rounded cards, circular department icons and a bottom tab bar. At 900 px and wider (`useLayout().wide`) the desktop register reads like the chain's printed home catalogue: a cover, a row of department photo tiles, then product spreads set on white paper, with warm stone plates behind every photograph, hairline print rules between rows, square-cut 4 px corners and no shadows on content.

Both registers speak the same material language: white paper ground, warm stone neutrals, deep forest green as the one committed colour for actions and the store-pickup band, EB Garamond for names, titles and prices, Hanken Grotesk small for UI and figures, and the Bodoni Moda wordmark. The positioning is affordable everyday goods with design sense, so the system stays warm and elevated without turning exclusive: plain prices, honest per-store availability, photography before decoration. The single loud exception is the discount, which is a solid red badge and a red sale price on both registers by owner requirement.

**Key Characteristics:**
- White paper ground; warm stone (#F4EFE6 family) plates behind photographs, never behind text-only content on desktop.
- Forest green is the only committed field: primary actions, the pickup band, active navigation.
- Serif for what the shopper reads (names, titles, prices); small sans for what the shopper operates (labels, filters, buttons on desktop, figures).
- Desktop: hairline rules (#E4DCCD), 4 px corners, borderless product entries, no content shadows.
- Phone: pills, 10 to 18 px radii, bordered product cards, a soft card shadow on floating elements.
- Discounts are loud red on every surface.

## Colors

A warm, restrained palette: paper white and stone neutrals carry the page, one deep forest green commits, and one hot red is reserved for discounts.

### Primary
- **Forest Green** (forest): primary buttons, add-to-cart squares, cart count badge, active nav underline and link colour, the full-bleed pickup band on the desktop home, "more" links, availability text.
- **Deep Forest** (forest-deep): text on tinted notices (success and info) and hover-dark green on phone.

### Secondary
- **Sale Red** (sale-red): discount badge fill and the sale price. Used for nothing else.

### Tertiary
- **Heart Red** (heart-red): the filled favourite heart only.
- **Danger Red** (danger): errors, out-of-stock notes, invalid field borders, destructive secondary buttons.

### Neutral
- **Ink** (ink): all primary text, the wordmark, the 1 px rule under desktop section heads.
- **Muted Olive Grey** (muted): secondary text, counts, captions, struck-through compare price, breadcrumbs.
- **Faint Olive Grey** (faint): placeholders, inactive tabs and secondary icons (kept at 4.5:1 or better on white).
- **Paper** (paper): page and surface background on both registers.
- **Warm Stone** (stone): photo plates on desktop, the footer (colophon) ground, the "closer" tile, desktop hover fill for header tools.
- **Sand** (sand) and **Cream** (cream): phone-register accent fills (info notices, empty-state and option icon circles, selected view toggle).
- **Print Rule** (rule): desktop hairlines: masthead and nav band borders, footer base rule, breadcrumb separators.
- **Line** (line): phone-register dividers, input and quantity borders, list row separators.

### Named Rules
**The One Committed Field Rule.** Forest green is the only colour that fills large areas (the pickup band) or carries actions. No second accent colour is introduced for decoration.

**The Loud Discount Rule.** A discount always shows as a solid Sale Red badge with white bold sans text plus the price in Sale Red and the compare price struck through in muted grey. It is the one deliberately loud element, on phone and desktop alike, by owner requirement.

**The Plate Rule.** Product photographs sit on a Warm Stone plate (multiply-blended where the image has a white ground), never on bare white or on a bordered box, on desktop.

## Typography

**Wordmark Font:** Bodoni Moda 600 (with Georgia, serif)
**Display / Body-serif Font:** EB Garamond 400 and 500 (with Georgia, "Times New Roman", serif)
**UI Font:** Hanken Grotesk 400 / 500 / 600 (with system-ui, sans-serif)

**Character:** A fine old-style Garamond sets product names, headings and prices with the calm of a printed catalogue; a quiet grotesque handles every operational label at small sizes. Bodoni appears only as the "Casa & Te" wordmark.

### Hierarchy
- **Wordmark** (Bodoni 600, 40/46 desktop masthead, 46/52 in the footer): the brand name only.
- **Display** (Garamond 400, 92/90, -2 px): the home cover line "La bellezza vive con te." on desktop, white on the photograph.
- **Headline** (Garamond 400, 56/58, -1 px): desktop section heads ("Scegli il reparto", "In evidenza"), sitting on a 1 px ink rule. Close relatives: department tile names 26/30, catalogue page title 64/70, product title 48/52, pickup band title 54/58.
- **Headline, phone** (Garamond 400, 31/37): page titles on phone; section titles 24; product title 30/33.
- **Title** (Garamond 400, 19/23 desktop entry, 28/32 feature entry, 15.5/18 phone card): product names.
- **Price** (Garamond 500, 18.5 on cards, 26 feature, 31 phone product page, 36 desktop product page): every displayed amount.
- **Body** (Hanken 400, 15/22; 13.5/21 for descriptions; 17/26 on the pickup band): running UI text.
- **Label** (Hanken 500, 13.5, +0.3 px): desktop nav links, header tools, store line; 600 weight for "more" links and buttons.
- **Label caps** (Hanken 500, 11.5, +1 px, uppercase): brand line above a product name; footer column heads use the same treatment at 12 px, 600, Forest Green.

### Named Rules
**The Read-Serif, Operate-Sans Rule.** If the shopper reads it (name, heading, price), it is Garamond; if the shopper operates it on desktop (button, filter, nav, count), it is Hanken Grotesk. Phone primary buttons are the incumbent exception: their label is Garamond 18.5.

**The Wordmark-Only Bodoni Rule.** Bodoni Moda is never used for anything but "Casa & Te".

## Layout

Two registers switch at **900 px** window width. Phone (<900 px) is a single column with a 20 px page padding, a horizontal circle row of departments, two-column product grid, sticky buy bar on the product page and a bottom tab bar. Desktop (≥900 px) centres content in a 1360 px measure with a 40 px gutter; full-bleed sections (cover photograph, pickup band, footer) put their colour outside the measure.

Desktop rhythm is generous and print-like: 112 px between home sections (128 px before the pickup band, 120 px before the footer), 36 px under a section head, product grid gaps of 28 px with 48 px between rows, 4 columns below 1280 px and 5 at 1280 px and wider on the home "Piccoli prezzi" row. The featured spread pairs one feature-size entry with a 2 × 2 block (40 px gap). Department tiles sit in one row when there are up to six (rows of four beyond that), 28 px apart, each a 0.88 stone plate with the name and article count below. The product page is a two-column spread (media 1.25 : details max 500 px, 72 px gap) under a breadcrumb row.

The phone spacing scale is 6 / 10 / 14 / 18 / 24 px.

## Elevation & Depth

Desktop is flat: depth comes from tonal plates (stone on paper), the forest band, and hairline rules, never from shadows on content. The phone register keeps one soft ambient shadow for floating controls and cards.

### Shadow Vocabulary
- **Soft card shadow** (`box-shadow: 0 4px 14px rgba(58,46,26,0.07)`): phone register only, floating search and raised cards.
- **Round control shadow** (`box-shadow: 0 2px 10px rgba(58,46,26,0.10)`): circular share/heart buttons over product photography.

### Named Rules
**The Flat Print Rule.** On desktop, no shadow on content surfaces; separate with a plate, a rule or whitespace.

## Shapes

Desktop is square-cut: 4 px on photo plates, primary and secondary buttons, quantity control, filter chips, the "closer" tile and header tool hovers; the two buttons that sit on imagery or the green band (cover button, "Cambia negozio") are cut even finer at 2 px. Phone is soft: pill (999 px) primary/secondary buttons, filter chips and search field; 10 px product cards; 12 to 14 px inputs, notices and option cards; full circles for department icons and empty-state icons. Shared across both: the discount badge at 6 px, the round 20 px cart count badge, an 8 px availability dot.

## Components

### Buttons
- **Shape:** 4 px on desktop, pill on phone (same component, `PrimaryButton` / `SecondaryButton`).
- **Primary:** Forest Green fill, white label, min height 50 px, 24 px horizontal padding. Desktop label: Hanken 600 15 px +0.3 px; phone label: Garamond 18.5.
- **Secondary:** 1 px Forest Green (or Danger) border, coloured Hanken 600 14 px label, min height 48 px.
- **Cover / band buttons (desktop home):** white fill with green label on the photograph; 1 px translucent white outline on the green band; 2 px corners; hover fills stone or white at 12%.
- **States:** pressed drops opacity to 0.8 (0.7 secondary); disabled 0.45.
- **Add to cart:** 34 px square, Forest Green, cart icon or the quantity already in the cart; 0.35 opacity when unavailable.

### Chips
- **Style:** white fill, 1 px warm border (#E6DFD3), Hanken 500 12 px; pill on phone, 4 px and 36 px tall on desktop.
- **State:** active filter switches the border to Ink.

### Cards / Containers
- **Desktop product entry:** borderless. A 4 px stone plate holds the photo (slow 1.035 scale on hover, 600 ms); the uppercase brand line, Garamond name (turns green on hover) and scarcity note sit below like print; price and add-to-cart on the bottom line; heart top-right on the plate.
- **Phone product card:** white, 1 px #EEE9E0 border, 10 px radius, photo on white, name 15.5 Garamond.
- **Notices:** 14 px radius, tinted fills (sand info, #E8EFE6 success, #F8E9E7 error) with deep text.

### Inputs / Fields
- **Phone / forms:** 50 px tall, 1 px Line border, 12 px radius, Hanken 15 px; label above in Hanken 500 12 px muted.
- **Desktop masthead search:** no box, only a 1 px Print Rule underline, 300 × 40 px with a search icon.
- **Error:** 1.5 px Danger border and a Danger message below.

### Navigation
- **Desktop masthead:** 84 px row, search left, Bodoni wordmark centred, Preferiti / Account / Carrello right (icon + Hanken 500 label, stone fill on hover/active). Below, a 48 px department band between two Print Rules: text links with 30 px gaps and a 2 px Forest Green underline on hover/active; the store pickup line ("Ritiro gratuito ad Arezzo") at the right opens the store sheet.
- **Phone:** centred wordmark with the store line under it, menu and cart icons, bottom tab bar (Home, Categorie, Preferiti, Profilo) with green active state.

### Department tiles (desktop)
Each department is a stone plate (aspect 0.88, 4 px corners) with its admin cover photo or a representative product (products already shown in "In evidenza" are avoided), the Garamond 26 px name with an arrow, and the article count beneath. Hover: the photo scales to 1.04 over 700 ms, the name turns green and the arrow brightens and nudges right.

### Pickup band
Full-bleed Forest Green section: Garamond 54 headline naming the chosen store, a translucent-outline button, and three facts (pickup, delivery, secure payment) separated by 22% white hairlines.

## Do's and Don'ts

### Do:
- **Do** branch on `useLayout().wide` (900 px) and keep phone and desktop on the same tokens from `src/config/theme.ts`.
- **Do** set product photos on a Warm Stone plate with 4 px corners on desktop.
- **Do** separate desktop rows and sections with 1 px Print Rule (#E4DCCD) hairlines and a 1 px Ink rule under section heads.
- **Do** use Garamond for names, headings and prices, and Hanken Grotesk for desktop controls and labels.
- **Do** show every discount as a solid Sale Red badge plus a red price and struck-through compare price.
- **Do** name the chosen store wherever availability or pickup is mentioned.
- **Do** use the shared easing `cubic-bezier(0.16, 1, 0.3, 1)` at 220 ms for hover transitions on web.

### Don't:
- **Don't** put shadows on desktop content surfaces; use plates, rules or whitespace.
- **Don't** bring phone pills, bordered cards or circular icon tiles into the desktop register.
- **Don't** use Bodoni Moda for anything other than the "Casa & Te" wordmark.
- **Don't** introduce a second accent colour or use Sale Red for anything except discounts.
- **Don't** soften or mute the discount badge.
