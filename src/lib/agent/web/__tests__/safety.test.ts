import { describe, expect, it } from "vitest";
import { assertSafeHttpsUrl } from "../safety";

describe("assertSafeHttpsUrl", () => {
  it("allows a public https URL", () => {
    expect(assertSafeHttpsUrl("https://example.com/docs").hostname).toBe("example.com");
  });

  it("blocks file, http, localhost, private, and metadata hosts", () => {
    expect(() => assertSafeHttpsUrl("file:///etc/passwd")).toThrow(/file/i);
    expect(() => assertSafeHttpsUrl("http://example.com")).toThrow(/https/i);
    expect(() => assertSafeHttpsUrl("https://localhost/secret")).toThrow(/not allowed/i);
    expect(() => assertSafeHttpsUrl("https://127.0.0.1/secret")).toThrow(/not allowed/i);
    expect(() => assertSafeHttpsUrl("https://10.0.0.8/docs")).toThrow(/not allowed/i);
    expect(() => assertSafeHttpsUrl("https://192.168.1.10/docs")).toThrow(/not allowed/i);
    expect(() => assertSafeHttpsUrl("https://172.16.0.2/docs")).toThrow(/not allowed/i);
    expect(() => assertSafeHttpsUrl("https://169.254.169.254/latest")).toThrow(/not allowed/i);
    expect(() => assertSafeHttpsUrl("https://metadata.google.internal/")).toThrow(/not allowed/i);
    expect(() => assertSafeHttpsUrl("https://[fd12:3456:789a::1]/")).toThrow(/not allowed/i);
  });
});
