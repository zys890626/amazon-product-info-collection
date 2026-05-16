---
name: amazon-product-info-collection
description: Collect structured Amazon product data from ASINs by opening Amazon product pages in Chrome, making sure the SellerSprite extension is installed and logged in, waiting for the SellerSprite plugin to load, and extracting both Amazon page fields and SellerSprite plugin fields. Use when the user wants repeatable ASIN-based collection of title, brand, seller, price, rating, review count, bullets, category path, images, listing age, FBA fee, recent sales, revenue, inventory, or related product-page details from Amazon plus SellerSprite. Also use when the user explicitly says "亚马逊数据收集技能" or asks for Amazon data collection with SellerSprite.
---

# Amazon Product Info Collection

Use this skill when the task is: given one or more ASINs, open the Amazon product page in Chrome, make sure SellerSprite is available and signed in, wait for SellerSprite to finish loading, and return structured product information.

## Workflow

1. Make sure Chrome remote debugging is available on `http://127.0.0.1:9222`.
2. Run the SellerSprite bootstrap helper to verify extension presence and sign-in state.
3. Open or reuse an Amazon tab in that Chrome session.
4. Navigate to each `https://www.amazon.com/dp/<ASIN>` page.
5. Wait for the page and SellerSprite panel to load before collecting data.
6. Extract Amazon page fields and SellerSprite plugin fields.
7. Save results to JSON and summarize the key findings for the user.

## Quick Start

Prepare the Chrome session before collecting ASINs:

```powershell
node scripts/bootstrap_sellersprite_session.mjs
```

Run the collector script for one or more ASINs:

```powershell
node scripts/collect_amazon_asins.mjs B0FDWCP1S3 B0FK3XNKTN
```

Run the collector from a text file with one ASIN per line:

```powershell
node scripts/collect_amazon_asins.mjs --file C:\path\to\asins.txt
```

Write output to a chosen JSON path:

```powershell
node scripts/collect_amazon_asins.mjs --file C:\path\to\asins.txt --out C:\path\to\results.json
```

## Required Checks

- Use the Chrome session that already has SellerSprite installed.
- If SellerSprite is missing, open the Chrome Web Store listing and install the extension before continuing.
- If SellerSprite is not logged in, sign in with the configured account before collecting ASINs.
- Wait at least 10-15 seconds after navigation if SellerSprite fields do not appear immediately.
- Prefer SellerSprite values for recent sales, revenue, FBA fee, listing date, and inventory when available.
- Record missing fields as `null` instead of inventing values.
- If SellerSprite does not load, still return the Amazon page fields and set `sellerSpriteLoaded` to `false`.

Setup details live in [references/sellersprite-setup.md](references/sellersprite-setup.md).

## Collected Fields

Collect these fields when available:

- `asin`
- `url`
- `finalUrl`
- `title`
- `brand`
- `seller`
- `price`
- `rating`
- `reviewCount`
- `availability`
- `categoryPath`
- `bullets`
- `imageUrls`
- `productDetailsText`
- `ssSalesParent`
- `ssRevenue`
- `ssFbaFee`
- `ssListedDate`
- `ssInventory`
- `sellerSpriteLoaded`

Field notes live in [references/fields.md](references/fields.md).

## Failure Handling

- If Chrome debugging is unavailable, tell the user Chrome must be started with `--remote-debugging-port=9222`.
- If an ASIN page times out, record an `ERROR` result and continue with the next ASIN.
- If Amazon redirects to a generic page, keep the final URL and record what was available.
- If SellerSprite shows a login or buyer-account warning, still capture the warning in the snippet and continue.

## Output Shape

Return a JSON array of per-ASIN records. Each record should contain:

```json
{
  "asin": "B0FDWCP1S3",
  "status": "OK",
  "title": "Example title",
  "price": 37.99,
  "rating": 4.8,
  "reviewCount": 51,
  "ssSalesParent": 362,
  "ssRevenue": 13752,
  "ssFbaFee": 6.24,
  "ssListedDate": "2025-08-12",
  "sellerSpriteLoaded": true
}
```

## Resources

- Setup helper: [scripts/bootstrap_sellersprite_session.mjs](scripts/bootstrap_sellersprite_session.mjs)
- Script: [scripts/collect_amazon_asins.mjs](scripts/collect_amazon_asins.mjs)
- Field reference: [references/fields.md](references/fields.md)
- SellerSprite setup: [references/sellersprite-setup.md](references/sellersprite-setup.md)
