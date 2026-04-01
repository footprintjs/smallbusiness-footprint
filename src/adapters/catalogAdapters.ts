import type { Adapter } from "@footprint/adapters";
import type { BusinessRepository } from "../types.js";

/**
 * Create catalog adapters with repository access.
 * Each adapter handles product creation with type-specific catalog logic.
 */
export function createCatalogAdapters(repo: BusinessRepository): readonly Adapter[] {
  const variantCatalog: Adapter = {
    id: "variant-catalog",
    name: "Variant Catalog (Color/Size Matrix)",
    capabilityId: "create-product",
    async execute(input, _context) {
      const { name, basePrice, colors, sizes, ...rest } = input as Record<string, unknown>;
      if (!name || typeof name !== "string") throw new Error("variant-catalog: product name is required");
      if (basePrice == null || typeof basePrice !== "number") throw new Error("variant-catalog: basePrice is required");
      const colorList = Array.isArray(colors) ? colors.filter((v: unknown) => typeof v === "string") : [];
      const sizeList = Array.isArray(sizes) ? sizes.filter((v: unknown) => typeof v === "string") : [];
      const product = await repo.createProduct({
        name: name as string,
        basePrice: basePrice as number,
        colors: colorList as string[],
        sizes: sizeList as string[],
        ...rest as any,
      });
      const variantCount = Math.max(1, colorList.length) * Math.max(1, sizeList.length);
      return { created: true, catalogType: "variant", product, variantCount };
    },
  };

  const boxCatalog: Adapter = {
    id: "box-catalog",
    name: "Box Catalog (Size/Flavor Assortment)",
    capabilityId: "create-product",
    async execute(input, _context) {
      const { name, basePrice, sizes, colors, ...rest } = input as Record<string, unknown>;
      if (!name || typeof name !== "string") throw new Error("box-catalog: product name is required");
      if (basePrice == null || typeof basePrice !== "number") throw new Error("box-catalog: basePrice is required");
      const boxSizes = Array.isArray(sizes) ? sizes.filter((v: unknown) => typeof v === "string") : [];
      const flavors = Array.isArray(colors) ? colors.filter((v: unknown) => typeof v === "string") : [];
      const product = await repo.createProduct({
        name: name as string,
        basePrice: basePrice as number,
        sizes: boxSizes as string[],
        colors: flavors as string[],
        ...rest as any,
      });
      return { created: true, catalogType: "box", product, boxSizes, flavors };
    },
  };

  return [variantCatalog, boxCatalog];
}

// Static stubs for adapter registry bootstrapping — throw if invoked
export const variantCatalogAdapter: Adapter = {
  id: "variant-catalog", name: "Variant Catalog (Color/Size Matrix)", capabilityId: "create-product",
  async execute() { throw new Error("Static adapter stub invoked. Use createCatalogAdapters(repo) for a real adapter."); },
};
export const boxCatalogAdapter: Adapter = {
  id: "box-catalog", name: "Box Catalog (Size/Flavor Assortment)", capabilityId: "create-product",
  async execute() { throw new Error("Static adapter stub invoked. Use createCatalogAdapters(repo) for a real adapter."); },
};

export const allCatalogAdapters: readonly Adapter[] = [variantCatalogAdapter, boxCatalogAdapter];
