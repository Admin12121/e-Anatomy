import { expect, test } from "bun:test";
import { shouldAnimateRouteTransition as animate } from "./route-transition-policy";

// Match the project's Bun test files without adding Bun types to the app build.

test("Structures crossings use the existing Home and canvas transition", () => {
  for (const other of ["/", "/head/brain", "/head/lungs"]) {
    expect(animate(other, "/structures/head/brain")).toBe(true);
    expect(animate("/structures/head/brain/label", other)).toBe(true);
  }
});

test("labels, modalities, and regions remain instant inside Structures", () => {
  for (const target of [
    "/structures/head/brain/label",
    "/structures/head/lungs",
    "/structures/chest/lungs",
  ]) {
    expect(animate("/structures/head/brain", target)).toBe(false);
  }
});

test("admin and legal navigation does not inherit Structures animations", () => {
  for (const other of [
    "/content/brain",
    "/playground/zones",
    "/terms",
    "/login",
  ]) {
    expect(animate("/structures/head/brain", other)).toBe(false);
    expect(animate(other, "/structures/head/brain")).toBe(false);
  }
  expect(animate("/terms", "/privacy")).toBe(false);
  expect(animate("/head/brain", "/terms")).toBe(false);
  expect(animate("/terms", "/")).toBe(true);
  expect(animate("/", "/privacy")).toBe(true);
});

test("existing public viewer transitions remain enabled", () => {
  expect(animate("/", "/head/brain")).toBe(true);
  expect(animate("/head/brain", "/head/lungs")).toBe(true);
  expect(animate("/head/brain", "/content/brain")).toBe(false);
});

test("same routes and query-only changes do not animate", () => {
  expect(
    animate("/structures/head/brain/", "/structures/head/brain?label=x"),
  ).toBe(false);
  expect(animate("/", undefined)).toBe(false);
  expect(animate("/", "/structures/head/brain/#content")).toBe(true);
});
