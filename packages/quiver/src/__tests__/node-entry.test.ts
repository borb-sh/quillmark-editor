/**
 * Regression tests for the Node entry design.
 *
 * The package ships two TypeScript entries that resolve to the *same* runtime
 * `Quiver` constructor. Importing `@quillmark/quiver/node` is a side-effecting
 * declaration of intent: it installs `fromDir`, `fromPackage`, `build`, and
 * `buildPackage` on the shared class.
 */

import { describe, it, expect } from "vitest";
import { Quiver as MainQuiver } from "../index.js";
import { Quiver as NodeQuiver } from "../node.js";

describe("node entry — runtime identity", () => {
  it("the constructor exported from /node is the same as from main", () => {
    expect(NodeQuiver).toBe(MainQuiver);
  });

  it("instance returned from fromDir is instanceof Quiver imported from main", async () => {
    const fixture = new URL("./fixtures/sample-quiver", import.meta.url)
      .pathname;
    const q = await NodeQuiver.fromDir(fixture);
    expect(q).toBeInstanceOf(MainQuiver);
  });
});

describe("node entry — augmented surface", () => {
  it("installs fromDir on the shared class", () => {
    expect(typeof NodeQuiver.fromDir).toBe("function");
  });

  it("installs fromPackage on the shared class", () => {
    expect(typeof NodeQuiver.fromPackage).toBe("function");
  });

  it("installs build on the shared class", () => {
    expect(typeof NodeQuiver.build).toBe("function");
  });

  it("installs buildPackage on the shared class", () => {
    expect(typeof NodeQuiver.buildPackage).toBe("function");
  });

  it("installs fromBuiltDir on the shared class", () => {
    expect(typeof NodeQuiver.fromBuiltDir).toBe("function");
  });

  it("preserves fromBuiltUrl from the base class", () => {
    expect(typeof NodeQuiver.fromBuiltUrl).toBe("function");
    expect(NodeQuiver.fromBuiltUrl).toBe(MainQuiver.fromBuiltUrl);
  });
});
