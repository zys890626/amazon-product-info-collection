# Field Guide

Use these mappings when summarizing or validating collection output.

- `title`: Amazon `#productTitle`
- `brand`: SellerSprite brand when present; otherwise use Amazon brand/byline
- `seller`: SellerSprite seller when present; otherwise use Amazon seller or buybox text
- `price`: Numeric price from Amazon page
- `rating`: Numeric rating from Amazon page
- `reviewCount`: Numeric review count from Amazon page
- `availability`: Amazon stock text
- `categoryPath`: Amazon breadcrumb path
- `bullets`: Feature bullets from the listing
- `imageUrls`: Main image plus thumbnail image URLs when available
- `productDetailsText`: Flattened detail-bullets and technical details text
- `ssSalesParent`: SellerSprite recent 30-day parent sales
- `ssRevenue`: SellerSprite listing revenue
- `ssFbaFee`: SellerSprite FBA fee
- `ssListedDate`: SellerSprite listing date
- `ssInventory`: SellerSprite remaining inventory if shown
- `sellerSpriteLoaded`: `true` if SellerSprite fields were found in page text

Interpretation notes:

- Prefer SellerSprite values for sales and listing-age analysis.
- Use Amazon rating and review count as the primary demand-quality signals.
- Treat missing SellerSprite fields as collection gaps, not zero values.
