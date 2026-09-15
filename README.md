# Mustafa's Shop

A phone-first app for running a small shop with three counters: **snacks**, **stationery**, and **photocopy & printing**.
Built with React and Vite, installable as a Progressive Web App.

Everything is stored on the device that uses it. Nothing is uploaded.

## What it does

**Home** — today's takings split across the three counters, profit for the last 14 days, what is running low,
what is owed on the khata, and which purchase bills are still unpaid.

**Stock** — scan a barcode to add goods. If the code is already saved, a short sheet just asks how many arrived.
If it is new, the form opens with the barcode filled and the product name looked up online where possible.
A photo button names an item from a picture when the packet has no barcode. Items can be sold by the piece or by the box.

**Sales** — sell a stock item (scan or search for it), or record a photocopy/printing job. Printing has saved
rates per page for photocopy, black and white, colour, scanning, binding and lamination, so one tap and a page
count is usually enough. Paper and ink cost is subtracted so the profit figure is real.

**Khata** — credit accounts. Every item taken and every payment is stored with its date, grouped day by day.
When a customer leaves the area, their account can be closed — they disappear from the list but the full dated
history stays. Permanent deletion is a separate, clearly marked action.

**Purchase bills** — photograph the bill each time stock is bought from the market. Supplier, amount, date,
paid or unpaid, and the photo are kept together. Photos are shrunk before saving so the device does not fill up.

**Customer suggestions** — a place to write down what people ask for but the shop does not keep, so the next
buying trip has a list instead of guesswork.

**Partners & stock fund** — a set share of every rupee of profit stays in the shop to buy new stock; the partners
divide only what is left. Bills marked as paid from the stock fund draw that balance down, so the "money available
to restock" figure is always current. The share is adjustable.

## Running it

```bash
npm install
npm run dev      # development
npm run build    # production build in dist/
```

## Notes and limits

- Barcode scanning uses the browser's built-in `BarcodeDetector`. Chrome on Android supports it; Safari does not,
  so on iPhone the code has to be typed. There is a text box for that in the scanner.
- The photo naming tool uses a general image model that recognises shapes like "bottle" or "notebook", not brands.
  It is a shortcut for typing, not a product database.
- Barcodes carry no price. Cost and selling price are entered once per item; after that the same barcode restocks
  in one tap.
- Data lives in this browser's storage. Clearing site data clears the shop record. Two devices each keep their own
  copy — a shared record would need a server or a cloud database.

## Built with

React · Vite · Recharts · Lucide · TensorFlow.js (MobileNet) · vite-plugin-pwa
