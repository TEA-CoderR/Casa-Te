# CASA & TE Mobile App — Product Specification

## Navigation

Bottom navigation:
- Home
- Catalogo
- Carrello
- Ordini
- Profilo

Stack screens:
- Product detail
- Checkout
- Order success

## Home

Must contain:
- CASA & TE logo
- selected store
- search entry point
- promotional hero
- free-shipping message
- featured products
- entry to catalog

## Catalogo

Must contain:
- search
- category filtering
- product cards
- product price
- product availability
- navigation to product detail

Optional:
- sort by price/name
- promotional badge

## Product detail

Must contain:
- product name
- category
- price
- indicative weight
- availability
- quantity selector
- add-to-cart button

## Carrello

Must contain:
- product list
- quantity controls
- remove product
- line totals
- subtotal
- total order weight
- shipping preview
- checkout CTA

Changing quantity must recalculate:
- subtotal
- order weight
- shipping

## Checkout

Fulfilment methods:
- Consegna a domicilio
- Punto di ritiro / Locker
- Ritiro in negozio

UI behavior:
- selected fulfilment option is visually obvious
- shipping price shown next to each option
- store pickup = free
- address fields hidden for store pickup
- payment method is mock only
- total recalculates immediately

## Order confirmation

Must show:
- success state
- order ID
- final total
- CTA to Orders
- CTA back Home

## Orders

Must show:
- order ID
- date/time
- item count
- total weight
- total paid
- status
- basic timeline

## Profile

Demo only:
- address placeholder
- preferred store
- notifications placeholder
- privacy
- support

No real login required.

## UX principles

- customer-facing text in Italian
- large tap targets
- avoid tiny text
- work well on 360–430px width
- shipping rules should be understandable
- no hidden fees
- store pickup should feel like the cheapest/easiest option
