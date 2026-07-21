-- Rename legacy A-10xx asset numbers to AST-00000x format
UPDATE "assets"
SET "assetNumber" = 'AST-' || LPAD(
  SUBSTRING("assetNumber" FROM '[0-9]+$')::text,
  6, '0'
)
WHERE "assetNumber" ~ '^A-[0-9]+$';
