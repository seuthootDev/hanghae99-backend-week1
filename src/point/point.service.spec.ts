import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from './point.service';

describe('PointService', () => {
  let service: PointService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PointService],
    }).compile();

    service = module.get<PointService>(PointService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addPoints (포인트 충전)', () => {
    describe('정상 케이스', () => {
      it('새로운 사용자에게 포인트를 추가하고 새로운 잔액을 반환해야 한다', () => {
        // Given: 새로운 사용자에게 포인트 추가
        const userId = 1;
        const pointsToAdd = 1000; // 최소 충전 금액
        
        // When: 포인트 추가
        const result = service.addPoints(userId, pointsToAdd);
        
        // Then: 새로운 잔액 반환
        expect(result).toBe(1000);
      });

      it('기존 사용자의 포인트를 누적해야 한다', () => {
        // Given: 기존 사용자에게 포인트 추가
        const userId = 1;
        service.addPoints(userId, 1000);
        
        // When: 추가 포인트 충전
        const result = service.addPoints(userId, 1000);
        
        // Then: 누적된 잔액 반환
        expect(result).toBe(2000);
      });

      it('최소 충전 금액 미만일 때 에러를 발생시켜야 한다', () => {
        // Given: 최소 충전 금액 미만
        const userId = 1;
        const minChargeAmount = 1000; // 최소 1000원
        const insufficientAmount = 500;
        
        // When & Then: 최소 충전 금액 미만 시 에러 발생
        expect(() => {
          service.addPoints(userId, insufficientAmount);
        }).toThrow('Minimum charge amount is 1000 points');
      });

      it('여러 사용자를 독립적으로 처리해야 한다', () => {
        // Given: 여러 사용자
        const user1 = 1;
        const user2 = 2;
        
        // When: 각각 다른 포인트 추가
        service.addPoints(user1, 1000);
        service.addPoints(user2, 2000);
        const result1 = service.addPoints(user1, 1000);
        const result2 = service.addPoints(user2, 2000);
        
        // Then: 각각 독립적으로 관리
        expect(result1).toBe(2000); // user1: 1000 + 1000
        expect(result2).toBe(4000); // user2: 2000 + 2000
      });
    });

    describe('정책 검증 (최대 잔고)', () => {
      it('최대 잔고까지 충전을 허용해야 한다', () => {
        // Given: 최대 잔고까지 충전
        const userId = 1;
        const maxBalance = 1000000; // 100만 포인트
        
        // When: 최대 잔고까지 충전
        const result = service.addPoints(userId, maxBalance);
        
        // Then: 최대 잔고까지 허용
        expect(result).toBe(maxBalance);
      });

      it('최대 잔고를 초과할 때 에러를 발생시켜야 한다', () => {
        // Given: 최대 잔고 초과 충전
        const userId = 1;
        const maxBalance = 1000000;
        const exceedAmount = 1000001;
        
        // When & Then: 최대 잔고 초과 시 예외 발생
        expect(() => {
          service.addPoints(userId, exceedAmount);
        }).toThrow('Maximum balance exceeded');
      });

      it('누적 잔고가 최대 잔고를 초과할 때 에러를 발생시켜야 한다', () => {
        // Given: 기존 잔고 + 추가 충전이 최대 잔고 초과
        const userId = 1;
        const maxBalance = 1000000;
        service.addPoints(userId, maxBalance - 1000); // 최대 잔고 - 1000
        
        // When & Then: 추가 충전 시 최대 잔고 초과 예외 발생
        expect(() => {
          service.addPoints(userId, 2000); // 999000 + 2000 = 1001000 > 1000000
        }).toThrow('Maximum balance exceeded');
      });
    });

    describe('예외 케이스', () => {
      it('음수 포인트에 대해 에러를 발생시켜야 한다', () => {
        // Given: 음수 포인트 충전 시도
        const userId = 1;
        const negativePoints = -50;
        
        // When & Then: 음수 포인트 충전 시 예외 발생
        expect(() => {
          service.addPoints(userId, negativePoints);
        }).toThrow('Cannot charge negative points');
      });

      it('0이거나 음수인 사용자 ID에 대해 에러를 발생시켜야 한다', () => {
        // Given: 잘못된 사용자 ID
        const invalidUserIds = [0, -1, -100];
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        invalidUserIds.forEach(userId => {
          expect(() => {
            service.addPoints(userId, 100);
          }).toThrow('Invalid user ID');
        });
      });

      it('정수가 아닌 포인트에 대해 에러를 발생시켜야 한다', () => {
        // Given: 소수점 포인트
        const userId = 1;
        const decimalPoints = 100.5;
        
        // When & Then: 소수점 포인트 충전 시 예외 발생
        expect(() => {
          service.addPoints(userId, decimalPoints);
        }).toThrow('Points must be integer');
      });
    });

    describe('경계값 테스트', () => {
      it('최대 정수값에 대해 에러를 발생시켜야 한다', () => {
        // Given: 최대 정수값 (메모리 문제 가능성)
        const userId = 1;
        const maxInt = Number.MAX_SAFE_INTEGER;
        
        // When & Then: 최대 정수값 시 에러 발생
        expect(() => {
          service.addPoints(userId, maxInt);
        }).toThrow('Points amount is too large');
      });

      it('매우 큰 사용자 ID에 대해 에러를 발생시켜야 한다', () => {
        // Given: 매우 큰 사용자 ID (성능 문제 가능성)
        const largeUserId = 999999999999;
        const points = 100;
        
        // When & Then: 매우 큰 사용자 ID 시 에러 발생
        expect(() => {
          service.addPoints(largeUserId, points);
        }).toThrow('User ID is too large');
      });
    });
  });
}); 