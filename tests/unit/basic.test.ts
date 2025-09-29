/**
 * @fileoverview 기본 테스트 케이스들
 */

import { describe, it, expect, jest } from "@jest/globals";

describe("Basic Tests", () => {
  describe("Environment Setup", () => {
    it("테스트 환경이 올바르게 설정되어야 한다", () => {
      expect(process.env.NODE_ENV).toBe("test");
      expect(process.env.LOG_LEVEL).toBe("silent");
    });

    it("테스트용 환경변수들이 설정되어야 한다", () => {
      expect(process.env.PORT).toBe("0");
      expect(process.env.KAKAO_API_KEY).toBe("test_kakao_key");
      expect(process.env.NAVER_CLOUD_CLIENT_ID).toBe("test_naver_client_id");
    });
  });

  describe("JavaScript/TypeScript Features", () => {
    it("비동기 처리가 정상 작동해야 한다", async () => {
      const asyncFunction = async () => {
        return new Promise((resolve) =>
          setTimeout(() => resolve("success"), 10)
        );
      };

      const result = await asyncFunction();
      expect(result).toBe("success");
    });

    it("ES6+ 기능들이 정상 작동해야 한다", () => {
      const testArray = [1, 2, 3, 4, 5];
      const doubled = testArray.map((x) => x * 2);
      const filtered = doubled.filter((x) => x > 5);

      expect(doubled).toEqual([2, 4, 6, 8, 10]);
      expect(filtered).toEqual([6, 8, 10]);
    });

    it("객체 구조 분해가 정상 작동해야 한다", () => {
      const testObject = {
        name: "test",
        value: 42,
        nested: { deep: "value" },
      };

      const {
        name,
        value,
        nested: { deep },
      } = testObject;

      expect(name).toBe("test");
      expect(value).toBe(42);
      expect(deep).toBe("value");
    });
  });

  describe("Test Framework", () => {
    it("Jest 매처들이 정상 작동해야 한다", () => {
      expect(true).toBeTruthy();
      expect(false).toBeFalsy();
      expect([1, 2, 3]).toHaveLength(3);
      expect({ a: 1, b: 2 }).toEqual({ a: 1, b: 2 });
      expect("hello world").toContain("world");
      expect(42).toBeGreaterThan(40);
    });

    it("에러 처리 테스트가 정상 작동해야 한다", () => {
      const errorFunction = () => {
        throw new Error("Test error");
      };

      expect(errorFunction).toThrow("Test error");
      expect(errorFunction).toThrow(Error);
    });

    it("타이머 모킹이 정상 작동해야 한다", () => {
      jest.useFakeTimers();

      const callback = jest.fn();
      setTimeout(callback, 1000);

      expect(callback).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });
});
