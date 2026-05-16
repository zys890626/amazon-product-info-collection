# amazon-product-info-collection

Codex skill for collecting Amazon product information from ASINs by combining Amazon product-page fields with SellerSprite plugin fields.

## What this skill does

- Checks Chrome remote debugging availability
- Checks whether SellerSprite is installed
- Attempts SellerSprite login when needed
- Opens Amazon product pages from ASINs
- Waits for SellerSprite to load
- Collects structured Amazon + SellerSprite fields

## Folder placement

Place this folder under your Codex skills directory:

- Windows:
  `C:\Users\<YourUser>\.codex\skills\amazon-product-info-collection`
- Generic:
  `${CODEX_HOME}/skills/amazon-product-info-collection`

## Main files

- `SKILL.md`
- `agents/openai.yaml`
- `scripts/bootstrap_sellersprite_session.mjs`
- `scripts/collect_amazon_asins.mjs`
- `references/fields.md`
- `references/sellersprite-setup.md`

## Example use

```text
亚马逊数据收集技能，采集这些 ASIN：B0FDWCP1S3 B0FK3XNKTN
```

```text
用 $amazon-product-info-collection 先检查卖家精灵插件并登录，再采集 ASIN 信息。
```
