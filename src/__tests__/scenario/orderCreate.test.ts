import { describe, it, expect } from "vitest";
import { FlowChartExecutor } from "footprintjs";
import { createOrderCreateFlow } from "../../flows/orders/orderCreateFlow.js";
import { createMockRepository } from "../helpers.js";

const validShipping = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  address: "123 Main St",
  city: "Anytown",
  state: "CA",
  zipCode: "90210",
};

describe("order create flow", () => {
  const repo = createMockRepository();

  it("creates an order with valid input", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {
        email: "jane@example.com",
        items: [{ name: "Summer Dress", quantity: 1, price: 2999 }],
        shipping: validShipping,
      },
    }});
    executor.enableNarrative();

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;

    expect(state.createdOrder).toBeDefined();
    const output = state.output as any;
    expect(output.orderId).toBeTruthy();
    expect(output.status).toBe("CREATED");
    expect(output.currency).toBe("usd");
  });

  it("rejects order without email", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {
        items: [{ name: "Test", quantity: 1, price: 100 }],
        shipping: validShipping,
      },
    }});

    await expect(executor.run()).rejects.toThrow("Customer email is required");
  });

  it("rejects order without items", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: { email: "test@example.com", items: [], shipping: validShipping },
    }});

    await expect(executor.run()).rejects.toThrow("At least one item is required");
  });

  it("rejects order without shipping", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {
        email: "test@example.com",
        items: [{ name: "Test", quantity: 1, price: 100 }],
      },
    }});

    await expect(executor.run()).rejects.toThrow("Shipping information is required");
  });

  it("uses custom currency when provided", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {
        email: "test@example.com",
        items: [{ name: "Test", quantity: 1, price: 100 }],
        shipping: validShipping,
        currency: "eur",
      },
    }});

    await executor.run();
    const state = executor.getSnapshot().sharedState as Record<string, unknown>;
    expect((state.createdOrder as any).currency).toBe("eur");
  });

  it("produces narrative entries", async () => {
    const flow = createOrderCreateFlow(repo);
    const executor = new FlowChartExecutor(flow, { initialContext: {
      input: {
        email: "test@example.com",
        items: [{ name: "Test", quantity: 1, price: 100 }],
        shipping: validShipping,
      },
    }});
    executor.enableNarrative();

    await executor.run();
    const narrative = executor.getNarrative();
    expect(narrative.length).toBeGreaterThan(0);
  });
});
