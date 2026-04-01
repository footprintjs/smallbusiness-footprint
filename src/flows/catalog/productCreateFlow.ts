import { flowChart } from "footprintjs";
import type { BusinessRepository } from "../../types.js";

/**
 * Product creation flow — validates input, normalizes data, and creates a product.
 */
export function createProductCreateFlow(repo: BusinessRepository, t?: (key: string) => string) {
  const term = t ?? ((k: string) => k);

  return flowChart<any>(
    "Validate-Input",
    async (scope) => {
      const input = scope.input as Record<string, unknown> | undefined;
      if (!input?.name || typeof input.name !== "string") {
        throw new Error("Product name is required");
      }
      if (input.basePrice == null || typeof input.basePrice !== "number") {
        throw new Error("Base price is required");
      }
      if (input.basePrice < 0) {
        throw new Error("Base price must be non-negative");
      }
      scope.productName = input.name;
      scope.basePrice = input.basePrice;
    },
    "validate-input",
    undefined,
    `Validate that required ${term("product")} fields are present`,
  )
    .addFunction(
      "Normalize-Data",
      async (scope) => {
        const raw = scope.input as Record<string, unknown>;
        scope.description = typeof raw.description === "string" ? raw.description : undefined;
        scope.originalPrice = typeof raw.originalPrice === "number" ? raw.originalPrice : undefined;
        scope.images = Array.isArray(raw.images) ? raw.images.filter((v: unknown) => typeof v === "string") : undefined;
        scope.videos = Array.isArray(raw.videos) ? raw.videos.filter((v: unknown) => typeof v === "string") : undefined;
        scope.tags = Array.isArray(raw.tags) ? raw.tags.filter((v: unknown) => typeof v === "string") : undefined;
        scope.colors = Array.isArray(raw.colors) ? raw.colors.filter((v: unknown) => typeof v === "string") : undefined;
        scope.sizes = Array.isArray(raw.sizes) ? raw.sizes.filter((v: unknown) => typeof v === "string") : undefined;
        scope.seoTitle = typeof raw.seoTitle === "string" ? raw.seoTitle : undefined;
        scope.seoDescription = typeof raw.seoDescription === "string" ? raw.seoDescription : undefined;
        scope.seoSlug = typeof raw.seoSlug === "string" ? raw.seoSlug : undefined;
      },
      "normalize-data",
      `Normalize ${term("product")} data and sanitize optional fields`,
    )
    .addFunction(
      "Create-Product",
      async (scope) => {
        const product = await repo.createProduct({
          name: scope.productName as string,
          basePrice: scope.basePrice as number,
          originalPrice: scope.originalPrice as number | undefined,
          description: scope.description as string | undefined,
          images: scope.images as string[] | undefined,
          videos: scope.videos as string[] | undefined,
          tags: scope.tags as string[] | undefined,
          colors: scope.colors as string[] | undefined,
          sizes: scope.sizes as string[] | undefined,
          seoTitle: scope.seoTitle as string | undefined,
          seoDescription: scope.seoDescription as string | undefined,
          seoSlug: scope.seoSlug as string | undefined,
        });
        scope.createdProduct = product;
        scope.output = { productId: product.id, name: product.name, status: product.status };
      },
      "create-product",
      `Create the ${term("product")} record in the repository`,
    )
    .build();
}
