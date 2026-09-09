import { describe, expect, it } from "vitest";
import { signInError, signUpError } from "./auth-validation";

describe("auth form validation", () => {
  it("requires a valid email and password for sign in", () => {
    expect(signInError("", "secret")).toMatch(/email/);
    expect(signInError("not-an-email", "secret")).toMatch(/valid email/);
    expect(signInError("user@example.com", "")).toMatch(/password/);
    expect(signInError("user@example.com", "secret")).toBeNull();
  });

  it("enforces sign-up rules", () => {
    expect(signUpError("user@example.com", "short", "short", "")).toMatch(/8/);
    expect(signUpError("user@example.com", "password1", "password2", "")).toMatch(/do not match/);
    expect(signUpError("user@example.com", "password1", "password1", "555")).toMatch(/international/);
    expect(signUpError("user@example.com", "password1", "password1", "+15551234567")).toBeNull();
  });
});
