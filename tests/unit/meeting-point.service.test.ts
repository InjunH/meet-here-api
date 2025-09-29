/**
 * @fileoverview Meeting Point 서비스 단위 테스트
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { MeetingPointService } from "../../src/services/meeting-point.service";
import { TEST_COORDINATES } from "../helpers/test-data";

describe("MeetingPointService Unit Tests", () => {
  let meetingPointService: MeetingPointService;

  beforeEach(() => {
    meetingPointService = new MeetingPointService();
  });

  describe("calculateGeometricCenter", () => {
    it("2개 위치의 중간지점을 계산해야 한다", () => {
      const locations = [
        {
          lat: TEST_COORDINATES.SEOUL_STATION.lat,
          lng: TEST_COORDINATES.SEOUL_STATION.lng,
          name: "Seoul",
        },
        {
          lat: TEST_COORDINATES.GANGNAM_STATION.lat,
          lng: TEST_COORDINATES.GANGNAM_STATION.lng,
          name: "Gangnam",
        },
      ];

      const result = meetingPointService.calculateGeometricCenter(locations);

      expect(result).toEqual({
        lat: expect.any(Number),
        lng: expect.any(Number),
      });

      // 중간지점이 두 점 사이에 있는지 확인
      expect(result.lat).toBeGreaterThan(
        Math.min(locations[0].lat, locations[1].lat)
      );
      expect(result.lat).toBeLessThan(
        Math.max(locations[0].lat, locations[1].lat)
      );
      expect(result.lng).toBeGreaterThan(
        Math.min(locations[0].lng, locations[1].lng)
      );
      expect(result.lng).toBeLessThan(
        Math.max(locations[0].lng, locations[1].lng)
      );
    });

    it("3개 이상의 위치의 중심점을 계산해야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
        TEST_COORDINATES.HONGDAE,
      ];

      const result = meetingPointService.calculateCenterPoint(locations);

      expect(result).toEqual({
        lat: expect.any(Number),
        lng: expect.any(Number),
      });

      // 유효한 좌표 범위 확인
      expect(result.lat).toBeGreaterThan(37);
      expect(result.lat).toBeLessThan(38);
      expect(result.lng).toBeGreaterThan(126);
      expect(result.lng).toBeLessThan(128);
    });

    it("같은 위치들로 요청 시 동일한 좌표를 반환해야 한다", () => {
      const sameLocation = TEST_COORDINATES.SEOUL_STATION;
      const locations = [sameLocation, sameLocation, sameLocation];

      const result = meetingPointService.calculateCenterPoint(locations);

      expect(result.lat).toBeCloseTo(sameLocation.lat, 5);
      expect(result.lng).toBeCloseTo(sameLocation.lng, 5);
    });
  });

  describe("calculateBounds", () => {
    it("여러 위치의 경계를 계산해야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
        TEST_COORDINATES.HONGDAE,
      ];

      const result = meetingPointService.calculateBounds(locations);

      expect(result).toEqual({
        northeast: {
          lat: expect.any(Number),
          lng: expect.any(Number),
        },
        southwest: {
          lat: expect.any(Number),
          lng: expect.any(Number),
        },
      });

      // northeast는 southwest보다 큰 값이어야 함
      expect(result.northeast.lat).toBeGreaterThan(result.southwest.lat);
      expect(result.northeast.lng).toBeGreaterThan(result.southwest.lng);
    });

    it("단일 위치의 경계를 처리해야 한다", () => {
      const locations = [TEST_COORDINATES.SEOUL_STATION];

      const result = meetingPointService.calculateBounds(locations);

      // 단일 점의 경우 northeast와 southwest가 같아야 함
      expect(result.northeast.lat).toBe(locations[0].lat);
      expect(result.northeast.lng).toBe(locations[0].lng);
      expect(result.southwest.lat).toBe(locations[0].lat);
      expect(result.southwest.lng).toBe(locations[0].lng);
    });
  });

  describe("calculateDistances", () => {
    it("중심점에서 각 위치까지의 거리를 계산해야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
      ];
      const centerPoint = meetingPointService.calculateCenterPoint(locations);

      const result = meetingPointService.calculateDistances(
        centerPoint,
        locations
      );

      expect(result).toEqual({
        distances: expect.any(Array),
        totalDistance: expect.any(Number),
        averageDistance: expect.any(Number),
      });

      expect(result.distances).toHaveLength(2);
      expect(result.distances[0]).toBeGreaterThan(0);
      expect(result.distances[1]).toBeGreaterThan(0);
      expect(result.totalDistance).toBe(
        result.distances[0] + result.distances[1]
      );
      expect(result.averageDistance).toBe(result.totalDistance / 2);
    });

    it("거리 계산 결과가 올바른 단위(미터)여야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
      ];
      const centerPoint = meetingPointService.calculateCenterPoint(locations);

      const result = meetingPointService.calculateDistances(
        centerPoint,
        locations
      );

      // 서울역과 강남역 사이의 거리는 약 6-7km 정도
      // 중간지점에서 각각까지는 3-4km 정도여야 함
      result.distances.forEach((distance) => {
        expect(distance).toBeGreaterThan(1000); // 1km 이상
        expect(distance).toBeLessThan(10000); // 10km 미만
      });
    });
  });

  describe("calculateWeightedCenterPoint", () => {
    it("가중치를 고려한 중심점을 계산해야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
      ];
      const weights = [3, 1]; // 서울역에 3배 가중치

      const result = meetingPointService.calculateWeightedCenterPoint(
        locations,
        weights
      );
      const normalCenter = meetingPointService.calculateCenterPoint(locations);

      expect(result).toEqual({
        lat: expect.any(Number),
        lng: expect.any(Number),
      });

      // 가중치가 높은 서울역 쪽으로 중심점이 이동해야 함
      const seoulDistance = Math.abs(
        result.lat - TEST_COORDINATES.SEOUL_STATION.lat
      );
      const normalDistance = Math.abs(
        normalCenter.lat - TEST_COORDINATES.SEOUL_STATION.lat
      );
      expect(seoulDistance).toBeLessThan(normalDistance);
    });

    it("가중치가 없으면 일반 중심점과 동일해야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
      ];

      const weightedResult = meetingPointService.calculateWeightedCenterPoint(
        locations,
        []
      );
      const normalResult = meetingPointService.calculateCenterPoint(locations);

      expect(weightedResult.lat).toBeCloseTo(normalResult.lat, 5);
      expect(weightedResult.lng).toBeCloseTo(normalResult.lng, 5);
    });

    it("동일한 가중치면 일반 중심점과 동일해야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
      ];
      const weights = [1, 1];

      const weightedResult = meetingPointService.calculateWeightedCenterPoint(
        locations,
        weights
      );
      const normalResult = meetingPointService.calculateCenterPoint(locations);

      expect(weightedResult.lat).toBeCloseTo(normalResult.lat, 5);
      expect(weightedResult.lng).toBeCloseTo(normalResult.lng, 5);
    });
  });

  describe("validateLocations", () => {
    it("유효한 위치들을 통과시켜야 한다", () => {
      const locations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.GANGNAM_STATION,
      ];

      expect(() => {
        meetingPointService.validateLocations(locations);
      }).not.toThrow();
    });

    it("빈 배열에 대해 에러를 발생시켜야 한다", () => {
      expect(() => {
        meetingPointService.validateLocations([]);
      }).toThrow();
    });

    it("1개의 위치에 대해 에러를 발생시켜야 한다", () => {
      expect(() => {
        meetingPointService.validateLocations([TEST_COORDINATES.SEOUL_STATION]);
      }).toThrow();
    });

    it("잘못된 좌표에 대해 에러를 발생시켜야 한다", () => {
      const invalidLocations = [
        TEST_COORDINATES.SEOUL_STATION,
        TEST_COORDINATES.INVALID,
      ];

      expect(() => {
        meetingPointService.validateLocations(invalidLocations);
      }).toThrow();
    });
  });
});
