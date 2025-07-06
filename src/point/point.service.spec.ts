import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from './point.service';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { TransactionType } from './point.model';

describe('PointService', () => {
  let service: PointService;
  let mockUserPointTable: jest.Mocked<UserPointTable>;
  let mockPointHistoryTable: jest.Mocked<PointHistoryTable>;

  beforeEach(async () => {
    const mockUserPointTableProvider = {
      provide: UserPointTable,
      useValue: {
        selectById: jest.fn(),
        insertOrUpdate: jest.fn(),
      },
    };

    const mockPointHistoryTableProvider = {
      provide: PointHistoryTable,
      useValue: {
        insert: jest.fn(),
        selectAllByUserId: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        mockUserPointTableProvider,
        mockPointHistoryTableProvider,
      ],
    }).compile();

    service = module.get<PointService>(PointService);
    mockUserPointTable = module.get(UserPointTable);
    mockPointHistoryTable = module.get(PointHistoryTable);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addPoints (포인트 충전)', () => {
    describe('정상 케이스', () => {
      it('새로운 사용자에게 포인트를 추가하고 새로운 잔액을 반환해야 한다', async () => {
        // Given: 새로운 사용자에게 포인트 추가
        const userId = 1;
        const pointsToAdd = 1000; // 최소 충전 금액
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: userId,
          point: pointsToAdd,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: userId,
          amount: pointsToAdd,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        });
        
        // When: 포인트 추가
        const result = await service.addPoints(userId, pointsToAdd);
        
        // Then: 새로운 잔액 반환
        expect(result).toBe(1000);
        expect(mockUserPointTable.selectById).toHaveBeenCalledWith(userId);
        expect(mockUserPointTable.insertOrUpdate).toHaveBeenCalledWith(userId, pointsToAdd);
        expect(mockPointHistoryTable.insert).toHaveBeenCalledWith(
          userId,
          pointsToAdd,
          TransactionType.CHARGE,
          expect.any(Number)
        );
      });

      it('기존 사용자의 포인트를 누적해야 한다', async () => {
        // Given: 기존 사용자에게 포인트 추가
        const userId = 1;
        const initialPoints = 1000;
        const additionalPoints = 1000;
        
        mockUserPointTable.selectById
          .mockResolvedValueOnce({
            id: userId,
            point: 0,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: userId,
            point: initialPoints,
            updateMillis: Date.now(),
          });
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: userId,
          point: initialPoints + additionalPoints,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: userId,
          amount: additionalPoints,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        });
        
        // When: 첫 번째 충전
        await service.addPoints(userId, initialPoints);
        
        // When: 추가 포인트 충전
        const result = await service.addPoints(userId, additionalPoints);
        
        // Then: 누적된 잔액 반환
        expect(result).toBe(2000);
      });

      it('최소 충전 금액 미만일 때 에러를 발생시켜야 한다', async () => {
        // Given: 최소 충전 금액 미만
        const userId = 1;
        const minChargeAmount = 1000; // 최소 1000원
        const insufficientAmount = 500;
        
        // When & Then: 최소 충전 금액 미만 시 에러 발생
        await expect(service.addPoints(userId, insufficientAmount))
          .rejects.toThrow('Minimum charge amount is 1000 points');
      });

      it('여러 사용자를 독립적으로 처리해야 한다', async () => {
        // Given: 여러 사용자
        const user1 = 1;
        const user2 = 2;
        
        mockUserPointTable.selectById
          .mockResolvedValueOnce({
            id: user1,
            point: 0,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: user2,
            point: 0,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: user1,
            point: 1000,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: user2,
            point: 2000,
            updateMillis: Date.now(),
          });
        
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: 1,
          point: 1000,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: 1,
          amount: 1000,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        });
        
        // When: 각각 다른 포인트 추가
        await service.addPoints(user1, 1000);
        await service.addPoints(user2, 2000);
        
        mockUserPointTable.selectById
          .mockResolvedValueOnce({
            id: user1,
            point: 1000,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: user2,
            point: 2000,
            updateMillis: Date.now(),
          });
        
        mockUserPointTable.insertOrUpdate
          .mockResolvedValueOnce({
            id: user1,
            point: 2000,
            updateMillis: Date.now(),
          })
          .mockResolvedValueOnce({
            id: user2,
            point: 4000,
            updateMillis: Date.now(),
          });
        
        const result1 = await service.addPoints(user1, 1000);
        const result2 = await service.addPoints(user2, 2000);
        
        // Then: 각각 독립적으로 관리
        expect(result1).toBe(2000); // user1: 1000 + 1000
        expect(result2).toBe(4000); // user2: 2000 + 2000
      });
    });

    describe('정책 검증 (최대 잔고)', () => {
      it('최대 잔고까지 충전을 허용해야 한다', async () => {
        // Given: 최대 잔고까지 충전
        const userId = 1;
        const maxBalance = 1000000; // 100만 포인트
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: userId,
          point: maxBalance,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockResolvedValue({
          id: 1,
          userId: userId,
          amount: maxBalance,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        });
        
        // When: 최대 잔고까지 충전
        const result = await service.addPoints(userId, maxBalance);
        
        // Then: 최대 잔고까지 허용
        expect(result).toBe(maxBalance);
      });

      it('최대 잔고를 초과할 때 에러를 발생시켜야 한다', async () => {
        // Given: 최대 잔고 초과 충전
        const userId = 1;
        const maxBalance = 1000000;
        const exceedAmount = 1000001;
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: userId,
          point: 0,
          updateMillis: Date.now(),
        });
        
        // When & Then: 최대 잔고 초과 시 예외 발생
        await expect(service.addPoints(userId, exceedAmount))
          .rejects.toThrow('Maximum balance exceeded');
      });

      it('누적 잔고가 최대 잔고를 초과할 때 에러를 발생시켜야 한다', async () => {
        // Given: 기존 잔고 + 추가 충전이 최대 잔고 초과
        const userId = 1;
        const maxBalance = 1000000;
        const currentBalance = maxBalance - 1000; // 999000
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: userId,
          point: currentBalance,
          updateMillis: Date.now(),
        });
        
        // When & Then: 추가 충전 시 최대 잔고 초과 예외 발생
        await expect(service.addPoints(userId, 2000))
          .rejects.toThrow('Maximum balance exceeded');
      });
    });

    describe('예외 케이스', () => {
      it('음수 포인트에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 음수 포인트 충전 시도
        const userId = 1;
        const negativePoints = -50;
        
        // When & Then: 음수 포인트 충전 시 예외 발생
        await expect(service.addPoints(userId, negativePoints))
          .rejects.toThrow('Cannot charge negative points');
      });

      it('0이거나 음수인 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 잘못된 사용자 ID
        const invalidUserIds = [0, -1, -100];
        
        // When & Then: 잘못된 사용자 ID 시 예외 발생
        for (const userId of invalidUserIds) {
          await expect(service.addPoints(userId, 1000))
            .rejects.toThrow('Invalid user ID');
        }
      });

      it('정수가 아닌 포인트에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 소수점 포인트
        const userId = 1;
        const decimalPoints = 1000.5;
        
        // When & Then: 소수점 포인트 충전 시 예외 발생
        await expect(service.addPoints(userId, decimalPoints))
          .rejects.toThrow('Points must be integer');
      });
    });

    describe('경계값 테스트', () => {
      it('최대 정수값에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 최대 정수값 (메모리 문제 가능성)
        const userId = 1;
        const maxInt = Number.MAX_SAFE_INTEGER;
        
        // When & Then: 최대 정수값 시 에러 발생
        await expect(service.addPoints(userId, maxInt))
          .rejects.toThrow('Points amount is too large');
      });

      it('매우 큰 사용자 ID에 대해 에러를 발생시켜야 한다', async () => {
        // Given: 매우 큰 사용자 ID (성능 문제 가능성)
        const largeUserId = 999999999999;
        const points = 1000;
        
        // When & Then: 매우 큰 사용자 ID 시 에러 발생
        await expect(service.addPoints(largeUserId, points))
          .rejects.toThrow('User ID is too large');
      });
    });

    describe('데이터베이스 오류 케이스', () => {
      it('사용자 포인트 조회 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 데이터베이스 조회 실패
        const userId = 1;
        const points = 1000;
        
        mockUserPointTable.selectById.mockRejectedValue(
          new Error('Database connection failed')
        );
        
        // When & Then: 데이터베이스 오류 시 예외 발생
        await expect(service.addPoints(userId, points))
          .rejects.toThrow('Database connection failed');
      });

      it('포인트 업데이트 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 포인트 업데이트 실패
        const userId = 1;
        const points = 1000;
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockRejectedValue(
          new Error('Update failed')
        );
        
        // When & Then: 업데이트 실패 시 예외 발생
        await expect(service.addPoints(userId, points))
          .rejects.toThrow('Update failed');
      });

      it('포인트 내역 저장 실패 시 에러를 발생시켜야 한다', async () => {
        // Given: 포인트 내역 저장 실패
        const userId = 1;
        const points = 1000;
        
        mockUserPointTable.selectById.mockResolvedValue({
          id: userId,
          point: 0,
          updateMillis: Date.now(),
        });
        mockUserPointTable.insertOrUpdate.mockResolvedValue({
          id: userId,
          point: points,
          updateMillis: Date.now(),
        });
        mockPointHistoryTable.insert.mockRejectedValue(
          new Error('History save failed')
        );
        
        // When & Then: 내역 저장 실패 시 예외 발생
        await expect(service.addPoints(userId, points))
          .rejects.toThrow('History save failed');
      });
    });

    describe('네트워크 및 시스템 오류 케이스', () => {
      it('타임아웃 발생 시 에러를 발생시켜야 한다', async () => {
        // Given: 네트워크 타임아웃
        const userId = 1;
        const points = 1000;
        
        mockUserPointTable.selectById.mockRejectedValue(
          new Error('Request timeout')
        );
        
        // When & Then: 타임아웃 시 예외 발생
        await expect(service.addPoints(userId, points))
          .rejects.toThrow('Request timeout');
      });

      it('메모리 부족 시 에러를 발생시켜야 한다', async () => {
        // Given: 메모리 부족 상황
        const userId = 1;
        const points = 1000;
        
        mockUserPointTable.selectById.mockRejectedValue(
          new Error('Out of memory')
        );
        
        // When & Then: 메모리 부족 시 예외 발생
        await expect(service.addPoints(userId, points))
          .rejects.toThrow('Out of memory');
      });
    });
  });
}); 