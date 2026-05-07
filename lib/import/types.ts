// One row from a parsed master table.
export type ImportRow = Record<string, string>;

export type ParseResult = {
  headers: string[];
  rows: ImportRow[];
  source: "excel" | "csv" | "google-sheets";
  sheetName?: string;
  warnings: string[];
};

// What a row maps to in the Product model.
export type ProductFieldKey =
  | "masterSku"
  | "name"
  | "description"
  | "productUrl"
  | "category"
  | "targetRegion"
  | "targetCustomerTypes"
  | "keywords"
  | "exclusions"
  | "priceRangeMin"
  | "priceRangeMax"
  | "variantLabel"
  | "variantSku"
  | "variantPackSize"
  | "variantPrice";

// header → product field
export type ColumnMapping = Partial<Record<ProductFieldKey, string>>;
