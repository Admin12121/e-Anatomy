import { expect, test } from "bun:test";
import { modalityDestination } from "./navigation";

test("default atlas modality links retain the canvas viewer", () => {
  expect(modalityDestination("head", "brain", "atlas")).toBe("/head/brain");
});
test("View All cards open modality structures rather than a viewer", () => {
  expect(modalityDestination("head", "brain", "catalog")).toBe(
    "/structures/head/brain",
  );
});
test("destinations encode both path segments without altering the mode", () => {
  expect(modalityDestination("head & neck", "brain/mri", "catalog")).toBe(
    "/structures/head%20%26%20neck/brain%2Fmri",
  );
  expect(modalityDestination("head & neck", "brain/mri", "atlas")).toBe(
    "/head%20%26%20neck/brain%2Fmri",
  );
});
