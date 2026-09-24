# CASA & TE — Acceptance Tests

## Cart

### A1
Given:
- 1 item €7.99, 2.2kg
Expected:
- subtotal €7.99
- weight 2.2kg

### A2
Increase quantity from 1 to 2
Expected:
- subtotal doubles
- weight doubles

## Shipping

### S1
Subtotal €20, weight 1.5kg
Expected:
- Home €4.90
- Pickup €3.90
- Store €0

### S2
Subtotal €20, weight 3kg
Expected:
- Home €6.90
- Pickup €4.90
- Store €0

### S3
Subtotal €30, weight 1.5kg
Expected:
- Home €3.90
- Pickup €2.90
- Store €0

### S4
Subtotal €30, weight 4kg
Expected:
- Home €5.90
- Pickup €3.90
- Store €0

### S5
Subtotal €50, weight 1.5kg
Expected:
- Home €2.90
- Pickup €1.90
- Store €0

### S6
Subtotal €50, weight 4kg
Expected:
- Home €4.90
- Pickup €2.90
- Store €0

### S7
Subtotal €66, weight 9.5kg
Expected:
- Home €0
- Pickup €0
- Store €0

### S8
Subtotal €80, weight 12kg
Expected:
- free-shipping rule must NOT apply
- use provisional >10kg fallback until final rule is approved

## Checkout

### C1
Select store pickup
Expected:
- shipping €0
- delivery address fields hidden

### C2
Select home delivery
Expected:
- address fields visible
- total = subtotal + shipping

## Orders

### O1
Confirm mock order
Expected:
- order created
- cart cleared
- success screen shown
- order visible in Orders

### O2
Close and reopen app
Expected:
- order still visible
- cart state persists correctly
