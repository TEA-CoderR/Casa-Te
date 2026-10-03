# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(The same Expo / React Native codebase also builds the native customer app; this record covers the web shop. Below 900 px the web shop uses the phone layout, which is out of scope for desktop work and must stay unchanged.)

## Users

Shoppers in and around Arezzo and Lucca who already know the CASA & TE stores, buying everyday household goods (cleaning, kitchen, home, bath, storage) online, mostly to collect in their chosen store or to have delivered. Desktop visitors browse more calmly and compare more items per screen than phone visitors.

## Product Purpose

CASA & TE is an Italian household-goods chain with 5 stores (Arezzo; Lucca 1–4) opening its first online sales channel. The web shop must feel like a real, trustworthy shop of the chain: browse and search products, check availability in a chosen store, add to cart, pick a fulfilment method (store pickup is always free, home delivery, pickup point), pay, follow the order. Current stage: a convincing demo for the company's managers, not yet a public launch.

## Positioning

Affordable everyday household goods with design sense (confirmed by the owner: "平价日用,但要有设计感" — like an elevated H&M Home / IKEA register, not luxury). Tied to real local stores: availability is always per store, and in-store pickup is free.

## Operating Context

- Prices, shipping and stock are computed by the server (Supabase SQL); the UI only displays them.
- Store selection ("Ritiro a Arezzo") scopes availability everywhere.
- Back office (separate app) lets staff pick 8 home departments, star "In evidenza" products, upload department cover photos, and set discounts (compare-at price).
- Customer UI language: Italian.

## Capabilities and Constraints

- Desktop web = window width ≥ 900 px (`useLayout().wide`). Phone layout below that is unchanged by desktop work.
- Never compute charged amounts on the client; never change shipping rules without approval.
- Do not invent real product data, prices, stock, addresses, testimonials or legal data.
- Discounts must stay highly visible (owner request: solid red badge, red sale price).

## Brand Commitments

- Name and wordmark "Casa & Te" set in Bodoni Moda; body serif EB Garamond; dark green brand colour (#1F4A33 family) with warm stone neutrals.
- Home hero photo supplied by the owner (`apps/mobile/assets/home-tuscany.jpg`, Tuscan table with a view of Florence) and the tagline "La bellezza vive con te."
- Owner preferences: tasteful, not generic "AI-looking"; no fake premium-fintech look; discount labels loud.

## Evidence on Hand

- Product photos for the demo catalogue are synthetic studio images (`apps/mobile/assets/demo`); real photography is pending.
- No real reviews, customer counts, press or awards exist yet — none may be fabricated.

## Product Principles

1. A real local shop online: store, availability and pickup are always visible and honest.
2. Products first: photography and price read before decoration.
3. Design sense at everyday prices — elevated, warm, never exclusive or intimidating.
4. Server is the source of truth for every amount.
