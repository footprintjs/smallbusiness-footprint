import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Product update flow — validates input and updates an existing product.
 */
export function createProductUpdateFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Validate-Input",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      if (!input?.id || typeof input.id !== "string") {
        throw new Error("Product ID is required");
      }
      scope.productId = input.id;
    },
    "validate-input",
    undefined,
    `Validate that the ${term("product")} ID is present`,
  )
    .addFunction(
      "Normalize-Update",
      async (scope) => {
        const raw = scope.input as Record<string, unknown>;
        const update: Record<string, unknown> = { id: scope.productId as string };
        if (typeof raw.name === "string") update.name = raw.name;
        if (typeof raw.basePrice === "number") update.basePrice = raw.basePrice;
        if (typeof raw.originalPrice === "number") update.originalPrice = raw.originalPrice;
        if (typeof raw.description === "string") update.description = raw.description;
        if (Array.isArray(raw.images)) update.images = raw.images.filter((v: unknown) => typeof v === "string");
        if (Array.isArray(raw.tags)) update.tags = raw.tags.filter((v: unknown) => typeof v === "string");
        if (Array.isArray(raw.colors)) update.colors = raw.colors.filter((v: unknown) => typeof v === "string");
        if (Array.isArray(raw.sizes)) update.sizes = raw.sizes.filter((v: unknown) => typeof v === "string");
        scope.updateName = update.name;
        scope.updateBasePrice = update.basePrice;
        scope.updateOriginalPrice = update.originalPrice;
        scope.updateDescription = update.description;
        scope.updateImages = update.images;
        scope.updateTags = update.tags;
        scope.updateColors = update.colors;
        scope.updateSizes = update.sizes;
      },
      "normalize-update",
      `Build the update payload for the ${term("product")}`,
    )
    .addFunction(
      "Update-Product",
      async (scope) => {
        const product = await repo.updateProduct({
          id: scope.productId as string,
          name: scope.updateName as string | undefined,
          basePrice: scope.updateBasePrice as number | undefined,
          originalPrice: scope.updateOriginalPrice as number | undefined,
          description: scope.updateDescription as string | undefined,
          images: scope.updateImages as string[] | undefined,
          tags: scope.updateTags as string[] | undefined,
          colors: scope.updateColors as string[] | undefined,
          sizes: scope.updateSizes as string[] | undefined,
        });
        scope.updatedProduct = product;
        scope.output = { productId: product.id, name: product.name, status: product.status };
      },
      "update-product",
      `Apply changes to the ${term("product")} in the repository`,
    )
    .build();
}
